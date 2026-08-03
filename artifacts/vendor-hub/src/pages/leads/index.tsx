import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListLeads,
  useGetLeadsStats,
  useCreateLead,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, Users, Globe, Instagram, Facebook,
  Twitter, Link2, FileText, ShoppingBag, BarChart3,
  ArrowUpRight, Kanban, Settings, Eye, Smartphone,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { Lead } from "@workspace/api-zod";
import { PersonDrawer } from "./person-drawer";
import { PipelineView } from "./pipeline-view";
import { FormsTab } from "./forms-tab";
import { UtmTab } from "./utm-tab";
import { SetupTab } from "./setup-tab";

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

const CHANNELS = [
  { value: "website",    label: "Website",     icon: <Globe className="w-3.5 h-3.5" /> },
  { value: "instagram",  label: "Instagram",   icon: <Instagram className="w-3.5 h-3.5" /> },
  { value: "facebook",   label: "Facebook",    icon: <Facebook className="w-3.5 h-3.5" /> },
  { value: "twitter",    label: "Twitter/X",   icon: <Twitter className="w-3.5 h-3.5" /> },
  { value: "google_ads", label: "Google Ads",  icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { value: "utm_link",   label: "UTM Link",    icon: <Link2 className="w-3.5 h-3.5" /> },
  { value: "form",       label: "Form",        icon: <FileText className="w-3.5 h-3.5" /> },
  { value: "order",      label: "Order",       icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { value: "manual",     label: "Manual",      icon: <Plus className="w-3.5 h-3.5" /> },
  { value: "other",      label: "Other",       icon: null },
  { value: "app_store",  label: "App Store",   icon: <Smartphone className="w-3.5 h-3.5" /> },
];

const CHANNEL_MAP: Record<string, { label: string; icon: React.ReactNode }> = Object.fromEntries(
  CHANNELS.map((c) => [c.value, { label: c.label, icon: c.icon }])
);

const STATUS_COLORS: Record<string, string> = {
  converted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  qualified: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  contacted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

function ChannelBadge({ channel }: { channel: string | null | undefined }) {
  const ch = channel ?? "manual";
  const info = CHANNEL_MAP[ch] ?? { label: ch, icon: null };
  return (
    <Badge variant="outline" className="gap-1 text-xs py-0">
      {info.icon}
      {info.label}
    </Badge>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className={`text-xs font-medium ${color ?? "text-muted-foreground"}`}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-3xl font-bold tracking-tight">{value.toLocaleString()}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PeopleCRM() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: leads = [], isLoading } = useListLeads({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const { data: stats } = useGetLeadsStats();
  const createLead = useCreateLead();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newChannel, setNewChannel] = useState("manual");
  const [newNotes, setNewNotes] = useState("");

  function resetForm() {
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewCompany(""); setNewChannel("manual"); setNewNotes("");
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListLeadsQueryKey({}) });
  }

  async function handleCreate() {
    if (!vendorId || !newName.trim()) return;
    try {
      await createLead.mutateAsync({
        data: {
          vendorId,
          name: newName,
          ...(newEmail ? { email: newEmail } : {}),
          ...(newPhone ? { phone: newPhone } : {}),
          ...(newCompany ? { company: newCompany } : {}),
          channel: newChannel,
          source: newChannel,
          ...(newNotes ? { notes: newNotes } : {}),
        },
      });
      toast.success("Person added to CRM");
      setAddOpen(false);
      resetForm();
      invalidate();
    } catch { toast.error("Failed to add person"); }
  }

  function openPerson(lead: Lead) {
    setSelectedPerson(lead);
    setDrawerOpen(true);
  }

  // Client-side channel filter (channel filter isn't in the API query params)
  const filteredLeads = leads.filter((l) => {
    if (channelFilter === "all") return true;
    const ch = l.channel ?? l.source ?? "manual";
    return ch === channelFilter;
  });

  // Channel breakdown from stats
  const channelBreakdown = stats?.bySource ?? [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            People & CRM
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Everyone who's visited your website, seen your ads, or interacted with your brand.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!vendorId}>
          <Plus className="w-4 h-4 mr-2" />Add Person
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard label="Total People" value={stats?.totalLeads ?? 0} />
        <StatCard label="New (30d)" value={stats?.newLeads ?? 0} color="text-blue-500" />
        <StatCard label="Qualified" value={stats?.qualifiedLeads ?? 0} color="text-violet-500" />
        <StatCard label="Converted" value={stats?.convertedLeads ?? 0} color="text-emerald-500" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="people" className="space-y-5">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="people" className="gap-1.5 text-xs sm:text-sm">
            <Users className="w-4 h-4" />People
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1.5 text-xs sm:text-sm">
            <Kanban className="w-4 h-4" />Pipeline
          </TabsTrigger>
          <TabsTrigger value="forms" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="w-4 h-4" />Lead Forms
          </TabsTrigger>
          <TabsTrigger value="utm" className="gap-1.5 text-xs sm:text-sm">
            <Link2 className="w-4 h-4" />UTM Links
          </TabsTrigger>
          <TabsTrigger value="setup" className="gap-1.5 text-xs sm:text-sm">
            <Settings className="w-4 h-4" />Setup
          </TabsTrigger>
        </TabsList>

        {/* ── PEOPLE LIST ── */}
        <TabsContent value="people">
          <Card>
            <div className="p-4 border-b flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search by name, email…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32 h-9 text-sm">
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="hidden md:table-cell">Attribution</TableHead>
                  <TableHead className="hidden md:table-cell">Views</TableHead>
                  <TableHead className="text-right">Last Seen</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Loading people…</TableCell></TableRow>
                ) : filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="font-medium">No people yet</p>
                      <p className="text-sm text-muted-foreground mt-1">Install the tracking script or create UTM links to start capturing visitors.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openPerson(lead)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center shrink-0">
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{lead.name}</div>
                            <div className="text-xs text-muted-foreground">{lead.email ?? lead.phone ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={lead.channel ?? lead.source} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[lead.status] ?? ""}`}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {lead.utmCampaign ? (
                          <span className="font-medium text-foreground">{lead.utmCampaign}</span>
                        ) : lead.landingPage ? (
                          <span className="truncate max-w-[160px] block">{lead.landingPage}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {lead.pageViews > 0 ? (
                          <span className="font-medium">{lead.pageViews}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {lead.lastSeenAt
                          ? formatDistanceToNow(new Date(lead.lastSeenAt), { addSuffix: true })
                          : format(new Date(lead.createdAt), "MMM d")}
                      </TableCell>
                      <TableCell>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {filteredLeads.length > 0 && (
              <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                {filteredLeads.length} {filteredLeads.length === 1 ? "person" : "people"}
                {channelFilter !== "all" && ` · filtered by ${CHANNEL_MAP[channelFilter]?.label ?? channelFilter}`}
              </div>
            )}
          </Card>

          {/* Channel breakdown */}
          {channelBreakdown.length > 0 && (
            <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
              {channelBreakdown.slice(0, 5).map(({ source, count }) => {
                const info = CHANNEL_MAP[source] ?? { label: source, icon: null };
                return (
                  <button
                    key={source}
                    onClick={() => setChannelFilter(channelFilter === source ? "all" : source)}
                    className={`rounded-lg border p-3 text-left hover:border-primary/40 transition-colors ${channelFilter === source ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                      {info.icon ?? <Globe className="w-3.5 h-3.5" />}
                      <span className="text-xs truncate">{info.label}</span>
                    </div>
                    <div className="text-xl font-bold">{count}</div>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── PIPELINE ── */}
        <TabsContent value="pipeline">
          <PipelineView leads={leads} onSelect={openPerson} />
        </TabsContent>

        {/* ── LEAD FORMS ── */}
        <TabsContent value="forms">
          {vendorId && <FormsTab vendorId={vendorId} />}
        </TabsContent>

        {/* ── UTM LINKS ── */}
        <TabsContent value="utm">
          <UtmTab />
        </TabsContent>

        {/* ── SETUP ── */}
        <TabsContent value="setup">
          {vendorId && <SetupTab vendorId={vendorId} />}
        </TabsContent>
      </Tabs>

      {/* Add Person Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) resetForm(); setAddOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a Person</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Amaka Obi" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={newChannel} onValueChange={setNewChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending || !newName.trim()}>
              {createLead.isPending ? "Adding…" : "Add Person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Person detail drawer */}
      <PersonDrawer
        person={selectedPerson}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => invalidate()}
      />
    </div>
  );
}
