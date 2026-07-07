import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Phone, CheckCircle2, XCircle, Clock, AlertCircle, Mic } from "lucide-react";
import { useListVendors } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type CampaignCall = {
  id: number;
  leadName: string;
  phone: string;
  status: string;
  durationSeconds: number | null;
  callSid: string | null;
  initiatedAt: string;
};

type CampaignDetail = {
  id: number;
  name: string;
  script: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  stats: { totalCalls: number; answeredCalls: number; answerRate: number; avgDurationSeconds: number };
  calls: CampaignCall[];
};

const CALL_STATUS_ICON: Record<string, React.ReactNode> = {
  completed:   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  "no-answer": <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
  busy:        <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />,
  failed:      <XCircle className="w-3.5 h-3.5 text-destructive" />,
  canceled:    <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
  ringing:     <Phone className="w-3.5 h-3.5 text-blue-500 animate-pulse" />,
  queued:      <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
};

export default function VoiceCampaignDetail() {
  const params = useParams<{ id: string }>();
  const campaignId = Number(params.id);
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id) ?? vendors?.[0];
  const vendorId = myVendor?.id;

  const { data: campaign, isLoading } = useQuery<CampaignDetail>({
    queryKey: ["voice-campaign", vendorId, campaignId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns/${campaignId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaign");
      return res.json();
    },
    enabled: Boolean(vendorId && campaignId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5000 : false),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading campaign…</div>;
  if (!campaign) return <div className="p-8 text-destructive">Campaign not found.</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 w-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/voice-campaigns"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant={campaign.status === "completed" ? "default" : campaign.status === "running" ? "default" : "secondary"}>
              {campaign.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Created {new Date(campaign.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Calls", value: campaign.stats.totalCalls, icon: <Phone className="w-4 h-4 text-muted-foreground" /> },
          { label: "Answered", value: campaign.stats.answeredCalls, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
          { label: "Answer Rate", value: `${campaign.stats.answerRate}%`, icon: <CheckCircle2 className="w-4 h-4 text-primary" /> },
          { label: "Avg Duration", value: campaign.stats.avgDurationSeconds > 0 ? `${campaign.stats.avgDurationSeconds}s` : "—", icon: <Clock className="w-4 h-4 text-muted-foreground" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
              {s.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Script */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4" /> Call Script
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic leading-relaxed">"{campaign.script}"</p>
        </CardContent>
      </Card>

      {/* Individual calls */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Calls</CardTitle>
          <CardDescription>Real-time status of every call placed in this campaign.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!campaign.calls.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No calls placed yet. Launch the campaign to start calling.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Initiated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.calls.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.leadName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs capitalize">
                        {CALL_STATUS_ICON[c.status] ?? <Clock className="w-3.5 h-3.5" />}
                        {c.status.replace(/-/g, " ")}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.durationSeconds != null ? `${c.durationSeconds}s` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(c.initiatedAt).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
