import { useEffect, useRef, useState } from "react";
import {
  useListPosts,
  useSubmitPostForReview,
  useApprovePost,
  useRequestPostChanges,
  usePublishPost,
  useListSocialAccounts,
  useCreateSocialAccount,
  useDeleteSocialAccount,
  getListPostsQueryKey,
  getListSocialAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Twitter, Facebook, Linkedin, Instagram, Youtube, Share2, Clock, CheckCircle2, XCircle, Send, Link2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const CONNECTABLE_PLATFORMS = ["Instagram", "Facebook", "TikTok", "X (Twitter)", "LinkedIn"];

function ConnectedAccounts() {
  const { data: accounts, isLoading } = useListSocialAccounts({ vendorId: 1 });
  const createAccount = useCreateSocialAccount();
  const deleteAccount = useDeleteSocialAccount();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState(CONNECTABLE_PLATFORMS[0]);
  const [accountName, setAccountName] = useState("");
  const [open, setOpen] = useState(false);

  const handleConnect = async () => {
    if (!accountName.trim()) { toast.error("Enter the account/page name"); return; }
    try {
      await createAccount.mutateAsync({ data: { vendorId: 1, platform, accountName: accountName.trim() } });
      queryClient.invalidateQueries({ queryKey: getListSocialAccountsQueryKey({ vendorId: 1 }) });
      toast.success(`${platform} account connected`);
      setAccountName("");
      setOpen(false);
    } catch {
      toast.error("Failed to connect account");
    }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await deleteAccount.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListSocialAccountsQueryKey({ vendorId: 1 }) });
      toast.success("Account disconnected");
    } catch {
      toast.error("Failed to disconnect account");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="w-4 h-4" /> Connected Accounts
          <Badge variant="outline" className="font-normal text-xs">Manual — no live OAuth yet</Badge>
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Connect account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Connect a social account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Real OAuth login for each platform is coming soon — for now, register the account you'll be posting from so it shows up on your posts.
              </p>
              <div className="flex flex-wrap gap-2">
                {CONNECTABLE_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${platform === p ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Input placeholder="Account or page name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              <Button className="w-full" onClick={handleConnect} disabled={createAccount.isPending}>Connect</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading accounts...</p>
        ) : accounts && accounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-full border pl-3 pr-1 py-1 text-sm">
                <span className="font-medium">{a.platform}</span>
                <span className="text-muted-foreground">{a.accountName}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDisconnect(a.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Social() {
  const { data: posts, isLoading } = useListPosts();
  const highlightId = Number(new URLSearchParams(window.location.search).get("highlight")) || null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  const queryClient = useQueryClient();

  const submitForReview = useSubmitPostForReview();
  const approvePost = useApprovePost();
  const requestChanges = useRequestPostChanges();
  const publishPost = usePublishPost();

  const invalidatePosts = () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });

  const handleSubmitForReview = async (id: number) => {
    try { await submitForReview.mutateAsync({ id }); invalidatePosts(); toast.success("Submitted for review"); }
    catch { toast.error("Failed to submit for review"); }
  };
  const handleApprove = async (id: number) => {
    try { await approvePost.mutateAsync({ id }); invalidatePosts(); toast.success("Post approved"); }
    catch { toast.error("Failed to approve"); }
  };
  const handleRequestChanges = async (id: number) => {
    try { await requestChanges.mutateAsync({ id }); invalidatePosts(); toast.success("Sent back for edits"); }
    catch { toast.error("Failed to request changes"); }
  };
  const handlePublish = async (id: number) => {
    try { await publishPost.mutateAsync({ id }); invalidatePosts(); toast.success("Post published"); }
    catch { toast.error("Failed to publish"); }
  };

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
      case 'approved': return 'bg-sky-500/10 text-sky-500 border-sky-500/20';
      case 'pending_review': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
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

      <ConnectedAccounts />

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
                
                <div className="flex items-center text-xs text-muted-foreground pt-4 border-t mb-3">
                  {post.scheduledAt ? (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled: {new Date(post.scheduledAt).toLocaleString()}</span>
                  ) : post.publishedAt ? (
                    <span>Published: {new Date(post.publishedAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Created: {new Date(post.createdAt).toLocaleDateString()}</span>
                  )}
                </div>

                <div className="flex gap-2 mt-auto">
                  {post.status === "draft" && (
                    <Button size="sm" className="flex-1" onClick={() => handleSubmitForReview(post.id)}>
                      <Send className="w-3.5 h-3.5 mr-1.5" /> Submit for Review
                    </Button>
                  )}
                  {post.status === "pending_review" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleRequestChanges(post.id)}>
                        <XCircle className="w-3.5 h-3.5 mr-1.5" /> Request Changes
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => handleApprove(post.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve
                      </Button>
                    </>
                  )}
                  {post.status === "approved" && (
                    <Button size="sm" className="flex-1" onClick={() => handlePublish(post.id)}>
                      Publish Now
                    </Button>
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