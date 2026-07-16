import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppCard } from "@/components/app-card";
import { Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import type { StoreAppPage, StoreCategory } from "@/lib/types";

const PLATFORMS = ["All Platforms", "android", "ios", "web", "all"];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top Rated" },
  { value: "downloads", label: "Most Downloaded" },
  { value: "trending", label: "Trending" },
];

export default function SearchPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [platform, setPlatform] = useState(params.get("platform") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { setPage(1); }, [query, category, platform, sort]);

  const buildQuery = () => {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    if (category) p.set("category", category);
    if (platform && platform !== "All Platforms") p.set("platform", platform);
    p.set("sort", sort);
    p.set("page", String(page));
    p.set("limit", "24");
    return p.toString();
  };

  const { data, isLoading } = useQuery<StoreAppPage>({
    queryKey: ["store", "search", query, category, platform, sort, page],
    queryFn: () => apiFetch(`/apps?${buildQuery()}`),
  });

  const { data: categories } = useQuery<StoreCategory[]>({
    queryKey: ["store", "categories"],
    queryFn: () => apiFetch("/apps/categories"),
  });

  const totalPages = data ? Math.ceil(data.total / 24) : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-6">Browse Apps</h1>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search apps..."
            className="w-full bg-[#0d0d1a] border border-[#7F50FF]/25 text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#7F50FF]/60"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors
            ${showFilters ? "bg-[#7F50FF]/20 border-[#7F50FF]/50 text-[#7F50FF]" : "bg-[#0d0d1a] border-white/15 text-gray-400 hover:text-white"}`}
        >
          <SlidersHorizontal className="w-4 h-4" /> Filters
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-[#0d0d1a] border border-[#7F50FF]/20 rounded-2xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Category */}
          <div>
            <label className="text-xs text-gray-400 font-medium mb-2 block">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#141428] border border-white/15 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#7F50FF]/50"
            >
              <option value="">All Categories</option>
              {categories?.map(c => (
                <option key={c.name} value={c.name}>{c.iconEmoji} {c.name}</option>
              ))}
            </select>
          </div>
          {/* Platform */}
          <div>
            <label className="text-xs text-gray-400 font-medium mb-2 block">Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full bg-[#141428] border border-white/15 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#7F50FF]/50"
            >
              {PLATFORMS.map(p => <option key={p} value={p === "All Platforms" ? "" : p}>{p}</option>)}
            </select>
          </div>
          {/* Sort */}
          <div>
            <label className="text-xs text-gray-400 font-medium mb-2 block">Sort by</label>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="w-full bg-[#141428] border border-white/15 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#7F50FF]/50"
            >
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Sort pills (quick) */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {SORTS.map(s => (
          <button
            key={s.value}
            onClick={() => setSort(s.value)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${sort === s.value ? "bg-[#7F50FF] text-white" : "bg-[#0d0d1a] border border-white/15 text-gray-400 hover:text-white"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#7F50FF] animate-spin" /></div>
      ) : (data?.apps?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <span className="text-5xl block mb-4">🔍</span>
          <p>No apps found. Try different filters.</p>
        </div>
      ) : (
        <>
          <p className="text-gray-500 text-sm mb-5">{data?.total ?? 0} apps found</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data!.apps.map(app => <AppCard key={app.id} app={app} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg bg-[#0d0d1a] border border-white/15 text-gray-400 hover:text-white disabled:opacity-40 text-sm"
              >
                ← Prev
              </button>
              <span className="px-4 py-2 text-gray-400 text-sm">Page {page} of {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg bg-[#0d0d1a] border border-white/15 text-gray-400 hover:text-white disabled:opacity-40 text-sm"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
