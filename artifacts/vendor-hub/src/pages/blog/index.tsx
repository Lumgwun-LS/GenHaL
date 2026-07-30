import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LayoutGrid, List, Plus, Search, Eye, Heart, MessageSquare,
  Edit2, Trash2, Globe, FileText, Loader2, BookOpen, ShieldBan,
  Send, Users, Settings2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BlogPost = {
  id: number; vendorId: number; title: string; slug: string;
  coverImageUrl: string | null; excerpt: string | null;
  status: "draft" | "published"; viewCount: number; likeCount: number;
  commentCount: number; publishedAt: string | null;
  suspendedFromGlobal: boolean;
  createdAt: string; updatedAt: string;
};

type GridCols = 2 | 3;

async function apiFetch(path: string, init?: RequestInit) {
  const res = await authFetch(`${BASE_URL}/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

export default function BlogManagement() {
  const [, setLocation] = useLocation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [search, setSearch] = useState("");
  const [gridCols, setGridCols] = useState<GridCols>(() => {
    return (Number(localStorage.getItem("blog:gridCols")) as GridCols) || 2;
  });
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Newsletter dialog
  const [newsletterPost, setNewsletterPost] = useState<BlogPost | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sendingNewsletter, setSendingNewsletter] = useState(false);

  // Blog settings (featured on platform)
  const [blogFeaturedOnPlatform, setBlogFeaturedOnPlatform] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Load blog settings once
  useEffect(() => {
    apiFetch("/blog/settings")
      .then((d) => setBlogFeaturedOnPlatform(d.blogFeaturedOnPlatform ?? true))
      .catch(() => {/* non-critical */});
  }, []);

  const handleSaveSettings = async (val: boolean) => {
    setSavingSettings(true);
    try {
      await apiFetch("/blog/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogFeaturedOnPlatform: val }),
      });
      setBlogFeaturedOnPlatform(val);
      toast.success(val ? "Your posts will appear on the Awajimaa Blog" : "Your posts are hidden from the Awajimaa Blog");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save settings");
    }
    setSavingSettings(false);
  };

  const handleOpenNewsletter = async (post: BlogPost) => {
    setNewsletterPost(post);
    setRecipientCount(null);
    setLoadingRecipients(true);
    try {
      const d = await apiFetch(`/blog/posts/${post.id}/newsletter-stats`);
      setRecipientCount(d.recipientCount ?? 0);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load recipient count");
      setNewsletterPost(null);
    }
    setLoadingRecipients(false);
  };

  const handleSendNewsletter = async () => {
    if (!newsletterPost) return;
    setSendingNewsletter(true);
    try {
      const d = await apiFetch(`/blog/posts/${newsletterPost.id}/send-newsletter`, { method: "POST" });
      toast.success(d.message ?? "Newsletter sent!");
      setNewsletterPost(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send newsletter");
    }
    setSendingNewsletter(false);
  };

  useEffect(() => {
    localStorage.setItem("blog:gridCols", String(gridCols));
  }, [gridCols]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/blog/posts");
      setPosts(data.posts ?? []);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  const filtered = posts.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/blog/posts/${deleteId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success("Post deleted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteId(null);
    }
  };

  const handleTogglePublish = async (post: BlogPost) => {
    setActionLoading(post.id);
    try {
      const path = post.status === "draft" ? `/blog/posts/${post.id}/publish` : `/blog/posts/${post.id}/unpublish`;
      const data = await apiFetch(path, { method: "POST" });
      setPosts((prev) => prev.map((p) => (p.id === post.id ? data.post : p)));
      toast.success(post.status === "draft" ? "Post published" : "Post moved back to draft");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const stats = {
    total: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
    views: posts.reduce((s, p) => s + p.viewCount, 0),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Blog
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage your blog posts
          </p>
        </div>
        <Button onClick={() => setLocation("/blog/new")}>
          <Plus className="w-4 h-4 mr-2" /> New Post
        </Button>
      </div>

      {/* Blog settings: featured on platform */}
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Show my posts on the Awajimaa Vendor Blog</p>
            <p className="text-xs text-muted-foreground">Your published posts will appear on the platform-wide blog page, giving you free exposure across the Awajimaa ecosystem.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <Checkbox
            id="blog-featured-platform"
            checked={blogFeaturedOnPlatform}
            onCheckedChange={(v) => handleSaveSettings(!!v)}
            disabled={savingSettings}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Posts", value: stats.total, icon: FileText },
          { label: "Published", value: stats.published, icon: Globe, color: "text-green-500" },
          { label: "Drafts", value: stats.draft, icon: FileText, color: "text-amber-500" },
          { label: "Total Views", value: stats.views, icon: Eye },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={cn("w-8 h-8 p-1.5 rounded-lg bg-muted shrink-0", color ?? "text-primary")} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <div className="flex rounded-lg border overflow-hidden shrink-0">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search posts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon" className="h-8 w-8"
            onClick={() => setViewMode("table")}
            title="Table view"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon" className="h-8 w-8"
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          {viewMode === "grid" && (
            <div className="flex rounded-md border overflow-hidden ml-1">
              {([2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setGridCols(n)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors",
                    gridCols === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            {posts.length === 0 ? "No blog posts yet" : "No posts match your filter"}
          </p>
          {posts.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/blog/new")}>
              <Plus className="w-4 h-4 mr-2" /> Write your first post
            </Button>
          )}
        </div>
      ) : viewMode === "table" ? (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center"><Eye className="w-3.5 h-3.5 inline" /></TableHead>
                <TableHead className="text-center"><Heart className="w-3.5 h-3.5 inline" /></TableHead>
                <TableHead className="text-center"><MessageSquare className="w-3.5 h-3.5 inline" /></TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {post.coverImageUrl && (
                        <img src={post.coverImageUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate max-w-[240px]">{post.title}</p>
                        {post.excerpt && (
                          <p className="text-xs text-muted-foreground truncate max-w-[240px]">{post.excerpt}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={post.status === "published" ? "default" : "secondary"} className="capitalize w-fit">
                        {post.status}
                      </Badge>
                      {post.suspendedFromGlobal && (
                        <Badge variant="outline" className="w-fit text-[10px] gap-0.5 bg-destructive/10 text-destructive border-destructive/20">
                          <ShieldBan className="w-2.5 h-2.5" /> Suspended
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">{post.viewCount}</TableCell>
                  <TableCell className="text-center text-sm">{post.likeCount}</TableCell>
                  <TableCell className="text-center text-sm">{post.commentCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        title={post.status === "draft" ? "Publish" : "Unpublish"}
                        disabled={actionLoading === post.id}
                        onClick={() => handleTogglePublish(post)}
                      >
                        {actionLoading === post.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Globe className={cn("w-3.5 h-3.5", post.status === "published" ? "text-green-500" : "text-muted-foreground")} />
                        }
                      </Button>
                      {post.status === "published" && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary"
                          title="Send as Newsletter"
                          onClick={() => handleOpenNewsletter(post)}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Link href={`/blog/${post.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeleteId(post.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className={cn("grid gap-5", gridCols === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
          {filtered.map((post) => (
            <Card key={post.id} className="overflow-hidden group">
              {post.coverImageUrl ? (
                <img src={post.coverImageUrl} alt={post.title} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2">{post.title}</h3>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={post.status === "published" ? "default" : "secondary"} className="capitalize text-[10px]">
                      {post.status}
                    </Badge>
                    {post.suspendedFromGlobal && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 bg-destructive/10 text-destructive border-destructive/20">
                        <ShieldBan className="w-2.5 h-2.5" /> Suspended
                      </Badge>
                    )}
                  </div>
                </div>
                {post.excerpt && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{post.excerpt}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likeCount}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    disabled={actionLoading === post.id}
                    onClick={() => handleTogglePublish(post)}
                  >
                    {actionLoading === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {post.status === "draft" ? "Publish" : "Unpublish"}
                  </Button>
                  {post.status === "published" && (
                    <Button
                      variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary"
                      onClick={() => handleOpenNewsletter(post)}
                    >
                      <Send className="w-3 h-3 mr-1" /> Newsletter
                    </Button>
                  )}
                  <Link href={`/blog/${post.id}/edit`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Edit2 className="w-3 h-3 mr-1" /> Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive ml-auto"
                    onClick={() => setDeleteId(post.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. The post and all its stats will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Newsletter send confirm dialog */}
      <Dialog open={newsletterPost !== null} onOpenChange={(o) => !o && setNewsletterPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" /> Send as Newsletter
            </DialogTitle>
            <DialogDescription>
              This will send an email campaign to all opted-in subscribers.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium truncate">{newsletterPost?.title}</p>
              {newsletterPost?.excerpt && (
                <p className="text-xs text-muted-foreground line-clamp-2">{newsletterPost.excerpt}</p>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 p-3">
              <Users className="w-8 h-8 text-primary/60 shrink-0" />
              <div>
                {loadingRecipients ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Counting opted-in subscribers…</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xl font-bold">{recipientCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">opted-in subscriber{recipientCount !== 1 ? "s" : ""} will receive this email</p>
                  </>
                )}
              </div>
            </div>
            {recipientCount === 0 && !loadingRecipients && (
              <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                No opted-in subscribers found. Subscribers opt in via the comment form on your public blog.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewsletterPost(null)}>Cancel</Button>
            <Button
              disabled={sendingNewsletter || loadingRecipients || recipientCount === 0}
              onClick={handleSendNewsletter}
            >
              {sendingNewsletter
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending…</>
                : <><Send className="w-4 h-4 mr-2" /> Send to {recipientCount ?? 0} subscriber{recipientCount !== 1 ? "s" : ""}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
