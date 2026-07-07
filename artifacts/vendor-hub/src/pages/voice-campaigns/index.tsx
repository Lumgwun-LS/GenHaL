import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, Plus, PlayCircle, BarChart2, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useListVendors } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Campaign = {
  id: number;
  name: string;
  script: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  totalCalls: number;
  answeredCalls: number;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:     { label: "Draft",     variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "outline" },
  running:   { label: "Running",   variant: "default" },
  completed: { label: "Completed", variant: "default" },
  paused:    { label: "Paused",    variant: "secondary" },
};

export default function VoiceCampaignsPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const qc = useQueryClient();

  // Find the vendor that belongs to this user
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id) ?? vendors?.[0];
  const vendorId = myVendor?.id;

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["voice-campaigns", vendorId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    enabled: Boolean(vendorId),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [script, setScript] = useState("Hello {{name}}! This is a call from [Your Business Name]. We wanted to reach out to share some exciting news with you. Please visit our website or call us back for more details. Have a great day!");
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState<number | null>(null);

  async function handleCreate() {
    if (!vendorId || !name.trim() || !script.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, script }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to create campaign");
        return;
      }
      toast.success("Campaign created");
      setOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["voice-campaigns", vendorId] });
    } finally {
      setCreating(false);
    }
  }

  async function handleLaunch(campaignId: number) {
    if (!vendorId) return;
    setLaunching(campaignId);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns/${campaignId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to launch"); return; }
      toast.success(data.message ?? "Campaign launched!");
      qc.invalidateQueries({ queryKey: ["voice-campaigns", vendorId] });
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 w-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Phone className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Voice Campaigns</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Place personalised AI voice calls to your leads. Use <code className="text-xs bg-muted px-1 rounded">{"{{name}}"}</code> in your script to personalise each call.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-700 dark:text-amber-400 flex gap-3">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">Voice calls require Twilio credentials</p>
          <p className="text-xs mt-0.5 opacity-80">An admin needs to configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER. Campaigns can be created and queued in the meantime.</p>
        </div>
      </div>

      {/* Campaign list */}
      <Card>
        <CardHeader>
          <CardTitle>Your Campaigns</CardTitle>
          <CardDescription>Campaigns target all your leads that have an E.164 phone number (starting with +).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading campaigns…</div>
          ) : !campaigns?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <Phone className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No campaigns yet.</p>
              <p className="text-xs mt-1">Create your first campaign to start making AI voice calls to your leads.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Answer Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const badge = STATUS_BADGE[c.status] ?? { label: c.status, variant: "secondary" as const };
                  const answerRate = c.totalCalls > 0 ? Math.round((c.answeredCalls / c.totalCalls) * 100) : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{c.script}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                          {c.totalCalls > 0 ? (
                            <span><span className="text-emerald-500">{c.answeredCalls}</span> / {c.totalCalls}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {answerRate !== null ? (
                          <div className="flex items-center gap-1 text-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            {answerRate}%
                          </div>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={c.status === "running" || launching === c.id}
                            onClick={() => handleLaunch(c.id)}
                            className="flex items-center gap-1.5"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            {launching === c.id ? "Launching…" : "Launch"}
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/voice-campaigns/${c.id}`}>
                              <BarChart2 className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" /> New Voice Campaign
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Campaign Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. July Promo Outreach" />
            </div>
            <div className="space-y-1.5">
              <Label>Call Script</Label>
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={6}
                placeholder="Hello {{name}}! This is..."
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{{name}}"}</code> to personalise each call with the lead's name. Keep it conversational — this is what the AI voice will say word-for-word.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
