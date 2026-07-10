import { useEffect, useRef } from "react";
import { useListPosts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Twitter, Facebook, Linkedin, Instagram, Youtube, Share2, Clock } from "lucide-react";
import { Link } from "wouter";

export default function Social() {
  const { data: posts, isLoading } = useListPosts();
  const highlightId = Number(new URLSearchParams(window.location.search).get("highlight")) || null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    if (!scrolledRef.current && highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolledRef.current = true;
    }
  }, [highlightId, posts]);

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'twitter':
      case 'x': return <Twitter className="w-4 h-4" />;
      case 'facebook': return <Facebook className="w-4 h-4" />;
      case 'linkedin': return <Linkedin className="w-4 h-4" />;
      case 'instagram': return <Instagram className="w-4 h-4" />;
      case 'youtube': return <Youtube className="w-4 h-4" />;
      default: return <Share2 className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case 'published': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'scheduled': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'draft': return 'bg-muted text-muted-foreground';
      default: return 'bg-primary/10 text-primary';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Hub</h1>
          <p className="text-muted-foreground">Manage and schedule content across all platforms.</p>
        </div>
        <Button asChild>
          <Link href="/social/create">
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Loading posts...</div>
        ) : posts?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground border border-dashed rounded-xl">
            No posts found. Create your first one.
          </div>
        ) : (
          posts?.map((post) => (
            <Card
              key={post.id}
              ref={post.id === highlightId ? highlightRef : undefined}
              className={`flex flex-col h-full hover:border-primary/50 transition-colors ${post.id === highlightId ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    {post.platforms.map(p => (
                      <div key={p} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center" title={p}>
                        {getPlatformIcon(p)}
                      </div>
                    ))}
                  </div>
                  <Badge variant="outline" className={getStatusColor(post.status)}>
                    {post.status}
                  </Badge>
                </div>
                
                <p className="text-sm mb-4 line-clamp-3 flex-1">{post.caption}</p>
                
                {post.mediaUrls?.[0] && (
                  <div className="w-full aspect-video rounded-md bg-muted mb-4 overflow-hidden border">
                    {/* Simplified media preview */}
                    <img src={post.mediaUrls[0]} alt="Post media" className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className="flex items-center text-xs text-muted-foreground mt-auto pt-4 border-t">
                  {post.scheduledAt ? (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled: {new Date(post.scheduledAt).toLocaleString()}</span>
                  ) : post.publishedAt ? (
                    <span>Published: {new Date(post.publishedAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Created: {new Date(post.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}