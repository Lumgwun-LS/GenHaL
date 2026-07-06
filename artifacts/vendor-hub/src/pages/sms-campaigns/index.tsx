import { useListSmsCampaigns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus } from "lucide-react";
import { format } from "date-fns";

export default function SmsCampaigns() {
  const { data: campaigns, isLoading } = useListSmsCampaigns();

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'sent': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Sent</Badge>;
      case 'scheduled': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Scheduled</Badge>;
      case 'draft': return <Badge variant="outline">Draft</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SMS Campaigns</h1>
          <p className="text-muted-foreground">Direct text messaging to your customers.</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create SMS
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
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading SMS campaigns...</TableCell>
              </TableRow>
            ) : campaigns?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No SMS campaigns found.
                </TableCell>
              </TableRow>
            ) : (
              campaigns?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1">{c.message}</TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-right font-medium">{c.recipientCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {c.sentAt ? format(new Date(c.sentAt), 'MMM d, yyyy') : 
                     c.scheduledAt ? `Sched: ${format(new Date(c.scheduledAt), 'MMM d')}` : 
                     format(new Date(c.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}