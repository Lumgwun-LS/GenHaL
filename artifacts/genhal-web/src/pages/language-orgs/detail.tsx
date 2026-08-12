/**
 * /language-orgs/:id — Language Organisation dashboard.
 *
 * Public view for non-members: shows org profile + languages managed.
 * Member view: full dashboard with tabs for Members, Languages, and Pending Reviews.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  Building2, Users, Globe2, BookOpen, CheckCircle2, XCircle, Clock,
  Settings, UserPlus, Loader2, ArrowLeft, Shield, Eye, PenLine, UserCheck,
  ToggleLeft, ToggleRight, ChevronDown, FileText, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useListGenhalLanguages } from "@workspace/api-client-react";
import { getApiBaseUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgDetail {
  id: number; name: string; slug: string; description: string | null;
  logoUrl: string | null; website: string | null; contactEmail: string | null;
  country: string | null; foundedYear: number | null; status: string;
  adminNotes: string | null; createdAt: string;
}
interface OrgLanguage {
  languageCode: string; requiresApproval: boolean; isPrimaryOrg: boolean;
}
interface OrgMember {
  id: number; clerkUserId: string; role: string; status: string;
  invitedByClerkUserId: string | null; joinedAt: string | null;
}
interface Dataset {
  id: number; languageCode: string; type: string; title: string;
  fileName: string; fileSizeBytes: number | null; status: string;
  orgApprovalStatus: string; orgRejectionReason: string | null; createdAt: string;
}
interface Membership { role: string; status: string; }

const ROLE_META: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  owner:       { label: "Owner",       icon: Shield,    color: "text-amber-700 dark:text-amber-300" },
  admin:       { label: "Admin",       icon: Settings,  color: "text-blue-700 dark:text-blue-300" },
  reviewer:    { label: "Reviewer",    icon: Eye,       color: "text-purple-700 dark:text-purple-300" },
  contributor: { label: "Contributor", icon: PenLine,   color: "text-green-700 dark:text-green-300" },
  viewer:      { label: "Viewer",      icon: UserCheck, color: "text-gray-600 dark:text-muted-foreground" },
};

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orgId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const base = getApiBaseUrl();
  const { data: allLanguages } = useListGenhalLanguages();

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [languages, setLanguages] = useState<OrgLanguage[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  const canManage = membership && ["owner", "admin"].includes(membership.role);
  const canReview = membership && ["owner", "admin", "reviewer"].includes(membership.role);

  // ── Invite member state ────────────────────────────────────────────────────
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");
  const [inviting, setInviting] = useState(false);

  // ── Add language state ─────────────────────────────────────────────────────
  const [addLangCode, setAddLangCode] = useState("");
  const [addLangApproval, setAddLangApproval] = useState(false);
  const [addingLang, setAddingLang] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orgRes, memRes] = await Promise.all([
        fetch(`${base}/genhal/language-orgs/${orgId}`),
        fetch(`${base}/genhal/language-orgs/${orgId}/me`, { credentials: "include" }),
      ]);
      const orgData = await orgRes.json();
      setOrg(orgData.org);
      setLanguages(orgData.languages ?? []);
      setMembers(orgData.members ?? []);

      if (memRes.ok) {
        const memData = await memRes.json();
        setMembership(memData.membership);
      }
    } finally {
      setLoading(false);
    }
  }, [base, orgId]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`${base}/genhal/language-orgs/${orgId}/members`, { credentials: "include" });
    if (res.ok) { const d = await res.json(); setMembers(d.members ?? []); }
  }, [base, orgId]);

  const loadPending = useCallback(async () => {
    const res = await fetch(`${base}/genhal/language-orgs/${orgId}/pending-datasets`, { credentials: "include" });
    if (res.ok) { const d = await res.json(); setDatasets(d.datasets ?? []); }
  }, [base, orgId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (tab === "members" && canManage) void loadMembers();
    if (tab === "review" && canReview) void loadPending();
  }, [tab, canManage, canReview, loadMembers, loadPending]);

  // ── Invite ─────────────────────────────────────────────────────────────────
  const inviteMember = async () => {
    if (!inviteId.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`${base}/genhal/language-orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clerkUserId: inviteId.trim(), role: inviteRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "Member added" });
      setInviteId("");
      void loadMembers();
    } catch (err: any) {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  // ── Add language ───────────────────────────────────────────────────────────
  const addLanguage = async () => {
    if (!addLangCode) return;
    setAddingLang(true);
    try {
      const res = await fetch(`${base}/genhal/language-orgs/${orgId}/languages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ languageCode: addLangCode, requiresApproval: addLangApproval }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `${addLangCode.toUpperCase()} added` });
      setAddLangCode(""); setAddLangApproval(false);
      void load();
    } catch (err: any) {
      toast({ title: "Failed to add language", description: err.message, variant: "destructive" });
    } finally {
      setAddingLang(false);
    }
  };

  // ── Toggle approval ────────────────────────────────────────────────────────
  const toggleApproval = async (code: string, current: boolean) => {
    try {
      const res = await fetch(`${base}/genhal/language-orgs/${orgId}/languages/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requiresApproval: !current }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setLanguages((ls) => ls.map((l) => l.languageCode === code ? { ...l, requiresApproval: !current } : l));
      toast({ title: !current ? "Approval required for submissions" : "Approval disabled" });
    } catch (err: any) {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    }
  };

  // ── Review dataset ─────────────────────────────────────────────────────────
  const reviewDataset = async (datasetId: number, decision: "approved" | "rejected", reason?: string) => {
    try {
      const res = await fetch(`${base}/genhal/language-orgs/${orgId}/datasets/${datasetId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: decision === "approved" ? "✅ Approved for training" : "Dataset rejected" });
      setDatasets((ds) => ds.filter((d) => d.id !== datasetId));
    } catch (err: any) {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-amber-700 dark:text-amber-300" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-32 text-muted-foreground">
        Organisation not found.
        <Button variant="link" onClick={() => navigate("/language-orgs")}>Back to list</Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/language-orgs")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Language Organisations
      </button>

      {/* Org header */}
      <div className="flex items-start gap-5 bg-white rounded-2xl border p-6 dark:bg-card">
        {org.logoUrl ? (
          <img src={org.logoUrl} alt={org.name} className="h-16 w-16 rounded-xl object-cover border shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 dark:bg-amber-500/15">
            <BookOpen className="h-8 w-8 text-amber-700 dark:text-amber-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-serif font-bold">{org.name}</h1>
            <StatusBadge status={org.status} />
            {membership && (
              <Badge className={`text-[11px] ${ROLE_META[membership.role]?.color ?? ""} bg-transparent border`}>
                {ROLE_META[membership.role]?.label ?? membership.role}
              </Badge>
            )}
          </div>
          {org.country && <p className="text-sm text-muted-foreground mt-0.5">{org.country}</p>}
          {org.description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{org.description}</p>}
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
            {org.website && <a href={org.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{org.website}</a>}
            {org.contactEmail && <a href={`mailto:${org.contactEmail}`} className="hover:underline">{org.contactEmail}</a>}
            {org.foundedYear && <span>Est. {org.foundedYear}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
          {membership && <TabsTrigger value="members" className="rounded-lg">Members</TabsTrigger>}
          {canManage && <TabsTrigger value="languages" className="rounded-lg">Languages</TabsTrigger>}
          {canReview && (
            <TabsTrigger value="review" className="rounded-lg">
              Pending Review
              {datasets.length > 0 && (
                <Badge className="ml-1.5 bg-red-500 text-white text-[10px] h-4 px-1">{datasets.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Languages card */}
            <div className="bg-white rounded-2xl border p-5 space-y-3 dark:bg-card">
              <h3 className="font-semibold flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-amber-700 dark:text-amber-300" /> Languages managed
              </h3>
              {languages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No languages assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {languages.map((l) => (
                    <div key={l.languageCode} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {l.languageCode.toUpperCase()}
                        </Badge>
                        {l.isPrimaryOrg && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">Primary</Badge>
                        )}
                      </div>
                      {l.requiresApproval ? (
                        <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">Approval required</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Open submissions</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Members card */}
            <div className="bg-white rounded-2xl border p-5 space-y-3 dark:bg-card">
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-700 dark:text-amber-300" /> Team ({members.length})
              </h3>
              <div className="space-y-2">
                {members.slice(0, 6).map((m) => {
                  const meta = ROLE_META[m.role];
                  const Icon = meta?.icon ?? UserCheck;
                  return (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-stone-100 flex items-center justify-center dark:bg-white/10">
                          <Icon className={`h-3.5 w-3.5 ${meta?.color ?? "text-muted-foreground"}`} />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {m.clerkUserId.slice(0, 12)}…
                        </span>
                      </div>
                      <span className={`text-xs ${meta?.color ?? "text-muted-foreground"}`}>{meta?.label ?? m.role}</span>
                    </div>
                  );
                })}
                {members.length > 6 && (
                  <p className="text-xs text-muted-foreground">+{members.length - 6} more</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Members ── */}
        {membership && (
          <TabsContent value="members" className="space-y-4 mt-4">
            {/* Invite form — admins only */}
            {canManage && (
              <div className="bg-white rounded-2xl border p-5 space-y-4 dark:bg-card">
                <h3 className="font-semibold flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-amber-700 dark:text-amber-300" /> Invite team member
                </h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Clerk User ID</Label>
                    <Input
                      value={inviteId}
                      onChange={(e) => setInviteId(e.target.value)}
                      placeholder="user_xxxxxxxxxxxxxxxxxx"
                      className="rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="reviewer">Reviewer</SelectItem>
                        <SelectItem value="contributor">Contributor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  className="rounded-xl bg-amber-700 hover:bg-amber-800 text-white"
                  disabled={inviting || !inviteId.trim()}
                  onClick={inviteMember}
                >
                  {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Add member
                </Button>
              </div>
            )}

            {/* Member list */}
            <div className="bg-white rounded-2xl border divide-y dark:bg-card">
              {members.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No members yet.</p>
              ) : members.map((m) => {
                const meta = ROLE_META[m.role];
                const Icon = meta?.icon ?? UserCheck;
                return (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center dark:bg-white/10">
                        <Icon className={`h-4 w-4 ${meta?.color ?? "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-mono">{m.clerkUserId}</p>
                        {m.joinedAt && (
                          <p className="text-xs text-muted-foreground">
                            Joined {new Date(m.joinedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[11px] ${meta?.color ?? ""}`}>
                        {meta?.label ?? m.role}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        )}

        {/* ── Languages ── */}
        {canManage && (
          <TabsContent value="languages" className="space-y-4 mt-4">
            {/* Managed languages */}
            <div className="bg-white rounded-2xl border divide-y dark:bg-card">
              <div className="px-5 py-3 flex items-center justify-between bg-muted/30">
                <h3 className="font-semibold text-sm">Managed languages</h3>
              </div>
              {languages.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No languages added yet.</p>
              ) : languages.map((l) => (
                <div key={l.languageCode} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{l.languageCode.toUpperCase()}</Badge>
                    {l.isPrimaryOrg && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">Primary org</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Require approval</span>
                    <button
                      onClick={() => toggleApproval(l.languageCode, l.requiresApproval)}
                      className="text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-300"
                      title={l.requiresApproval ? "Disable approval requirement" : "Enable approval requirement"}
                    >
                      {l.requiresApproval
                        ? <ToggleRight className="h-6 w-6" />
                        : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add language */}
            <div className="bg-white rounded-2xl border p-5 space-y-4 dark:bg-card">
              <h3 className="font-semibold flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-amber-700 dark:text-amber-300" /> Add a language
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Language</Label>
                  <Select value={addLangCode} onValueChange={setAddLangCode}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select language…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(allLanguages ?? []).map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name} ({l.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addLangApproval}
                      onChange={(e) => setAddLangApproval(e.target.checked)}
                      className="accent-amber-700"
                    />
                    <span className="text-sm">Require approval for submissions</span>
                  </label>
                </div>
              </div>
              <Button
                className="rounded-xl bg-amber-700 hover:bg-amber-800 text-white"
                disabled={addingLang || !addLangCode}
                onClick={addLanguage}
              >
                {addingLang ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add language
              </Button>
            </div>

            {/* Info */}
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
              <p className="font-semibold mb-1">How approval works</p>
              <p className="leading-relaxed text-blue-800 dark:text-blue-300">
                When <strong>Require approval</strong> is enabled for a language, all new corpus
                datasets submitted by the community for that language are held as "pending" until
                a reviewer on your team approves them.  Only approved datasets count toward AI
                model training runs.  You can change this setting at any time.
              </p>
            </div>
          </TabsContent>
        )}

        {/* ── Pending Review ── */}
        {canReview && (
          <TabsContent value="review" className="space-y-4 mt-4">
            {datasets.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No datasets are waiting for review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {datasets.map((d) => (
                  <DatasetReviewCard key={d.id} dataset={d} onReview={reviewDataset} />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─── Dataset review card ──────────────────────────────────────────────────────

function DatasetReviewCard({
  dataset: d,
  onReview,
}: {
  dataset: Dataset;
  onReview: (id: number, decision: "approved" | "rejected", reason?: string) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    await onReview(d.id, "approved");
    setBusy(false);
  };
  const reject = async () => {
    setBusy(true);
    await onReview(d.id, "rejected", reason);
    setRejecting(false);
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-4 dark:bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 dark:bg-amber-500/10 dark:border-amber-500/30">
            <FileText className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <p className="font-medium">{d.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono">{d.languageCode.toUpperCase()}</Badge>
              <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
              {d.fileSizeBytes && (
                <span className="text-xs text-muted-foreground">{(d.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
              )}
              <span className="text-xs text-muted-foreground">
                Submitted {new Date(d.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] shrink-0 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      </div>

      {/* Rejection reason input */}
      {rejecting && (
        <div className="space-y-2">
          <Label className="text-xs">Rejection reason (optional — shown to submitter)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="rounded-xl resize-none text-sm"
            placeholder="e.g. Audio quality too low, incorrect language, incomplete transcript…"
          />
        </div>
      )}

      <div className="flex gap-2">
        {!rejecting ? (
          <>
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              disabled={busy}
              onClick={approve}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              Approve for training
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
            </Button>
          </>
        ) : (
          <>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              size="sm"
              disabled={busy}
              onClick={reject}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Confirm rejection
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    approved:  { label: "Approved",  className: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
    pending:   { label: "Pending",   className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
    rejected:  { label: "Rejected",  className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30" },
    suspended: { label: "Suspended", className: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-white/10 dark:text-muted-foreground dark:border-white/10" },
  };
  const cfg = map[status] ?? map.pending;
  return <Badge className={`text-[11px] ${cfg.className}`}>{cfg.label}</Badge>;
}
