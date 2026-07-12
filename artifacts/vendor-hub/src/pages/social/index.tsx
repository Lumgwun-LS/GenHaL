import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useListPosts,
  useSubmitPostForReview,
  useApprovePost,
  useRequestPostChanges,
  usePublishPost,
  useSchedulePost,
  useCancelPostSchedule,
  useUpdatePost,
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
import { Plus, Twitter, Facebook, Linkedin, Instagram, Youtube, Share2, Clock, CheckCircle2, XCircle, Send, Link2, Trash2, ExternalLink, AlertCircle, CalendarClock, CalendarX } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

/** Converts a Date to the value a <input type="datetime-local"> expects, in the browser's local timezone. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local input's value is naive local time with no offset — new Date(value) already parses it as local time. */
function fromDatetimeLocalValue(value: string): Date {
  return new Date(value);
}

function ScheduleDialog({
  postId,
  trigger,
  title,
  initialValue,
  onConfirm,
  confirmLabel,
}: {
  postId: number;
  trigger: ReactNode;
  title: string;
  initialValue?: Date;
  onConfirm: (postId: number, date: Date) => Promise<void>;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const minValue = toDatetimeLocalValue(new Date(Date.now() + 60 * 1000));
  const [value, setValue] = useState(() => toDatetimeLocalValue(initialValue ?? new Date(Date.now() + 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    const date = fromDatetimeLocalValue(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast.error("Pick a date/time in the future");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(postId, date);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="text-sm text-muted-foreground">Publish at</label>
          <Input type="datetime-local" min={minValue} value={value} onChange={(e) => setValue(e.target.value)} />
          <Button className="w-full" onClick={handleConfirm} disabled={submitting}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
// Only platforms without a live OAuth connection fall back to manual "just note the handle" entry.
const MANUAL_ONLY_PLATFORMS = ["TikTok", "X (Twitter)", "LinkedIn"];

function ConnectedAccounts() {
  const { data: accounts, isLoading } = useListSocialAccounts({ vendorId: 1 });
  const createAccount = useCreateSocialAccount();
  const deleteAccount = useDeleteSocialAccount();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState(MANUAL_ONLY_PLATFORMS[0]);
  const [accountName, setAccountName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("social_connect");
    if (result === "success") {
      const count = params.get("count");
      toast.success(`Connected ${count ?? ""} Facebook/Instagram account${count === "1" ? "" : "s"}`.trim());
      queryClient.invalidateQueries({ queryKey: getListSocialAccountsQueryKey({ vendorId: 1 }) });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (result === "error") {
      toast.error(params.get("message") ?? "Failed to connect account");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectMeta = () => {
    window.location.href = `${BASE_URL}/api/social/oauth/meta/start`;
  };

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
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleConnectMeta}>
            <Facebook className="w-3.5 h-3.5 mr-1.5" /> Connect Facebook / Instagram
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Add manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register another account</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Live OAuth publishing is only wired up for Facebook/Instagram so far — these platforms are label-only until they get a real connection.
                </p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_ONLY_PLATFORMS.map((p) => (
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
        </div>
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
                {a.connectedVia === "oauth_meta" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Live</Badge>
                )}
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
  const schedulePost = useSchedulePost();
  const cancelSchedule = useCancelPostSchedule();
  const updatePost = useUpdatePost();
  const [publishResults, setPublishResults] = useState<Record<number, { platform: string; status: string; externalUrl?: string | null; errorMessage?: string | null }[]>>({});

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
  const handleSchedule = async (id: number, date: Date) => {
    try { await schedulePost.mutateAsync({ id, data: { scheduledAt: date.toISOString() } }); invalidatePosts(); toast.success(`Scheduled for ${date.toLocaleString()}`); }
    catch (err: any) { toast.error(err?.data?.error ?? "Failed to schedule post"); }
  };
  const handleReschedule = async (id: number, date: Date) => {
    try { await updatePost.mutateAsync({ id, data: { scheduledAt: date.toISOString() } }); invalidatePosts(); toast.success(`Rescheduled for ${date.toLocaleString()}`); }
    catch { toast.error("Failed to reschedule post"); }
  };
  const handleCancelSchedule = async (id: number) => {
    try { await cancelSchedule.mutateAsync({ id }); invalidatePosts(); toast.success("Schedule cancelled — post moved back to draft"); }
    catch (err: any) { toast.error(err?.data?.error ?? "Failed to cancel schedule"); }
  };
  const handlePublish = async (id: number) => {
    try {
      const result = await publishPost.mutateAsync({ id });
      setPublishResults((prev) => ({ ...prev, [id]: result.publications }));
      invalidatePosts();
      const succeeded = result.publications.filter((p) => p.status === "success").length;
      const failed = result.publications.filter((p) => p.status !== "success").length;
      if (failed === 0) toast.success("Published to all selected platforms");
      else if (succeeded > 0) toast.warning(`Published to ${succeeded} platform${succeeded === 1 ? "" : "s"}, ${failed} failed — see details on the post`);
      else toast.error("Publish failed on every platform");
    } catch (err: any) {
      const publications = err?.data?.publications;
      if (publications) setPublishResults((prev) => ({ ...prev, [id]: publications }));
      toast.error(err?.data?.error ?? "Publishing failed on every selected platform");
    }
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
                    {post.mediaType === "video" ? (
                      <video src={post.mediaUrls[0]} controls loop className="w-full h-full object-cover bg-black" />
                    ) : (
                      <img src={post.mediaUrls[0]} alt="Post media" className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
                
                <div className="flex items-center text-xs text-muted-foreground pt-4 border-t mb-3">
                  {post.status === "scheduled" && post.scheduledAt ? (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Publishes automatically {new Date(post.scheduledAt).toLocaleString()}</span>
                  ) : post.publishedAt ? (
                    <span>Published: {new Date(post.publishedAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Created: {new Date(post.createdAt).toLocaleDateString()}</span>
                  )}
                </div>

                {publishResults[post.id] && publishResults[post.id].length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {publishResults[post.id].map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {r.status === "success" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium">{r.platform}:</span>
                        {r.status === "success" && r.externalUrl ? (
                          <a href={r.externalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-0.5 truncate">
                            View live post <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground truncate">{r.errorMessage}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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
                    <>
                      <ScheduleDialog
                        postId={post.id}
                        title="Schedule this post"
                        confirmLabel="Schedule"
                        onConfirm={handleSchedule}
                        trigger={
                          <Button size="sm" variant="outline" className="flex-1">
                            <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Schedule
                          </Button>
                        }
                      />
                      <Button size="sm" className="flex-1" onClick={() => handlePublish(post.id)}>
                        Publish Now
                      </Button>
                    </>
                  )}
                  {post.status === "scheduled" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleCancelSchedule(post.id)}>
                        <CalendarX className="w-3.5 h-3.5 mr-1.5" /> Cancel
                      </Button>
                      <ScheduleDialog
                        postId={post.id}
                        title="Reschedule this post"
                        confirmLabel="Reschedule"
                        initialValue={post.scheduledAt ? new Date(post.scheduledAt) : undefined}
                        onConfirm={handleReschedule}
                        trigger={
                          <Button size="sm" className="flex-1">
                            <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Reschedule
                          </Button>
                        }
                      />
                    </>
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