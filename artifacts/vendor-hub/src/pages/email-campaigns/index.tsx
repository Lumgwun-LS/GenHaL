import { useListEmailCampaigns, useGetEmailCampaignStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Plus, BarChart, Send } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function EmailCampaigns() {
  const { data: campaigns, isLoading } = useListEmailCampaigns();
  const { data: stats } = useGetEmailCampaignStats();

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'sent': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">Sent</Badge>;
      case 'scheduled': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Scheduled</Badge>;
      case 'draft': return <Badge variant="outline">Draft</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Campaigns</h1>
          <p className="text-muted-foreground">Broadcast updates and promotions to your audience.</p>
        </div>
        <Button asChild>
          <Link href="/email-campaigns/create">
            <Plus className="w-4 h-4 mr-2" />
            Create Campaign
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Send className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats?.totalSent || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Open Rate</CardTitle>
            <BarChart className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{(stats?.avgOpenRate || 0).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Click Rate</CardTitle>
            <BarChart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{(stats?.avgClickRate || 0).toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Performance</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading campaigns...</TableCell>
              </TableRow>
            ) : campaigns?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No campaigns found.
                </TableCell>
              </TableRow>
            ) : (
              campaigns?.map((c) => (
                <TableRow key={c.id} className="cursor-pointer group">
                  <TableCell>
                    <Link href={`/email-campaigns/${c.id}`} className="font-medium hover:text-primary transition-colors block">
                      {c.name}
                      <span className="block text-xs text-muted-foreground mt-1 font-normal">{c.subject}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-sm">{c.recipientCount.toLocaleString()}</TableCell>
                  <TableCell>
                    {c.status === 'sent' ? (
                      <div className="flex gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Opens: </span>
                          <span className="font-medium text-emerald-500">{c.openCount || 0}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Clicks: </span>
                          <span className="font-medium text-blue-500">{c.clickCount || 0}</span>
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground text-xs">-</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {c.sentAt ? format(new Date(c.sentAt), 'MMM d, yyyy') : 
                     c.scheduledAt ? `Sched: ${format(new Date(c.scheduledAt), 'MMM d, yyyy')}` : 
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