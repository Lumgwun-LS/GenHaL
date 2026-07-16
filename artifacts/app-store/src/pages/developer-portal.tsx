import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app-card";
import { Link, useLocation } from "wouter";
import {
  Code2, Plus, Download, Star, BarChart2, Loader2, CheckCircle,
  AlertCircle, ExternalLink, Trash2
} from "lucide-react";
import type { StoreDeveloper, StoreApp } from "@/lib/types";
import { useState } from "react";

interface Dashboard {
  totalApps: number;
  totalDownloads: number;
  totalReviews: number;
  averageRating: number;
  appBreakdown: { appId: number; appName: string; downloads: number; rating: number; ratingCount: number; status: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-green-500/15 text-green-400 border-green-500/25",
  pending_review: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  removed: "bg-gray-500/15 text-gray-400 border-gray-500/25",
  draft: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
        <Icon className="w-4 h-4 text-[#7F50FF]" />
        {label}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function DeveloperPortalPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "apps" | "submit">("dashboard");
  const [submitForm, setSubmitForm] = useState({
    name: "", tagline: "", description: "", category: "Productivity",
    platform: "android", iconUrl: "", downloadUrl: "", webUrl: "",
  });

  const { data: dev, isLoading: loadingDev, error: devError } = useQuery<StoreDeveloper>({
    queryKey: ["store", "developer", "me"],
    queryFn: () => apiFetch("/developers/me"),
    retry: false,
  });

  const { data: myApps } = useQuery<StoreApp[]>({
    queryKey: ["store", "my-apps"],
    queryFn: () => apiFetch("/developers/me/apps"),
    enabled: !!dev,
  });

  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ["store", "dashboard"],
    queryFn: () => apiFetch("/developers/me/dashboard"),
    enabled: !!dev && activeTab === "dashboard",
  });

  const submitApp = useMutation({
    mutationFn: () => apiFetch("/developers/me/apps", { method: "POST", body: JSON.stringify(submitForm) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "my-apps"] });
      setActiveTab("apps");
      setSubmitForm({ name: "", tagline: "", description: "", category: "Productivity", platform: "android", iconUrl: "", downloadUrl: "", webUrl: "" });
    },
  });

  const removeApp = useMutation({
    mutationFn: (id: number) => apiFetch(`/developers/me/apps/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store", "my-apps"] }),
  });

  if (loadingDev) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" />
    </div>
  );

  // Not registered
  if (devError || !dev) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] flex items-center justify-center mx-auto mb-6">
          <Code2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Developer Portal</h1>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Join thousands of developers publishing apps for the Awajimaa community.
          A one-time <strong className="text-white">$15 registration fee</strong> keeps the platform free of spam and funds developer support.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left">
          {[
            { emoji: "🤖", title: "AI-Powered Review", desc: "Apps reviewed for safety and quality automatically" },
            { emoji: "📊", title: "Analytics Dashboard", desc: "Track downloads, ratings, and revenue in real time" },
            { emoji: "🌍", title: "Community Reach", desc: "Reach millions of users across the Awajimaa network" },
          ].map(f => (
            <div key={f.title} className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl p-4">
              <span className="text-2xl">{f.emoji}</span>
              <h3 className="text-white font-semibold mt-2 mb-1 text-sm">{f.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <Link href="/developer/signup"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-bold px-8 py-4 rounded-xl hover:opacity-90 transition-opacity text-lg">
          Get Started — $15 One-Time Fee
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] flex items-center justify-center text-white font-bold text-lg">
            {dev.displayName[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{dev.displayName}</h1>
            <div className="flex items-center gap-2">
              {dev.status === "active" ? (
                <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3 h-3" /> Active Developer</span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 text-xs"><AlertCircle className="w-3 h-3" /> {dev.status}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab("submit")}
          className="flex items-center gap-2 bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          <Plus className="w-4 h-4" /> Submit App
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-white/10">
        {(["dashboard", "apps", "submit"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px
              ${activeTab === tab ? "border-[#7F50FF] text-[#7F50FF]" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            {tab === "submit" ? "+ Submit App" : tab}
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Code2} label="Total Apps" value={dashboard?.totalApps ?? dev.totalApps} />
            <StatCard icon={Download} label="Total Downloads" value={(dashboard?.totalDownloads ?? dev.totalDownloads).toLocaleString()} />
            <StatCard icon={Star} label="Average Rating" value={dashboard?.averageRating?.toFixed(1) ?? "—"} />
            <StatCard icon={BarChart2} label="Total Reviews" value={dashboard?.totalReviews ?? 0} />
          </div>

          {dashboard?.appBreakdown && dashboard.appBreakdown.length > 0 && (
            <div>
              <h2 className="text-white font-semibold mb-4">Your Apps Performance</h2>
              <div className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-white/10">
                    <tr className="text-gray-400 text-sm">
                      <th className="text-left px-5 py-3">App</th>
                      <th className="text-right px-5 py-3">Downloads</th>
                      <th className="text-right px-5 py-3">Rating</th>
                      <th className="text-right px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.appBreakdown.map(a => (
                      <tr key={a.appId} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-5 py-3 text-white text-sm font-medium">{a.appName}</td>
                        <td className="px-5 py-3 text-gray-400 text-sm text-right">{a.downloads.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="flex items-center justify-end gap-1 text-sm">
                            <Star className="w-3 h-3 text-[#FF7F50] fill-[#FF7F50]" />
                            <span className="text-white">{a.rating.toFixed(1)}</span>
                            <span className="text-gray-500">({a.ratingCount})</span>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[a.status] ?? "bg-gray-500/15 text-gray-400"}`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Apps tab */}
      {activeTab === "apps" && (
        <div>
          {!myApps || myApps.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <span className="text-5xl block mb-4">📦</span>
              <p>No apps yet. Submit your first app!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myApps.map(app => (
                <div key={app.id} className="relative">
                  <AppCard app={app as any} />
                  <div className="absolute top-3 right-3 flex gap-1">
                    {app.status === "approved" && (
                      <a href={`/app-store/apps/${app.slug}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-black/50 text-gray-300 hover:text-white">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => { if (confirm("Remove this app?")) removeApp.mutate(app.id); }}
                      className="p-1.5 rounded-lg bg-black/50 text-gray-300 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className={`mt-2 mx-0 text-center text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_STYLE[app.status] ?? ""}`}>
                    {app.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit tab */}
      {activeTab === "submit" && (
        <div className="max-w-2xl">
          <h2 className="text-white font-bold text-xl mb-6">Submit a New App</h2>
          <div className="space-y-4">
            {[
              { key: "name", label: "App Name *", placeholder: "My Amazing App" },
              { key: "tagline", label: "Tagline * (max 120 chars)", placeholder: "One-line description of your app" },
              { key: "iconUrl", label: "Icon URL *", placeholder: "https://..." },
              { key: "downloadUrl", label: "Download URL (APK/IPA link)", placeholder: "https://..." },
              { key: "webUrl", label: "Web URL (for web apps)", placeholder: "https://..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-sm text-gray-400 font-medium mb-1.5 block">{label}</label>
                <input
                  value={(submitForm as any)[key]}
                  onChange={e => setSubmitForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-[#0d0d1a] border border-white/15 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#7F50FF]/50"
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 font-medium mb-1.5 block">Category *</label>
                <select
                  value={submitForm.category}
                  onChange={e => setSubmitForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#0d0d1a] border border-white/15 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                >
                  {["Productivity", "Finance", "Education", "Health & Fitness", "Entertainment", "Social", "Business", "Utilities", "Lifestyle", "Shopping", "Travel", "Food & Drink", "Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 font-medium mb-1.5 block">Platform *</label>
                <select
                  value={submitForm.platform}
                  onChange={e => setSubmitForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full bg-[#0d0d1a] border border-white/15 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                >
                  <option value="android">Android</option>
                  <option value="ios">iOS</option>
                  <option value="web">Web</option>
                  <option value="all">Universal</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 font-medium mb-1.5 block">Description * (min 50 chars)</label>
              <textarea
                value={submitForm.description}
                onChange={e => setSubmitForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe what your app does, who it's for, and what makes it special..."
                rows={5}
                className="w-full bg-[#0d0d1a] border border-white/15 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-[#7F50FF]/50"
              />
            </div>

            {submitApp.isError && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 text-red-400 text-sm">
                Failed to submit. Check all required fields.
              </div>
            )}
            {submitApp.isSuccess && (
              <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-3 text-green-400 text-sm">
                ✓ App submitted for review! We'll notify you within 48 hours.
              </div>
            )}

            <button
              onClick={() => submitApp.mutate()}
              disabled={submitApp.isPending || !submitForm.name || !submitForm.tagline || !submitForm.description || !submitForm.iconUrl}
              className="w-full bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitApp.isPending ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
