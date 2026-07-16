import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app-card";
import { Link } from "wouter";
import { Sparkles, TrendingUp, Grid3X3, ChevronRight, Loader2 } from "lucide-react";
import type { StoreAppSummary, StoreAppPage, StoreCategory } from "@/lib/types";

function Section({ title, icon: Icon, href, children }: {
  title: string;
  icon: React.ElementType;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-[#7F50FF]" />
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-[#7F50FF] text-sm hover:text-[#FF7F50] transition-colors">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  const { data: featured, isLoading: loadingFeat } = useQuery<StoreAppSummary[]>({
    queryKey: ["store", "featured"],
    queryFn: () => apiFetch("/apps/featured"),
  });
  const { data: trending, isLoading: loadingTrend } = useQuery<StoreAppSummary[]>({
    queryKey: ["store", "trending"],
    queryFn: () => apiFetch("/apps/trending"),
  });
  const { data: browseData, isLoading: loadingBrowse } = useQuery<StoreAppPage>({
    queryKey: ["store", "apps", "newest"],
    queryFn: () => apiFetch("/apps?sort=newest&limit=12"),
  });
  const { data: categories } = useQuery<StoreCategory[]>({
    queryKey: ["store", "categories"],
    queryFn: () => apiFetch("/apps/categories"),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">

      {/* Hero */}
      <div className="relative mb-14 rounded-3xl overflow-hidden bg-gradient-to-br from-[#12012f] via-[#0d0d1a] to-[#1a0d00] border border-[#7F50FF]/20 p-10 text-center">
        {/* Stars decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white/30 animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-[#7F50FF]/15 border border-[#7F50FF]/30 text-[#7F50FF] px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered App Discovery
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            Discover Apps Built<br />
            <span className="bg-gradient-to-r from-[#7F50FF] to-[#FF7F50] bg-clip-text text-transparent">
              for Your Community
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-8">
            The Awajimaa App Store — curated, AI-reviewed apps for Nigerian businesses and communities.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/developer/signup"
              className="bg-gradient-to-r from-[#7F50FF] to-[#9b6bff] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">
              Publish Your App
            </Link>
            <Link href="/search"
              className="bg-white/5 border border-white/15 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors">
              Browse All Apps
            </Link>
          </div>
        </div>
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <Section title="Categories" icon={Grid3X3}>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3">
            {categories.filter(c => c.count > 0 || true).slice(0, 13).map(cat => (
              <Link key={cat.name} href={`/search?category=${encodeURIComponent(cat.name)}`}>
                <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[#0d0d1a] border border-[#7F50FF]/15 hover:border-[#7F50FF]/50 hover:bg-[#7F50FF]/5 transition-all cursor-pointer group">
                  <span className="text-2xl">{cat.iconEmoji}</span>
                  <span className="text-xs text-gray-400 group-hover:text-white text-center leading-tight font-medium">{cat.name}</span>
                  {cat.count > 0 && <span className="text-[10px] text-gray-600">{cat.count}</span>}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Featured */}
      <Section title="Featured Apps" icon={Sparkles} href="/search?sort=rating">
        {loadingFeat ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#7F50FF] animate-spin" /></div>
        ) : (featured?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured!.map(app => <AppCard key={app.id} app={app} size="lg" />)}
          </div>
        ) : (
          <EmptyState message="No featured apps yet. Check back soon!" />
        )}
      </Section>

      {/* Trending */}
      <Section title="Trending Now" icon={TrendingUp} href="/search?sort=downloads">
        {loadingTrend ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#7F50FF] animate-spin" /></div>
        ) : (trending?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {trending!.map(app => <AppCard key={app.id} app={app} />)}
          </div>
        ) : (
          <EmptyState message="No apps yet." />
        )}
      </Section>

      {/* Newest */}
      <Section title="New Arrivals" icon={Grid3X3} href="/search?sort=newest">
        {loadingBrowse ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#7F50FF] animate-spin" /></div>
        ) : (browseData?.apps?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {browseData!.apps.map(app => <AppCard key={app.id} app={app} />)}
          </div>
        ) : (
          <EmptyState message="Be the first to publish an app!" />
        )}
      </Section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 border border-dashed border-white/10 rounded-2xl">
      <span className="text-4xl mb-3">🚀</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
