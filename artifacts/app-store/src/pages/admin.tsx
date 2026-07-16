import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app-card";
import {
  Shield, CheckCircle, XCircle, Sparkles, Users, Download,
  BarChart2, Star, Loader2, AlertCircle, UserX
} from "lucide-react";
import { useState } from "react";
import type { StoreAdminStats, StoreApp, StoreDeveloper } from "@/lib/types";

function StatCard({ icon: Icon, label, value, color = "violet" }: {
  icon: React.ElementType; label: string; value: string | number; color?: "violet" | "coral" | "green" | "amber";
}) {
  const colors = {
    violet: "text-[#7F50FF] bg-[#7F50FF]/10 border-[#7F50FF]/20",
    coral: "text-[#FF7F50] bg-[#FF7F50]/10 border-[#FF7F50]/20",
    green: "text-green-400 bg-green-500/10 border-green-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <div className={`border rounded-2xl p-5 ${colors[color]}`}>
      <div className="flex items-center gap-2 text-sm mb-3 opacity-80">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

interface AiReview {
  appId: number;
  policyFlags: string[];
  category: string;
  summary: string;
  score: number;
  recommendation: "approve" | "review" | "reject";
  malwareHints: string[];
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "pending" | "all" | "developers">("overview");
  const [aiResult, setAiResult] = useState<Record<number, AiReview>>({});
  const [developerSearch, setDeveloperSearch] = useState("");

  const { data: stats, isLoading: loadingStats } = useQuery<StoreAdminStats>({
    queryKey: ["store", "admin", "stats"],
    queryFn: () => apiFetch("/admin/stats"),
  });

  const { data: pending, isLoading: loadingPending } = useQuery<StoreApp[]>({
    queryKey: ["store", "admin", "pending"],
    queryFn: () => apiFetch("/admin/apps/pending"),
    enabled: activeTab === "pending",
  });

  const { data: allApps, isLoading: loadingAll } = useQuery<StoreApp[]>({
    queryKey: ["store", "admin", "all-apps"],
    queryFn: () => apiFetch("/admin/apps"),
    enabled: activeTab === "all",
  });

  const { data: developers } = useQuery<StoreDeveloper[]>({
    queryKey: ["store", "admin", "developers"],
    queryFn: () => apiFetch("/admin/developers"),
    enabled: activeTab === "developers",
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/apps/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "admin"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      apiFetch(`/admin/apps/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", "admin"] });
    },
  });

  const featureMutation = useMutation({
    mutationFn: ({ id, featured }: { id: number; featured: boolean }) =>
      apiFetch(`/admin/apps/${id}/feature`, { method: "POST", body: JSON.stringify({ featured }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store", "admin"] }),
  });

  const aiReviewMutation = useMutation({
    mutationFn: (id: number) => apiFetch<AiReview>(`/admin/apps/${id}/ai-review`, { method: "POST" }),
    onSuccess: (data) => setAiResult(prev => ({ ...prev, [data.appId]: data })),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/admin/developers/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store", "admin", "developers"] }),
  });

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "pending", label: `Pending${stats ? ` (${stats.pendingReview})` : ""}` },
    { id: "all", label: "All Apps" },
    { id: "developers", label: "Developers" },
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7F50FF] to-[#FF7F50] flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">App Store Admin</h1>
          <p className="text-gray-500 text-sm">Review apps, manage developers, view store stats</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === tab.id ? "border-[#7F50FF] text-[#7F50FF]" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {loadingStats ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" /></div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={BarChart2} label="Total Apps" value={stats.totalApps} color="violet" />
                <StatCard icon={Users} label="Developers" value={stats.totalDevelopers} color="coral" />
                <StatCard icon={Download} label="Total Downloads" value={stats.totalDownloads.toLocaleString()} color="green" />
                <StatCard icon={AlertCircle} label="Pending Review" value={stats.pendingReview} color="amber" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <StatCard icon={CheckCircle} label="Approved" value={stats.approvedApps} color="green" />
                <StatCard icon={XCircle} label="Rejected" value={stats.rejectedApps} color="coral" />
                <StatCard icon={Star} label="Total Reviews" value={stats.totalReviews} color="violet" />
              </div>

              {stats.topApps.length > 0 && (
                <div>
                  <h2 className="text-white font-semibold mb-4">Top Apps</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats.topApps.map(app => <AppCard key={app.id} app={app} />)}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Pending Review */}
      {activeTab === "pending" && (
        <div>
          {loadingPending ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" /></div>
          ) : !pending || pending.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p>No apps pending review. The queue is clear!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map(app => {
                const ai = aiResult[app.id];
                return (
                  <div key={app.id} className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl p-5">
                    <div className="flex flex-col md:flex-row gap-5">
                      {/* App info */}
                      <div className="flex gap-4 flex-1">
                        <img
                          src={app.iconUrl}
                          alt={app.name}
                          className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
                          onError={e => { (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.name)}&background=7F50FF&color=fff&size=64`; }}
                        />
                        <div>
                          <h3 className="text-white font-bold">{app.name}</h3>
                          <p className="text-gray-400 text-sm">{app.tagline}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="text-xs bg-[#7F50FF]/15 text-[#7F50FF] px-2 py-0.5 rounded-full">{app.platform}</span>
                            <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded-full">{app.category}</span>
                            <span className="text-xs text-gray-500">by {app.developerName}</span>
                          </div>
                          <p className="text-gray-500 text-xs mt-2 line-clamp-2">{app.description}</p>
                        </div>
                      </div>

                      {/* AI Result */}
                      {ai && (
                        <div className="w-full md:w-64 bg-[#141428] border border-[#7F50FF]/20 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-[#7F50FF]" />
                            <span className="text-xs font-semibold text-[#7F50FF]">AI Review</span>
                          </div>
                          <p className="text-gray-300 text-xs leading-relaxed mb-2">{ai.summary}</p>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">Score</span>
                            <span className={`text-xs font-bold ${ai.score >= 70 ? "text-green-400" : ai.score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                              {ai.score}/100
                            </span>
                          </div>
                          <div className={`text-xs font-semibold text-center py-1 rounded-lg mt-1
                            ${ai.recommendation === "approve" ? "bg-green-500/20 text-green-400" :
                              ai.recommendation === "reject" ? "bg-red-500/20 text-red-400" :
                              "bg-yellow-500/20 text-yellow-400"}`}>
                            AI: {ai.recommendation}
                          </div>
                          {ai.policyFlags.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-red-400 font-medium mb-1">⚠ Policy Flags:</p>
                              {ai.policyFlags.map((f, i) => <p key={i} className="text-xs text-red-300">{f}</p>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-4 flex-wrap">
                      <button
                        onClick={() => aiReviewMutation.mutate(app.id)}
                        disabled={aiReviewMutation.isPending && aiReviewMutation.variables === app.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7F50FF]/15 border border-[#7F50FF]/30 text-[#7F50FF] text-xs font-semibold hover:bg-[#7F50FF]/25 transition-colors disabled:opacity-60"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {aiReviewMutation.isPending ? "Analyzing..." : "AI Review"}
                      </button>
                      <button
                        onClick={() => approveMutation.mutate(app.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-colors disabled:opacity-60"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt("Rejection reason (shown to developer):");
                          if (reason !== null) rejectMutation.mutate({ id: app.id, reason });
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => featureMutation.mutate({ id: app.id, featured: !app.isFeatured })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                          ${app.isFeatured ? "bg-[#FF7F50]/25 border-[#FF7F50]/50 text-[#FF7F50]" : "bg-white/5 border-white/15 text-gray-400 hover:text-white"}`}
                      >
                        ⭐ {app.isFeatured ? "Unfeature" : "Feature"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* All apps */}
      {activeTab === "all" && (
        <div>
          {loadingAll ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(allApps ?? []).map(app => (
                <div key={app.id} className="relative">
                  <AppCard app={app as any} />
                  <div className="flex gap-2 mt-2 justify-between px-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border
                      ${app.status === "approved" ? "bg-green-500/15 text-green-400 border-green-500/25" :
                        app.status === "rejected" ? "bg-red-500/15 text-red-400 border-red-500/25" :
                        "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"}`}>
                      {app.status}
                    </span>
                    {app.status === "approved" && (
                      <button
                        onClick={() => featureMutation.mutate({ id: app.id, featured: !app.isFeatured })}
                        className="text-xs text-gray-400 hover:text-[#FF7F50] transition-colors"
                      >
                        {app.isFeatured ? "⭐ Featured" : "☆ Feature"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Developers */}
      {activeTab === "developers" && (
        <div>
          <input
            value={developerSearch}
            onChange={e => setDeveloperSearch(e.target.value)}
            placeholder="Search developers..."
            className="w-full max-w-sm bg-[#0d0d1a] border border-white/15 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#7F50FF]/50 mb-6"
          />
          <div className="bg-[#0d0d1a] border border-[#7F50FF]/15 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr className="text-gray-400 text-sm">
                  <th className="text-left px-5 py-3">Developer</th>
                  <th className="text-right px-5 py-3 hidden sm:table-cell">Apps</th>
                  <th className="text-right px-5 py-3 hidden md:table-cell">Downloads</th>
                  <th className="text-right px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {(developers ?? [])
                  .filter(d => d.displayName.toLowerCase().includes(developerSearch.toLowerCase()))
                  .map(dev => (
                  <tr key={dev.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3">
                      <div>
                        <p className="text-white text-sm font-medium">{dev.displayName}</p>
                        {dev.company && <p className="text-gray-500 text-xs">{dev.company}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm text-right hidden sm:table-cell">{dev.totalApps}</td>
                    <td className="px-5 py-3 text-gray-400 text-sm text-right hidden md:table-cell">{dev.totalDownloads.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border
                        ${dev.status === "active" ? "bg-green-500/15 text-green-400 border-green-500/25" :
                          dev.status === "suspended" ? "bg-red-500/15 text-red-400 border-red-500/25" :
                          "bg-gray-500/15 text-gray-400 border-gray-500/25"}`}>
                        {dev.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {dev.status === "active" && (
                        <button
                          onClick={() => {
                            const reason = prompt("Suspension reason:");
                            if (reason) suspendMutation.mutate({ id: dev.id, reason });
                          }}
                          className="flex items-center gap-1 ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          <UserX className="w-3.5 h-3.5" /> Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
