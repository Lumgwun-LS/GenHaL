import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { StarRating } from "@/components/star-rating";
import { useState } from "react";
import { useParams } from "wouter";
import {
  Download, Globe, Star, ChevronLeft, Share2, Tag,
  Smartphone, Layers, Loader2, Sparkles, AlertCircle
} from "lucide-react";
import type { StoreApp, StoreReview, StoreAppVersion } from "@/lib/types";
import { Link } from "wouter";

const PLATFORM_LABEL: Record<string, string> = {
  android: "📱 Android",
  ios: "🍎 iOS",
  web: "🌐 Web App",
  all: "📱🍎🌐 Universal",
};

export default function AppDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [activeScreen, setActiveScreen] = useState(0);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<"about" | "reviews" | "versions">("about");

  const { data: app, isLoading, error } = useQuery<StoreApp>({
    queryKey: ["store", "app", slug],
    queryFn: () => apiFetch(`/apps/${slug}`),
    enabled: !!slug,
  });

  const { data: reviews } = useQuery<StoreReview[]>({
    queryKey: ["store", "reviews", slug],
    queryFn: () => apiFetch(`/apps/${slug}/reviews`),
    enabled: !!slug && activeTab === "reviews",
  });

  const { data: versions } = useQuery<StoreAppVersion[]>({
    queryKey: ["store", "versions", slug],
    queryFn: () => apiFetch(`/apps/${slug}/versions`),
    enabled: !!slug && activeTab === "versions",
  });

  const downloadMutation = useMutation({
    mutationFn: () => apiFetch<{ downloadUrl: string; webUrl: string | null }>(`/apps/${slug}/download`, { method: "POST" }),
    onSuccess: (data) => {
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      else if (data.webUrl) window.open(data.webUrl, "_blank");
      qc.invalidateQueries({ queryKey: ["store", "app", slug] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () => apiFetch(`/apps/${slug}/reviews`, {
      method: "POST",
      body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
    }),
    onSuccess: () => {
      setReviewSubmitted(true);
      qc.invalidateQueries({ queryKey: ["store", "reviews", slug] });
    },
  });

  if (isLoading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" />
    </div>
  );

  if (error || !app) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <p>App not found.</p>
      <Link href="/" className="mt-4 text-[#7F50FF] hover:underline">← Back to Store</Link>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Back */}
      <Link href="/" className="flex items-center gap-1 text-gray-500 hover:text-white text-sm mb-8 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Store
      </Link>

      {/* Hero row */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <img
          src={app.iconUrl}
          alt={app.name}
          className="w-28 h-28 rounded-3xl object-cover ring-2 ring-[#7F50FF]/30 flex-shrink-0"
          onError={e => { (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(app.name)}&background=7F50FF&color=fff&size=112`; }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">{app.name}</h1>
              <p className="text-gray-400 mt-1">{app.developerName}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigator.share?.({ title: app.name, url: window.location.href })}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>
              {(app.downloadUrl || app.webUrl) && (
                <button
                  onClick={() => downloadMutation.mutate()}
                  disabled={downloadMutation.isPending}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-semibold px-5 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {app.platform === "web" ? <Globe className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  {app.platform === "web" ? "Open App" : "Download"}
                </button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-1.5">
              <StarRating value={app.rating} size="sm" />
              <span className="text-white font-semibold text-sm">{app.rating.toFixed(1)}</span>
              <span className="text-gray-500 text-xs">({app.ratingCount} reviews)</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 text-sm">
              <Download className="w-4 h-4" />
              <span>{app.totalDownloads.toLocaleString()} downloads</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 text-sm">
              <Smartphone className="w-4 h-4" />
              <span>{PLATFORM_LABEL[app.platform] ?? app.platform}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400 text-sm">
              <Tag className="w-4 h-4" />
              <span>{app.category}</span>
            </div>
            {app.currentVersion && (
              <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                <Layers className="w-4 h-4" />
                <span>v{app.currentVersion}</span>
              </div>
            )}
          </div>

          {/* AI Summary */}
          {app.aiSummary && (
            <div className="mt-4 flex items-start gap-2 bg-[#7F50FF]/10 border border-[#7F50FF]/25 rounded-xl p-3">
              <Sparkles className="w-4 h-4 text-[#7F50FF] flex-shrink-0 mt-0.5" />
              <p className="text-gray-300 text-sm leading-relaxed">{app.aiSummary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Screenshots */}
      {app.screenshots.length > 0 && (
        <div className="mb-8">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {app.screenshots.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Screenshot ${i + 1}`}
                onClick={() => setActiveScreen(i)}
                className={`h-48 w-auto rounded-2xl object-cover flex-shrink-0 cursor-pointer transition-all
                  ${activeScreen === i ? "ring-2 ring-[#7F50FF]" : "opacity-70 hover:opacity-100"}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {(["about", "reviews", "versions"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px
              ${activeTab === tab ? "border-[#7F50FF] text-[#7F50FF]" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* About */}
      {activeTab === "about" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-white font-semibold mb-3">Description</h2>
            <p className="text-gray-400 leading-relaxed whitespace-pre-line">{app.description}</p>
          </div>
          {app.developerWebsite && (
            <a href={app.developerWebsite} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#7F50FF] hover:text-[#FF7F50] transition-colors text-sm">
              <Globe className="w-4 h-4" /> Developer Website
            </a>
          )}
        </div>
      )}

      {/* Reviews */}
      {activeTab === "reviews" && (
        <div className="space-y-6">
          {/* Write a review */}
          {!reviewSubmitted ? (
            <div className="bg-[#0d0d1a] border border-[#7F50FF]/20 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Write a Review</h3>
              <div className="mb-3">
                <p className="text-sm text-gray-400 mb-2">Your rating</p>
                <StarRating value={reviewRating} interactive onChange={setReviewRating} size="lg" />
              </div>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Share your experience with this app..."
                rows={3}
                className="w-full bg-[#141428] border border-white/15 text-white placeholder-gray-500 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-[#7F50FF]/50 mb-3"
              />
              <button
                onClick={() => reviewMutation.mutate()}
                disabled={reviewRating === 0 || reviewMutation.isPending}
                className="bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-semibold px-5 py-2 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity text-sm"
              >
                {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
              </button>
              {reviewMutation.isError && (
                <p className="text-red-400 text-xs mt-2">Failed to submit. You may have already reviewed this app.</p>
              )}
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-4 text-green-400 text-sm">
              ✓ Review submitted! Thank you.
            </div>
          )}

          {/* Review list */}
          {reviews && reviews.length > 0 ? reviews.map(r => (
            <div key={r.id} className="bg-[#0d0d1a] border border-white/8 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-white text-sm font-medium">{r.reviewerName}</p>
                  <StarRating value={r.rating} size="sm" />
                </div>
                <span className="text-gray-600 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.comment && <p className="text-gray-400 text-sm leading-relaxed mt-2">{r.comment}</p>}
              {r.sentimentLabel && (
                <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full
                  ${r.sentimentLabel === "positive" ? "bg-green-500/15 text-green-400" :
                    r.sentimentLabel === "negative" ? "bg-red-500/15 text-red-400" :
                    "bg-gray-500/15 text-gray-400"}`}>
                  AI: {r.sentimentLabel}
                </span>
              )}
            </div>
          )) : (
            <p className="text-gray-500 text-sm">No reviews yet. Be the first!</p>
          )}
        </div>
      )}

      {/* Versions */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions && versions.length > 0 ? versions.map(v => (
            <div key={v.id} className="bg-[#0d0d1a] border border-white/8 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-semibold text-sm">v{v.version}</span>
                <span className="text-gray-600 text-xs">{new Date(v.createdAt).toLocaleDateString()}</span>
              </div>
              {v.releaseNotes && <p className="text-gray-400 text-sm">{v.releaseNotes}</p>}
            </div>
          )) : (
            <p className="text-gray-500 text-sm">No version history available.</p>
          )}
        </div>
      )}
    </div>
  );
}
