import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSmsCampaigns,
  useCreateSmsCampaign,
  getListSmsCampaignsQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SmsCampaigns() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const listParams = { ...(vendorId ? { vendorId } : {}) };
  const { data: campaigns, isLoading } = useListSmsCampaigns(listParams);
  const createCampaign = useCreateSmsCampaign();

  const [open, setOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  function resetForm() { setCampaignName(""); setMessage(""); setScheduledAt(""); }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListSmsCampaignsQueryKey(listParams) });
  }

  async function handleCreate() {
    if (!vendorId || !campaignName || !message) return;
    try {
      await createCampaign.mutateAsync({
        data: {
          vendorId,
          name: campaignName,
          message,
          ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
          recipientCount: 0,
        },
      });
      toast.success("SMS campaign created");
      setOpen(false);
      resetForm();
      invalidate();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create campaign");
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "sent":      return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Sent</Badge>;
      case "scheduled": return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Scheduled</Badge>;
      case "draft":     return <Badge variant="outline">Draft</Badge>;
      default:          return <Badge>{status}</Badge>;
    }
  };

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SMS Campaigns</h1>
          <p className="text-muted-foreground">Direct text messaging to your customers.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!vendorId}>
          <Plus className="w-4 h-4 mr-2" /> Create SMS
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign Name</TableHead>
              <TableHead className="w-1/3">Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading SMS campaigns...</TableCell></TableRow>
            ) : campaigns?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No SMS campaigns yet. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              campaigns?.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1">{c.message}</TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-right font-medium">{c.recipientCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy") :
                     c.scheduledAt ? `Sched: ${format(new Date(c.scheduledAt), "MMM d")}` :
                     format(new Date(c.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create SMS Dialog */}
      <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create SMS Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Campaign Name *</Label>
              <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. July Sale Promo" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label>Message *</Label>
                <span className="text-xs text-muted-foreground">{charCount}/160 · {smsCount} SMS</span>
              </div>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="Your SMS message here... Keep it under 160 characters for 1 SMS."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Schedule (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave blank to save as draft.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCampaign.isPending || !campaignName || !message}>
              {createCampaign.isPending ? "Saving…" : scheduledAt ? "Schedule" : "Save as Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
