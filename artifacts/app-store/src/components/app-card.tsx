import { Star, Download } from "lucide-react";
import { Link } from "wouter";
import type { StoreAppSummary } from "@/lib/types";

interface AppCardProps {
  app: StoreAppSummary;
  size?: "sm" | "md" | "lg";
}

const PLATFORM_BADGE: Record<string, string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
  all: "Universal",
};

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function AppCard({ app, size = "md" }: AppCardProps) {
  const isLg = size === "lg";
  return (
    <Link href={`/apps/${app.slug}`}>
      <div
        className={`group relative bg-[#0d0d1a] border border-[#7F50FF]/20 rounded-2xl overflow-hidden cursor-pointer
          hover:border-[#7F50FF]/60 hover:shadow-[0_0_24px_rgba(127,80,255,0.25)] transition-all duration-300
          ${isLg ? "p-5" : "p-4"}`}
      >
        {/* Featured badge */}
        {app.isFeatured && (
          <span className="absolute top-3 right-3 bg-[#FF7F50] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Featured
          </span>
        )}
        <div className={`flex gap-4 ${isLg ? "flex-col sm:flex-row" : ""}`}>
          {/* Icon */}
          <div className={`relative flex-shrink-0 ${isLg ? "w-20 h-20" : "w-14 h-14"}`}>
            <img
              src={app.iconUrl}
              alt={app.name}
              className="w-full h-full rounded-2xl object-cover ring-1 ring-white/10"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(app.name)}&background=7F50FF&color=fff&size=80`;
              }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-white truncate group-hover:text-[#7F50FF] transition-colors ${isLg ? "text-lg" : "text-base"}`}>
              {app.name}
            </h3>
            <p className="text-gray-400 text-sm truncate mt-0.5">{app.tagline}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Rating */}
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-[#FF7F50] fill-[#FF7F50]" />
                <span className="text-white text-xs font-semibold">{app.rating.toFixed(1)}</span>
                <span className="text-gray-500 text-xs">({app.ratingCount})</span>
              </div>
              {/* Downloads */}
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <Download className="w-3 h-3" />
                <span>{formatDownloads(app.totalDownloads)}</span>
              </div>
              {/* Platform badge */}
              <span className="text-[10px] font-semibold bg-[#7F50FF]/20 text-[#7F50FF] px-2 py-0.5 rounded-full">
                {PLATFORM_BADGE[app.platform] ?? app.platform}
              </span>
            </div>
            {isLg && app.developerName && (
              <p className="text-gray-500 text-xs mt-2">by {app.developerName}</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
