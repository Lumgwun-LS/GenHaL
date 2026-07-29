import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Trash2, Edit2, FileText, ToggleLeft, ToggleRight,
  ExternalLink, Users, Globe, GitBranch, CheckCircle2, XCircle, Clock,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PlatformPartner {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string;
  applicantName: string | null;
  pricingTier: string;
  baseUrl: string | null;
  gatewayOptIn: boolean;
  specSourceType: string;
  specUrl: string | null;
  gitProvider: string | null;
  gitRepo: string | null;
  gitBranch: string;
  gitSpecPath: string | null;
  docVersion: number;
  docGeneratedAt: string | null;
  docChangelog: string | null;
  enabled: boolean;
  applicationStatus: string;
  rejectionReason: string | null;
  createdAt: string;
  connectedVendors: number;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

const BLANK_FORM = {
  name: "", slug: "", description: "", contactEmail: "", websiteUrl: "", logoUrl: "",
  baseUrl: "", pricingTier: "free", gatewayOptIn: false,
  specSourceType: "url", specUrl: "",
  gitProvider: "", gitRepo: "", gitBranch: "main", gitSpecPath: "", gitInstallToken: "",
  specRawContent: "",
};

export default function PlatformPartnersPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlatformPartner | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [analyticsId, setAnalyticsId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ partners: PlatformPartner[] }>({
    queryKey: ["admin-platform-partners"],
    queryFn: () => apiFetch("/admin/platform-partners"),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["platform-partner-analytics", analyticsId],
    queryFn: () => apiFetch(`/platform-partners/${analyticsId}/analytics`),
    enabled: analyticsId !== null,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof BLANK_FORM) => apiFetch("/admin/platform-partners", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Platform partner created"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<typeof BLANK_FORM> }) =>
      apiFetch(`/admin/platform-partners/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/platform-partners/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/admin/platform-partners/${id}/enable`, { method: "POST", body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const genDocsMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/platform-partners/${id}/generate-docs`, { method: "POST" }),
    onSuccess: () => { toast.success("Doc generation queued — refresh in a few seconds"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/platform-partners/${id}/approve`, { method: "POST" }),
    onSuccess: () => { toast.success("Partner approved and enabled"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/admin/platform-partners/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { toast.success("Application rejected"); qc.invalidateQueries({ queryKey: ["admin-platform-partners"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = (key: string, val: unknown) => setForm((p) => ({ ...p, [key]: val }));

  function openCreate() {
    setForm(BLANK_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(p: PlatformPartner) {
    setForm({
      name: p.name, slug: p.slug, description: p.description ?? "", contactEmail: p.contactEmail,
      websiteUrl: p.websiteUrl ?? "", logoUrl: p.logoUrl ?? "", baseUrl: p.baseUrl ?? "",
      pricingTier: p.pricingTier, gatewayOptIn: p.gatewayOptIn,
      specSourceType: p.specSourceType, specUrl: p.specUrl ?? "",
      gitProvider: p.gitProvider ?? "", gitRepo: p.gitRepo ?? "",
      gitBranch: p.gitBranch, gitSpecPath: p.gitSpecPath ?? "", gitInstallToken: "",
      specRawContent: "",
    });
    setEditing(p);
    setShowForm(true);
  }

  function submitForm() {
    if (editing) {
      updateMutation.mutate({ id: editing.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const partners = data?.partners ?? [];
  const pending = partners.filter((p) => p.applicationStatus === "pending");
  const rest = partners.filter((p) => p.applicationStatus !== "pending");

  return (
    <div className="space-y-4">
      {/* Pending applications banner */}
      {pending.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-50/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="w-4 h-4" /> {pending.length} Pending Application{pending.length > 1 ? "s" : ""}
            </CardTitle>
            <CardDescription>Review and approve or reject self-registered platforms.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pending.map((p) => (
                <div key={p.id} className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.name}</span>
                      {p.applicantName && <span className="text-xs text-muted-foreground">by {p.applicantName}</span>}
                      <span className="text-xs text-muted-foreground">&lt;{p.contactEmail}&gt;</span>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {p.websiteUrl && <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /> {p.websiteUrl.replace(/^https?:\/\//, "")}</a>}
                      <span>Spec: {p.specSourceType}</span>
                      <span>Slug: <code className="font-mono">{p.slug}</code></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-400/40 hover:bg-emerald-50/10 h-8"
                      onClick={() => { if (confirm(`Approve "${p.name}"? This will enable their listing and trigger AI doc generation.`)) approveMutation.mutate(p.id); }}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5 h-8"
                      onClick={() => { const reason = prompt("Rejection reason (optional):") ?? ""; rejectMutation.mutate({ id: p.id, reason }); }}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Platform Partners</CardTitle>
            <CardDescription>
              Active platform partners in the Awa Biz Suite marketplace. Vendors discover and connect to them from their dashboard.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Platform
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
            </div>
          ) : rest.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No platform partners yet</p>
              <p className="text-sm mt-1">Click "Add Platform" to register the first one, or wait for self-service applications.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Spec Source</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Vendors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rest.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.logoUrl ? (
                          <img src={p.logoUrl} alt={p.name} className="w-7 h-7 rounded border object-contain" />
                        ) : (
                          <div className="w-7 h-7 rounded border bg-muted flex items-center justify-center">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">/docs/{p.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {p.specSourceType === "git" ? <GitBranch className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                        {p.specSourceType === "git" ? `${p.gitProvider}/${p.gitRepo}` : p.specSourceType}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.docVersion > 0 ? (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <FileText className="w-3 h-3" />
                          v{p.docVersion}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not generated</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {p.connectedVendors}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, enabled: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="w-7 h-7" title="Generate docs"
                          onClick={() => genDocsMutation.mutate(p.id)}>
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7" title="Analytics"
                          onClick={() => setAnalyticsId(analyticsId === p.id ? null : p.id)}>
                          <Users className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7" title="Edit"
                          onClick={() => openEdit(p)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                          title="Delete" onClick={() => {
                            if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id);
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Inline analytics card */}
      {analyticsId && analyticsData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analytics — {analyticsData.partner.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{analyticsData.stats.total}</p>
                <p className="text-xs text-muted-foreground">Total connections</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{analyticsData.stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{analyticsData.stats.errors}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
            {analyticsData.connections.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Auth type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Connected</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticsData.connections.map((c: { id: number; vendorId: number; authType: string; status: string; connectedAt: string; lastSeenAt: string | null; lastError: string | null }) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-mono">#{c.vendorId}</TableCell>
                      <TableCell className="text-xs">{c.authType}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : "destructive"} className="text-xs">{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(c.connectedAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit — ${editing.name}` : "Register Platform Partner"}</DialogTitle>
            <DialogDescription>
              Fill in the platform details. After saving, click "Generate Docs" to build the AI documentation portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Platform name *</Label>
                <Input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder="Awajimaa Schools" />
              </div>
              <div className="space-y-1.5">
                <Label>Slug * <span className="text-muted-foreground text-xs">(URL-safe)</span></Label>
                <Input value={form.slug} onChange={(e) => f("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="awajimaa-schools" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => f("description", e.target.value)} placeholder="What this platform does…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact email *</Label>
                <Input type="email" value={form.contactEmail} onChange={(e) => f("contactEmail", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pricing tier</Label>
                <Select value={form.pricingTier} onValueChange={(v) => f("pricingTier", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Website URL</Label>
                <Input value={form.websiteUrl} onChange={(e) => f("websiteUrl", e.target.value)} placeholder="https://awajimaaschools.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <Input value={form.logoUrl} onChange={(e) => f("logoUrl", e.target.value)} placeholder="https://…/logo.png" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>API Base URL</Label>
                <Input value={form.baseUrl} onChange={(e) => f("baseUrl", e.target.value)} placeholder="https://api.awajimaaschools.com" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.gatewayOptIn} onCheckedChange={(v) => f("gatewayOptIn", v)} id="gateway" />
                <Label htmlFor="gateway" className="cursor-pointer">
                  Route via awajimaaai.com gateway
                </Label>
              </div>
            </div>

            {/* Spec source */}
            <div className="space-y-3 border rounded-lg p-4">
              <div className="space-y-1.5">
                <Label>API spec source</Label>
                <Select value={form.specSourceType} onValueChange={(v) => f("specSourceType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="url">Hosted URL (OpenAPI JSON/YAML)</SelectItem>
                    <SelectItem value="git">Git repository (GitHub / GitLab)</SelectItem>
                    <SelectItem value="upload">Manual upload / paste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.specSourceType === "url" && (
                <div className="space-y-1.5">
                  <Label>Spec URL</Label>
                  <Input value={form.specUrl} onChange={(e) => f("specUrl", e.target.value)} placeholder="https://api.platform.com/openapi.json" />
                </div>
              )}

              {form.specSourceType === "git" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Git provider</Label>
                      <Select value={form.gitProvider} onValueChange={(v) => f("gitProvider", v)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="github">GitHub</SelectItem>
                          <SelectItem value="gitlab">GitLab</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Repository <span className="text-muted-foreground text-xs">(owner/repo)</span></Label>
                      <Input value={form.gitRepo} onChange={(e) => f("gitRepo", e.target.value)} placeholder="awajimaa/schools-api" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Branch</Label>
                      <Input value={form.gitBranch} onChange={(e) => f("gitBranch", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Spec file path</Label>
                      <Input value={form.gitSpecPath} onChange={(e) => f("gitSpecPath", e.target.value)} placeholder="docs/openapi.yaml" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>OAuth access token <span className="text-muted-foreground text-xs">(repo read scope)</span></Label>
                    <Input type="password" value={form.gitInstallToken} onChange={(e) => f("gitInstallToken", e.target.value)} placeholder={editing ? "Leave blank to keep existing token" : "ghp_… or glpat-…"} />
                  </div>
                </div>
              )}

              {form.specSourceType === "upload" && (
                <div className="space-y-1.5">
                  <Label>Paste OpenAPI YAML or JSON</Label>
                  <Textarea
                    rows={8}
                    className="font-mono text-xs"
                    value={form.specRawContent}
                    onChange={(e) => f("specRawContent", e.target.value)}
                    placeholder={'openapi: "3.0.0"\ninfo:\n  title: My API\n  version: "1.0.0"\n...'}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            <Button
              disabled={!form.name || !form.slug || !form.contactEmail || createMutation.isPending || updateMutation.isPending}
              onClick={submitForm}
            >
              {editing ? "Save changes" : "Register platform"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
