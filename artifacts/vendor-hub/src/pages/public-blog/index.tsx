/**
 * Public blog index page — /public-blog/:siteSlug
 * No authentication required.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Eye, Heart, MessageSquare, BookOpen, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PostSummary = {
  id: number; title: string; slug: string;
  coverImageUrl: string | null; excerpt: string | null;
  keywords: string[]; viewCount: number; likeCount: number; commentCount: number;
  publishedAt: string | null;
};

type VendorInfo = { name: string; logoUrl: string | null; description: string | null };

async function fetchPosts(siteSlug: string) {
  const res = await fetch(`${BASE_URL}/api/public/blog/${encodeURIComponent(siteSlug)}/posts`);
  if (!res.ok) throw new Error("Blog not found");
  return res.json() as Promise<{ vendor: VendorInfo; posts: PostSummary[] }>;
}

export default function PublicBlogIndex() {
  const { siteSlug } = useParams<{ siteSlug: string }>();
  const [data, setData] = useState<{ vendor: VendorInfo; posts: PostSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gridCols, setGridCols] = useState<2 | 3>(2);

  useEffect(() => {
    if (!siteSlug) return;
    setLoading(true);
    fetchPosts(siteSlug)
      .then(setData)
      .catch((e) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [siteSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <BookOpen className="w-16 h-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold">Blog not found</h1>
        <p className="text-muted-foreground">This blog doesn't exist or hasn't been set up yet.</p>
      </div>
    );
  }

  const { vendor, posts } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          {vendor.logoUrl && (
            <img src={vendor.logoUrl} alt={vendor.name} className="w-10 h-10 rounded-full object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg truncate">{vendor.name}</h1>
            {vendor.description && (
              <p className="text-xs text-muted-foreground truncate">{vendor.description}</p>
            )}
          </div>
          {/* Grid toggle */}
          <div className="flex rounded-lg border overflow-hidden shrink-0">
            {([2, 3] as const).map((n) => (
              <button
                key={n}
                onClick={() => setGridCols(n)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  gridCols === n ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                {n} col
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <BookOpen className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-widest">Blog</span>
          </div>
          <h2 className="text-3xl font-bold">{vendor.name}&rsquo;s Blog</h2>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground/20 mb-4" />
            <p className="text-xl font-semibold text-muted-foreground">No posts yet</p>
            <p className="text-sm text-muted-foreground mt-1">Check back soon!</p>
          </div>
        ) : (
          <div className={cn(
            "grid gap-6",
            gridCols === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
          )}>
            {posts.map((post) => (
              <Link key={post.id} href={`/public-blog/${siteSlug}/${post.slug}`}>
                <Card className="overflow-hidden h-full flex flex-col group hover:shadow-lg transition-shadow cursor-pointer">
                  {post.coverImageUrl ? (
                    <img
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-48 bg-muted flex items-center justify-center">
                      <BookOpen className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{post.excerpt}</p>
                      )}
                      {post.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {post.keywords.slice(0, 3).map((kw) => (
                            <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t mt-auto">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likeCount}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                      </div>
                      <span className="text-xs text-primary font-medium flex items-center gap-1">
                        Read <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
