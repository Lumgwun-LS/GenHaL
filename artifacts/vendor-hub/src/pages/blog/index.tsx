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
  Edit2, Trash2, Globe, FileText, Loader2, BookOpen,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BlogPost = {
  id: number; vendorId: number; title: string; slug: string;
  coverImageUrl: string | null; excerpt: string | null;
  status: "draft" | "published"; viewCount: number; likeCount: number;
  commentCount: number; publishedAt: string | null;
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
                    <Badge variant={post.status === "published" ? "default" : "secondary"} className="capitalize">
                      {post.status}
                    </Badge>
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
                  <Badge variant={post.status === "published" ? "default" : "secondary"} className="capitalize shrink-0 text-[10px]">
                    {post.status}
                  </Badge>
                </div>
                {post.excerpt && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{post.excerpt}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likeCount}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    disabled={actionLoading === post.id}
                    onClick={() => handleTogglePublish(post)}
                  >
                    {actionLoading === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {post.status === "draft" ? "Publish" : "Unpublish"}
                  </Button>
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
    </div>
  );
}
