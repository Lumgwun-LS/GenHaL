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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Plus, PlayCircle, BarChart2, Clock, CheckCircle2, AlertCircle, Pencil, XCircle } from "lucide-react";
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
  failed:    { label: "Failed",    variant: "destructive" },
};

/** Converts an ISO string to the `YYYY-MM-DDTHH:mm` value a <input type="datetime-local"> expects, in local time. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function VoiceCampaignsPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const qc = useQueryClient();

  // Find the vendor that belongs to this user
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const [adminVendorId, setAdminVendorId] = useState<number | undefined>(undefined);
  const vendorId = myVendor?.id ?? adminVendorId;

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["voice-campaigns", vendorId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    enabled: Boolean(vendorId),
  });

  const { data: voiceStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["voice-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/voice-status`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [script, setScript] = useState("Hello {{name}}! This is a call from [Your Business Name]. We wanted to reach out to share some exciting news with you. Please visit our website or call us back for more details. Have a great day!");
  const [scheduledAt, setScheduledAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState<number | null>(null);

  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleCreate() {
    if (!vendorId || !name.trim() || !script.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          script,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to create campaign");
        return;
      }
      toast.success(scheduledAt ? "Campaign scheduled" : "Campaign created");
      setOpen(false);
      setName("");
      setScheduledAt("");
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

  function openEdit(c: Campaign) {
    setEditing(c);
    setEditScheduledAt(toDatetimeLocalValue(c.scheduledAt));
  }

  async function handleSaveSchedule() {
    if (!vendorId || !editing) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to update schedule"); return; }
      toast.success(editScheduledAt ? "Schedule updated" : "Schedule removed — campaign is now a draft");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["voice-campaigns", vendorId] });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCancelSchedule(c: Campaign) {
    if (!vendorId) return;
    const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/voice-campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scheduledAt: null, status: "paused" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error ?? "Failed to cancel"); return; }
    toast.success("Scheduled launch cancelled");
    qc.invalidateQueries({ queryKey: ["voice-campaigns", vendorId] });
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
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2" disabled={!vendorId}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {!myVendor && vendors && vendors.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 shrink-0">Admin mode — operating as:</span>
          <Select value={adminVendorId ? String(adminVendorId) : ""} onValueChange={(v) => setAdminVendorId(Number(v))}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
            <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {/* Twilio status callout — only shown when not configured */}
      {voiceStatus && !voiceStatus.configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-700 dark:text-amber-400 flex gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Voice calls require a phone number</p>
            <p className="text-xs mt-0.5 opacity-80">The Twilio integration is already connected. An admin just needs to add <code className="bg-black/10 px-1 rounded">TWILIO_PHONE_NUMBER</code> to Replit Secrets. Campaigns can be created and queued in the meantime.</p>
          </div>
        </div>
      )}
      {voiceStatus?.configured && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4 text-sm text-emerald-700 dark:text-emerald-400 flex gap-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p><strong>Twilio connected.</strong> Voice campaigns are active and ready to launch.</p>
        </div>
      )}

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
                  <TableHead>Scheduled For</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Answer Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const badge = STATUS_BADGE[c.status] ?? { label: c.status, variant: "secondary" as const };
                  const answerRate = c.totalCalls > 0 ? Math.round((c.answeredCalls / c.totalCalls) * 100) : null;
                  const editable = c.status !== "running" && c.status !== "completed";
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
                        {c.scheduledAt ? (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{formatScheduledAt(c.scheduledAt)}</span>
                          </div>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
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
                          {editable && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title="Edit schedule">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {c.status === "scheduled" && (
                            <Button size="sm" variant="ghost" onClick={() => handleCancelSchedule(c)} title="Cancel scheduled launch">
                              <XCircle className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={c.status === "running" || launching === c.id}
                            onClick={() => handleLaunch(c.id)}
                            className="flex items-center gap-1.5"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            {launching === c.id ? "Launching…" : "Launch Now"}
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
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Schedule for later (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to save as a draft you launch manually. If set, the campaign auto-launches at this time — you can change or cancel it any time before then.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : scheduledAt ? "Schedule Campaign" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit schedule dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" /> Edit Schedule — {editing?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Launch Date & Time</Label>
              <Input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Clear this field to unschedule the campaign — it will go back to draft and won't auto-launch.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveSchedule} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
