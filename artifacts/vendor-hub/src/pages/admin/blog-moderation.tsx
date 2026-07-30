import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShieldBan, ShieldCheck, Eye, MessageSquare, BookOpen,
  Search, Loader2, AlertTriangle, CheckCircle2, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type AdminPost = {
  id: number; vendorId: number; vendorName: string; vendorBlogSuspended: boolean;
  title: string; slug: string; status: string;
  suspendedFromGlobal: boolean; viewCount: number; commentCount: number;
  publishedAt: string | null;
};
type AdminVendor = {
  id: number; name: string; email: string; blogSuspended: boolean; status: string;
};

async function apiFetch(path: string, init?: RequestInit) {
  const res = await authFetch(`${BASE_URL}/api${path}`, init);
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? "Request failed"); }
  return res.json();
}

// ── Posts tab ─────────────────────────────────────────────────────────────────
function PostsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: posts = [], isLoading } = useQuery<AdminPost[]>({
    queryKey: ["admin-blog-posts"],
    queryFn: () => apiFetch("/blog/admin/posts"),
  });

  const togglePostSuspension = useMutation({
    mutationFn: (id: number) => apiFetch(`/blog/posts/${id}/toggle-global-suspension`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      const post = posts.find((p) => p.id === id);
      toast.success(post?.suspendedFromGlobal ? "Post restored to global blog" : "Post suspended from global blog");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = posts.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.vendorName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search posts or vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-blog-posts"] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-center w-24">Views</TableHead>
                <TableHead className="text-center w-24">Comments</TableHead>
                <TableHead className="text-center w-28">Published</TableHead>
                <TableHead className="text-center w-36">Global Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No published posts</TableCell></TableRow>
              ) : filtered.map((post) => (
                <TableRow key={post.id} className={post.suspendedFromGlobal || post.vendorBlogSuspended ? "opacity-60 bg-destructive/5" : ""}>
                  <TableCell>
                    <div className="font-medium text-sm max-w-[200px] truncate">{post.title}</div>
                    <div className="text-xs text-muted-foreground">/{post.slug}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{post.vendorName}</div>
                    {post.vendorBlogSuspended && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 mt-0.5">
                        vendor suspended
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="flex items-center justify-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {post.publishedAt ? format(new Date(post.publishedAt), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {post.suspendedFromGlobal ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <ShieldBan className="w-3 h-3" /> Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Visible
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm" variant="outline"
                      className={`text-xs h-7 w-full ${post.suspendedFromGlobal ? "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10" : "border-destructive/50 text-destructive hover:bg-destructive/10"}`}
                      onClick={() => togglePostSuspension.mutate(post.id)}
                      disabled={togglePostSuspension.isPending}
                    >
                      {post.suspendedFromGlobal ? (
                        <><ShieldCheck className="w-3 h-3 mr-1" /> Restore</>
                      ) : (
                        <><ShieldBan className="w-3 h-3 mr-1" /> Suspend</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Vendors tab ───────────────────────────────────────────────────────────────
function VendorsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: vendors = [], isLoading } = useQuery<AdminVendor[]>({
    queryKey: ["admin-blog-vendors"],
    queryFn: () => apiFetch("/blog/admin/vendors"),
  });

  const toggleVendorSuspension = useMutation({
    mutationFn: (id: number) => apiFetch(`/blog/vendors/${id}/toggle-blog-suspension`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin-blog-vendors"] });
      const vendor = vendors.find((v) => v.id === id);
      toast.success(vendor?.blogSuspended ? "Vendor blog restored" : "All vendor posts suspended from global blog");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = vendors.filter((v) =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.email.toLowerCase().includes(search.toLowerCase())
  );

  const suspendedCount = vendors.filter((v) => v.blogSuspended).length;

  return (
    <div className="space-y-4">
      {suspendedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{suspendedCount}</strong> vendor{suspendedCount !== 1 ? "s'" : "'s"} blog is currently suspended from the global page.</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-blog-vendors"] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center w-28">Account</TableHead>
                <TableHead className="text-center w-36">Blog Status</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No vendors found</TableCell></TableRow>
              ) : filtered.map((vendor) => (
                <TableRow key={vendor.id} className={vendor.blogSuspended ? "opacity-70 bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{vendor.email}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={vendor.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                      {vendor.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {vendor.blogSuspended ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <ShieldBan className="w-3 h-3" /> Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm" variant="outline"
                      className={`text-xs h-7 w-full ${vendor.blogSuspended ? "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10" : "border-destructive/50 text-destructive hover:bg-destructive/10"}`}
                      onClick={() => toggleVendorSuspension.mutate(vendor.id)}
                      disabled={toggleVendorSuspension.isPending}
                    >
                      {vendor.blogSuspended ? (
                        <><ShieldCheck className="w-3 h-3 mr-1" /> Restore Blog</>
                      ) : (
                        <><ShieldBan className="w-3 h-3 mr-1" /> Suspend All Posts</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function BlogModerationPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" /> Blog Moderation
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suspend individual posts or entire vendor blogs from the global blog page. Changes take effect immediately.
        </p>
      </div>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="vendors">Vendor Blogs</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="mt-4"><PostsTab /></TabsContent>
        <TabsContent value="vendors" className="mt-4"><VendorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
