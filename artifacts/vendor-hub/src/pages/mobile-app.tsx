import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Smartphone, Globe, Github, ExternalLink, RefreshCw,
  CheckCircle2, XCircle, Clock, Loader2, Zap, Download,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers as HeadersInit ?? {});
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const res = await authFetch(`${BASE_URL}/api${path}`, { ...init, headers });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(t || `HTTP ${res.status}`); }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface MobileAppRecord {
  id:           number;
  source:       string;
  websiteUrl:   string | null;
  repoUrl:      string | null;
  appName:      string;
  appSlug:      string;
  packageName:  string;
  iconUrl:      string | null;
  easBuildId:   string | null;
  apkUrl:       string | null;
  storeAppId:   number | null;
  status:       "queued" | "building" | "packaging" | "published" | "failed";
  errorMessage: string | null;
  createdAt:    string;
  updatedAt:    string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: MobileAppRecord["status"] }) {
  const map: Record<MobileAppRecord["status"], { label: string; color: string; icon: React.ReactNode }> = {
    queued:     { label: "Queued",     color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <Clock className="w-3 h-3" /> },
    building:   { label: "Building",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    packaging:  { label: "Packaging",  color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    published:  { label: "Published",  color: "bg-green-500/15 text-green-400 border-green-500/30",    icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:     { label: "Failed",     color: "bg-red-500/15 text-red-400 border-red-500/30",          icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function sourceLabel(source: string) {
  const map: Record<string, string> = { website: "Website URL", github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };
  return map[source] ?? source;
}

// ── main component ────────────────────────────────────────────────────────────
export default function MobileAppPage() {
  const { vendor } = useCurrentVendor();
  const qc = useQueryClient();

  const [source, setSource]       = useState<"website" | "github" | "gitlab" | "bitbucket">("website");
  const [url, setUrl]             = useState("");
  const [appName, setAppName]     = useState("");
  const [repoBranch, setRepoBranch] = useState("");
  const [formError, setFormError] = useState("");

  // ── fetch existing builds ──────────────────────────────────────────────────
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["mobile-apps"],
    queryFn:  () => apiFetch<{ apps: MobileAppRecord[] }>("/vendors/me/mobile-app"),
    refetchInterval: (query) => {
      const apps = query.state.data?.apps ?? [];
      const hasPending = apps.some((a) => a.status === "building" || a.status === "queued");
      return hasPending ? 15_000 : false;
    },
  });

  const apps = data?.apps ?? [];

  // ── submit mutation ────────────────────────────────────────────────────────
  const submit = useMutation({
    mutationFn: () =>
      apiFetch<{ app: MobileAppRecord }>("/vendors/me/mobile-app", {
        method: "POST",
        body: JSON.stringify({
          source,
          websiteUrl:  source === "website" ? url : undefined,
          repoUrl:     source !== "website" ? url : undefined,
          repoBranch:  repoBranch || undefined,
          appName:     appName || vendor?.name,
        }),
      }),
    onSuccess: () => {
      setUrl(""); setAppName(""); setRepoBranch(""); setFormError("");
      qc.invalidateQueries({ queryKey: ["mobile-apps"] });
    },
    onError: (e: any) => setFormError(e?.message ?? "Failed to start build"),
  });

  // ── delete mutation ────────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/vendors/me/mobile-app/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mobile-apps"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!url.trim()) { setFormError("Please enter a URL."); return; }
    try { new URL(url); } catch { setFormError("Enter a valid URL including https://"); return; }
    submit.mutate();
  }

  // ── active build (most recent non-failed) ─────────────────────────────────
  const activeApp = apps.find((a) => a.status !== "failed");
  const hasActive = !!activeApp && (activeApp.status === "building" || activeApp.status === "queued");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Mobile App Builder</h1>
          <p className="text-sm text-zinc-400">Turn your website or platform into a native Android app in minutes.</p>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: <Globe className="w-4 h-4" />,       step: "1", label: "Paste your URL",    desc: "Website or Git repo" },
          { icon: <Zap className="w-4 h-4" />,         step: "2", label: "We build the APK",  desc: "~20 min" },
          { icon: <Download className="w-4 h-4" />,    step: "3", label: "Auto-published",    desc: "Listed on Awajimaa App Store + download link" },
        ].map((s) => (
          <div key={s.step} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 flex-shrink-0">
              {s.icon}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{s.label}</div>
              <div className="text-xs text-zinc-500">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Build form */}
      {!hasActive && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">Generate Your App</CardTitle>
            <CardDescription>We'll wrap your website in a native shell with your branding.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Source selector */}
              <div className="space-y-2">
                <Label className="text-zinc-300">Source</Label>
                <div className="flex gap-2 flex-wrap">
                  {(["website", "github", "gitlab", "bitbucket"] as const).map((s) => (
                    <button
                      key={s} type="button"
                      onClick={() => setSource(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        source === s
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {source === s && s !== "website" && <Github className="inline w-3 h-3 mr-1" />}
                      {sourceLabel(s)}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL */}
              <div className="space-y-2">
                <Label className="text-zinc-300">
                  {source === "website" ? "Website URL" : "Repository URL"}
                </Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={source === "website" ? "https://yourbusiness.com" : "https://github.com/you/your-repo"}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>

              {/* Branch (only for repo sources) */}
              {source !== "website" && (
                <div className="space-y-2">
                  <Label className="text-zinc-300">Branch <span className="text-zinc-500">(optional)</span></Label>
                  <Input
                    value={repoBranch}
                    onChange={(e) => setRepoBranch(e.target.value)}
                    placeholder="main"
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
              )}

              {/* App name override */}
              <div className="space-y-2">
                <Label className="text-zinc-300">App Name <span className="text-zinc-500">(optional)</span></Label>
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder={vendor?.name ?? "Your App Name"}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>

              {formError && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">{formError}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={submit.isPending}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {submit.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting build…</> : "Build My App"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Build history / status */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
        </div>
      ) : apps.length === 0 ? null : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">Your Builds</h2>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="text-zinc-400 h-7 px-2">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {apps.map((app) => (
            <Card key={app.id} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm truncate">{app.appName}</span>
                      <StatusBadge status={app.status} />
                      <span className="text-xs text-zinc-500">{sourceLabel(app.source)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 truncate">
                      {app.websiteUrl ?? app.repoUrl}
                    </div>
                    {app.status === "building" && (
                      <div className="mt-2 text-xs text-blue-400">
                        Building your app — typically 15–20 min. This page auto-refreshes.
                      </div>
                    )}
                    {app.status === "published" && app.apkUrl && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <a
                          href={app.apkUrl}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                        >
                          <Download className="w-3 h-3" />Download APK
                        </a>
                        {app.storeAppId && (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />Listed on App Store
                          </span>
                        )}
                        {app.easBuildId && (
                          <a
                            href={`https://expo.dev/accounts/lumgwun-solutions/projects/builds/${app.easBuildId}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400"
                          >
                            <ExternalLink className="w-3 h-3" />EAS logs
                          </a>
                        )}
                      </div>
                    )}
                    {app.status === "failed" && app.errorMessage && (
                      <div className="mt-2 text-xs text-red-400">{app.errorMessage}</div>
                    )}
                    {app.easBuildId && app.status === "building" && (
                      <a
                        href={`https://expo.dev/accounts/lumgwun-solutions/projects/awajimaa-apps/builds/${app.easBuildId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-3 h-3" />Track build on Expo
                      </a>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => remove.mutate(app.id)}
                    disabled={remove.isPending || app.status === "building"}
                    className="text-zinc-600 hover:text-red-400 h-7 px-2 flex-shrink-0"
                  >
                    ✕
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Show form again if all builds are done/failed */}
          {hasActive === false && apps.every((a) => a.status === "published" || a.status === "failed") && (
            <Button
              variant="outline" className="w-full border-dashed border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
              onClick={() => { setUrl(""); setAppName(""); }}
            >
              + Build another app
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
