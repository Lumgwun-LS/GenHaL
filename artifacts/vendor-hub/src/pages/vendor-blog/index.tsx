/**
 * Platform-wide Awajimaa Vendor Blog — /vendor-blog
 * No auth required. Shows the 50 most-recent published posts
 * from all vendors who have opted in.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar, Eye, Heart, MessageSquare, ArrowRight,
  BookOpen, Loader2, Search, Building2,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PlatformPost = {
  id: number;
  title: string;
  slug: string;
  siteSlug: string;
  coverImageUrl: string | null;
  excerpt: string | null;
  keywords: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  vendorName: string;
  vendorLogoUrl: string | null;
};

export default function VendorBlogPage() {
  const [posts, setPosts] = useState<PlatformPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}/api/public/vendor-blog`)
      .then((r) => r.json())
      .then((d) => { setPosts(d.posts ?? []); })
      .catch((e) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? posts.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.vendorName.toLowerCase().includes(search.toLowerCase()) ||
        (p.excerpt ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : posts;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-primary text-sm font-semibold mb-3">
              <BookOpen className="w-4 h-4" />
              Awajimaa Vendor Blog
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
              Stories from African Businesses
            </h1>
            <p className="text-muted-foreground text-lg">
              Insights, updates, and ideas from vendors on the Awa Biz Suite platform.
            </p>
          </div>

          {/* Search */}
          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search posts or vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">
              {search ? "No posts match your search" : "No posts published yet"}
            </p>
            {search && (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {filtered.length} post{filtered.length !== 1 ? "s" : ""}
              {search ? ` matching "${search}"` : ""}
            </p>
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((post) => (
                <Card key={post.id} className="overflow-hidden flex flex-col group hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 border-border/50 hover:border-primary/20">
                  {/* Cover */}
                  {post.coverImageUrl ? (
                    <div className="overflow-hidden aspect-[16/9]">
                      <img
                        src={post.coverImageUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <BookOpen className="w-10 h-10 text-primary/30" />
                    </div>
                  )}

                  <CardContent className="p-5 flex flex-col flex-1 gap-3">
                    {/* Vendor attribution */}
                    <div className="flex items-center gap-2">
                      {post.vendorLogoUrl ? (
                        <img src={post.vendorLogoUrl} alt={post.vendorName} className="w-6 h-6 rounded-full object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-3 h-3 text-primary" />
                        </div>
                      )}
                      <span className="text-xs font-semibold text-muted-foreground truncate">{post.vendorName}</span>
                    </div>

                    {/* Title */}
                    <h2 className="font-bold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>

                    {/* Excerpt */}
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{post.excerpt}</p>
                    )}

                    {/* Keywords */}
                    {post.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.keywords.slice(0, 3).map((kw) => (
                          <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">{kw}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                      <div className="flex items-center gap-3">
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likeCount}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <Link href={`/public-blog/${post.siteSlug}/${post.slug}`}>
                      <Button variant="outline" size="sm" className="w-full group/btn border-primary/20 hover:bg-primary/10 hover:border-primary/40">
                        Read More
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover/btn:translate-x-0.5 transition-transform" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer back link */}
      <div className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <Link href="/home">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              ← Back to Awa Biz Suite
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
