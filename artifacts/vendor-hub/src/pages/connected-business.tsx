/**
 * Connected Business dashboard — vendor-facing page where platform/website owners
 * manage their Connected Business profile: connect VCS, set base URL, trigger
 * AI doc generation, and view/share their docs.
 *
 * Accessed at /connected-business (auth-gated).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  GitBranch, Zap, Globe, Link2, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Eye, Copy, Settings,
  Github, ArrowRight, BookOpen, Wifi, WifiOff,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Profile = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  baseUrl: string | null;
  gatewayOptIn: boolean;
  specSourceType: string;
  specUrl: string | null;
  gitProvider: string | null;
  gitRepo: string | null;
  gitBranch: string | null;
  gitSpecPath: string | null;
  hasGitToken: boolean;
  applicationStatus: string;
  enabled: boolean;
  docVersion: number;
  docGeneratedAt: string | null;
  docChangelog: string | null;
  createdAt: string;
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
}

// ─── Setup Form ──────────────────────────────────────────────────────────────

function SetupForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "", description: "", websiteUrl: "", contactEmail: "", baseUrl: "", gatewayOptIn: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/connected-business/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Setup failed"); }
      return res.json();
    },
    onSuccess: () => { toast.success("Connected Business profile created!"); onCreated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-lg mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
            <GitBranch className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Set up your Connected Business</h2>
          <p className="text-sm text-muted-foreground">
            Tell us about your platform — AI will generate your API documentation from your code.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Platform / Business Name *</Label>
            <Input placeholder="e.g. Awajimaa Schools" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Description</Label>
            <Textarea placeholder="What does your platform do?" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="resize-none" />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Website URL</Label>
            <Input placeholder="https://yourplatform.com" value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">API Base URL</Label>
            <Input placeholder="https://api.yourplatform.com  (leave blank to use awajimaaai.com)" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">The root URL your API endpoints resolve against.</p>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-muted/30">
            <Switch checked={form.gatewayOptIn} onCheckedChange={v => setForm(f => ({ ...f, gatewayOptIn: v }))} />
            <div>
              <p className="text-sm font-semibold">Route via awajimaaai.com gateway</p>
              <p className="text-xs text-muted-foreground">Let Awa Biz Suite proxy API calls to your platform.</p>
            </div>
          </div>
        </div>

        <Button className="w-full h-11 font-bold gap-2" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Create Profile
        </Button>
      </motion.div>
    </div>
  );
}

// ─── VCS Connect Panel ────────────────────────────────────────────────────────

function VCSPanel({ profile, onRefresh }: { profile: Profile; onRefresh: () => void }) {
  const [form, setForm] = useState({
    gitProvider: profile.gitProvider ?? "github",
    gitRepo: profile.gitRepo ?? "",
    gitBranch: profile.gitBranch ?? "main",
    gitSpecPath: profile.gitSpecPath ?? "",
    accessToken: "",
  });

  const vcsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/connected-business/vcs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "VCS connect failed"); }
      return res.json();
    },
    onSuccess: () => { toast.success("Version control connected!"); setForm(f => ({ ...f, accessToken: "" })); onRefresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/connected-business/vcs`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Disconnect failed"); }
      return res.json();
    },
    onSuccess: () => { toast.success("VCS disconnected"); onRefresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isConnected = !!profile.gitRepo;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-muted/20">
        {isConnected ? (
          <><Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold capitalize">{profile.gitProvider} connected</p>
            <p className="text-xs text-muted-foreground truncate">{profile.gitRepo} ({profile.gitBranch ?? "main"})</p>
          </div>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
            {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Disconnect"}
          </Button></>
        ) : (
          <><WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No version control connected yet</p></>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Provider</Label>
          <Select value={form.gitProvider} onValueChange={v => setForm(f => ({ ...f, gitProvider: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="github"><div className="flex items-center gap-2"><Github className="w-3.5 h-3.5" /> GitHub</div></SelectItem>
              <SelectItem value="gitlab">GitLab</SelectItem>
              <SelectItem value="bitbucket">Bitbucket</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Branch</Label>
          <Input placeholder="main" value={form.gitBranch} onChange={e => setForm(f => ({ ...f, gitBranch: e.target.value }))} />
        </div>
      </div>

      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Repository (owner/repo)</Label>
        <Input placeholder="yourorg/your-api" value={form.gitRepo} onChange={e => setForm(f => ({ ...f, gitRepo: e.target.value }))} />
      </div>

      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">
          OpenAPI spec path <span className="font-normal text-muted-foreground">(optional — leave blank to let AI scan your whole codebase)</span>
        </Label>
        <Input placeholder="docs/openapi.yaml" value={form.gitSpecPath} onChange={e => setForm(f => ({ ...f, gitSpecPath: e.target.value }))} />
      </div>

      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">
          Personal Access Token {profile.hasGitToken ? <span className="text-emerald-400 font-normal">(saved — leave blank to keep)</span> : <span className="text-amber-400 font-normal">(required for private repos)</span>}
        </Label>
        <Input
          type="password"
          placeholder={profile.hasGitToken ? "Leave blank to keep existing token" : "ghp_… / glpat-… / App Password"}
          value={form.accessToken}
          onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground mt-1">Stored encrypted with AES-256-GCM. Needs repo read scope.</p>
      </div>

      <Button className="w-full h-10 font-bold gap-2" onClick={() => vcsMutation.mutate()} disabled={!form.gitRepo.trim() || vcsMutation.isPending}>
        {vcsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
        {isConnected ? "Update VCS Connection" : "Connect Repository"}
      </Button>
    </div>
  );
}

// ─── Docs Panel ───────────────────────────────────────────────────────────────

function DocsPanel({ profile, onRefresh }: { profile: Profile; onRefresh: () => void }) {
  const docsUrl = `${window.location.origin}${BASE}/docs/${profile.slug}`;
  const toolkitUrl = `${window.location.origin}${BASE}/partner/${profile.slug}`;
  const embedHtml = `<a href="${toolkitUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:8px;background:#7c3aed;color:white;text-decoration:none;font-weight:600;font-size:14px;">Connect on Awa Biz Suite</a>`;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/connected-business/generate-docs`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Generation failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Docs generated! Version ${data.docVersion}`);
      if (data.changelog) toast.info(`Changelog: ${data.changelog.slice(0, 100)}`);
      onRefresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasSpec = profile.gitRepo || profile.specUrl;

  return (
    <div className="space-y-5">
      {/* Generate button */}
      <div className="p-5 rounded-xl border border-primary/25 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold mb-1">AI Documentation Generation</h3>
            {profile.docVersion > 0 ? (
              <p className="text-xs text-muted-foreground">
                Version {profile.docVersion} &middot; Last generated{" "}
                {profile.docGeneratedAt ? new Date(profile.docGeneratedAt).toLocaleString() : "—"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Not generated yet — connect your repo first, then click Generate.</p>
            )}
            {profile.docChangelog && (
              <p className="text-xs text-muted-foreground mt-1 italic">Latest changelog: {profile.docChangelog.slice(0, 120)}…</p>
            )}
          </div>
        </div>
        <Button
          className="w-full mt-4 h-10 font-bold gap-2"
          onClick={() => generateMutation.mutate()}
          disabled={!hasSpec || generateMutation.isPending}
          variant={profile.docVersion > 0 ? "outline" : "default"}
        >
          {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {profile.docVersion > 0 ? "Regenerate Docs" : "Generate Docs"}
        </Button>
        {!hasSpec && (
          <p className="text-xs text-amber-400 mt-2 text-center">Connect a Git repo or spec URL first (VCS tab).</p>
        )}
      </div>

      {/* Links */}
      {profile.docVersion > 0 && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-border/40 bg-card/60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Docs URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted/60 px-3 py-2 rounded-lg truncate">{docsUrl}</code>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(docsUrl)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
              </a>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/40 bg-card/60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Partner Toolkit URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted/60 px-3 py-2 rounded-lg truncate">{toolkitUrl}</code>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(toolkitUrl)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/40 bg-card/60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Embed Button (HTML)</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-xs bg-muted/60 px-3 py-2 rounded-lg break-all font-mono leading-relaxed">{embedHtml}</code>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 mt-0.5" onClick={() => copyToClipboard(embedHtml)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Settings Panel ───────────────────────────────────────────────────

function ProfilePanel({ profile, onRefresh }: { profile: Profile; onRefresh: () => void }) {
  const [form, setForm] = useState({
    name: profile.name,
    description: profile.description ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    logoUrl: profile.logoUrl ?? "",
    baseUrl: profile.baseUrl ?? "",
    specUrl: profile.specUrl ?? "",
    gatewayOptIn: profile.gatewayOptIn,
  });

  const patchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/connected-business/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Update failed"); }
      return res.json();
    },
    onSuccess: () => { toast.success("Profile updated"); onRefresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Platform Name</Label>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Description</Label>
        <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="resize-none" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Website URL</Label>
          <Input placeholder="https://yourplatform.com" value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">Logo URL</Label>
          <Input placeholder="https://..." value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">API Base URL</Label>
        <Input placeholder="https://api.yourplatform.com" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
      </div>
      <div>
        <Label className="text-xs font-bold uppercase tracking-wide mb-1.5 block">
          OpenAPI Spec URL <span className="font-normal text-muted-foreground">(alternative to Git — direct link to your .yaml or .json)</span>
        </Label>
        <Input placeholder="https://api.yourplatform.com/openapi.yaml" value={form.specUrl} onChange={e => setForm(f => ({ ...f, specUrl: e.target.value }))} />
      </div>
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-muted/30">
        <Switch checked={form.gatewayOptIn} onCheckedChange={v => setForm(f => ({ ...f, gatewayOptIn: v }))} />
        <div>
          <p className="text-sm font-semibold">Route via awajimaaai.com gateway</p>
          <p className="text-xs text-muted-foreground">Proxy API calls through the Awa platform gateway.</p>
        </div>
      </div>
      <Button className="w-full h-10 font-bold gap-2" onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>
        {patchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
        Save Changes
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectedBusinessPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ profile: Profile | null }>({
    queryKey: ["connected-business-profile"],
    queryFn: () => fetch(`${BASE}/api/connected-business/profile`).then(r => r.json()),
  });

  const profile = data?.profile ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["connected-business-profile"] });

  const statusColor = profile
    ? profile.docVersion > 0 ? "text-emerald-400" : "text-amber-400"
    : "text-muted-foreground";

  const statusLabel = profile
    ? profile.docVersion > 0 ? "Active" : "Setup in progress"
    : "Not set up";

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-extrabold">Connected Business</h1>
              <Badge variant="outline" className={`text-xs ${statusColor} border-current`}>{statusLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your repository and let Awajimaa AI generate your API documentation automatically.
            </p>
          </div>
          {profile?.docVersion > 0 && (
            <a href={`${BASE}/docs/${profile.slug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <BookOpen className="w-3.5 h-3.5" /> View Docs
              </Button>
            </a>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not set up → show setup form */}
        {!isLoading && !profile && (
          <Card>
            <CardContent className="pt-6">
              <SetupForm onCreated={refresh} />
            </CardContent>
          </Card>
        )}

        {/* Has profile → show tabs */}
        {!isLoading && profile && (
          <>
            {/* Status cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: GitBranch, label: "VCS", value: profile.gitRepo ? `${profile.gitProvider}/${profile.gitRepo.split("/")[1]}` : "Not connected", ok: !!profile.gitRepo },
                { icon: Zap, label: "Docs", value: profile.docVersion > 0 ? `v${profile.docVersion}` : "Not generated", ok: profile.docVersion > 0 },
                { icon: Globe, label: "Live", value: profile.enabled ? "Public" : "Hidden", ok: profile.enabled },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-3 text-center transition-colors ${item.ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-border/40 bg-muted/20"}`}>
                  {item.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    : <AlertCircle className="w-4 h-4 text-muted-foreground mx-auto mb-1" />}
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-semibold truncate">{item.value}</p>
                </div>
              ))}
            </div>

            <Tabs defaultValue="vcs">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="vcs" className="gap-1.5 text-xs"><GitBranch className="w-3.5 h-3.5" />VCS</TabsTrigger>
                <TabsTrigger value="docs" className="gap-1.5 text-xs"><Zap className="w-3.5 h-3.5" />Docs</TabsTrigger>
                <TabsTrigger value="profile" className="gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" />Profile</TabsTrigger>
              </TabsList>
              <TabsContent value="vcs" className="mt-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">Version Control</CardTitle><CardDescription>Connect your GitHub, GitLab, or Bitbucket repository so AI can read your codebase.</CardDescription></CardHeader>
                  <CardContent><VCSPanel profile={profile} onRefresh={refresh} /></CardContent></Card>
              </TabsContent>
              <TabsContent value="docs" className="mt-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">API Documentation</CardTitle><CardDescription>Generate or regenerate your API docs any time your codebase changes.</CardDescription></CardHeader>
                  <CardContent><DocsPanel profile={profile} onRefresh={refresh} /></CardContent></Card>
              </TabsContent>
              <TabsContent value="profile" className="mt-4">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">Profile Settings</CardTitle><CardDescription>Update your platform name, description, base URL, and logo.</CardDescription></CardHeader>
                  <CardContent><ProfilePanel profile={profile} onRefresh={refresh} /></CardContent></Card>
              </TabsContent>
            </Tabs>

            {/* Upgrade nudge if not on connected plan */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Link2 className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold mb-0.5">Connected Business Plan — $49/month</p>
                <p className="text-xs text-muted-foreground">Includes all Pro features + unlimited doc regenerations + "Trusted By" listing.</p>
              </div>
              <a href={`${BASE}/pricing`}>
                <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs font-bold">Upgrade</Button>
              </a>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
