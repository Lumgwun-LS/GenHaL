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
  useListPostPublications,
  useListScheduledPosts,
  useGetPostConnectionWarnings,
  getListPostsQueryKey,
  getListSocialAccountsQueryKey,
  getListPostPublicationsQueryKey,
  getListScheduledPostsQueryKey,
  getGetPostConnectionWarningsQueryKey,
  type Post,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

/**
 * Warns a vendor, before they confirm a schedule, that one or more of the
 * post's selected platforms has no usable connected account right now —
 * the exact situation that otherwise silently fails hours later when the
 * scheduled auto-publisher picks the post up. Checked live (not just from
 * already-loaded account state) so a stale accounts list can't hide a
 * warning the backend would still catch.
 */
function ConnectionWarningsNotice({ postId }: { postId: number }) {
  const { data } = useGetPostConnectionWarnings(postId, {
    query: { enabled: true, queryKey: getGetPostConnectionWarningsQueryKey(postId) },
  });
  const warnings = data?.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> This post may fail to auto-publish
      </div>
      <div className="space-y-1">
        {warnings.map((w, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            <span className="font-medium">{w.platform}:</span> {w.message}
          </p>
        ))}
      </div>
    </div>
  );
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
  onConfirm: (postId: number, date: Date, force?: boolean) => Promise<{ warnings?: { platform: string; message: string }[] } | void>;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const minValue = toDatetimeLocalValue(new Date(Date.now() + 60 * 1000));
  const [value, setValue] = useState(() => toDatetimeLocalValue(initialValue ?? new Date(Date.now() + 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);
  // Set once the backend has rejected a plain schedule attempt because of a
  // connection warning — surfaces a "confirm anyway" step instead of a dead end.
  const [blockedWarnings, setBlockedWarnings] = useState<{ platform: string; message: string }[] | null>(null);

  useEffect(() => {
    if (open) setBlockedWarnings(null);
  }, [open]);

  const handleConfirm = async (force?: boolean) => {
    const date = fromDatetimeLocalValue(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast.error("Pick a date/time in the future");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onConfirm(postId, date, force);
      if (result?.warnings && result.warnings.length > 0) {
        setBlockedWarnings(result.warnings);
        return;
      }
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
          <ConnectionWarningsNotice postId={postId} />
          {blockedWarnings && blockedWarnings.length > 0 ? (
            <div className="space-y-2">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> This post will likely fail to auto-publish
                </div>
                {blockedWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium">{w.platform}:</span> {w.message}
                  </p>
                ))}
              </div>
              <Button className="w-full" variant="destructive" onClick={() => handleConfirm(true)} disabled={submitting}>
                {confirmLabel} Anyway
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={() => handleConfirm(false)} disabled={submitting}>{confirmLabel}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shows why a scheduled post's auto-publish failed. Fetches the post's publish-attempt
 * history (one row per platform) only when the card actually needs it, since it's not
 * part of the list-posts payload.
 */
function AutoPublishFailureNotice({ postId }: { postId: number }) {
  const { data: publications, isLoading } = useListPostPublications(postId, {
    query: { enabled: true, queryKey: getListPostPublicationsQueryKey(postId) },
  });
  const latest = (publications ?? []).filter((p) => p.status === "failed");

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Failed to auto-publish
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading details...</p>
      ) : latest.length > 0 ? (
        <div className="space-y-1">
          {latest.map((p) => (
            <p key={p.id} className="text-xs text-muted-foreground truncate">
              <span className="font-medium">{p.platform}:</span> {p.errorMessage ?? "Unknown error"}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">An unexpected error occurred before it could publish.</p>
      )}
      <p className="text-xs text-muted-foreground">Fix the issue below, then publish again or reschedule.</p>
    </div>
  );
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
// Only platforms without a live OAuth connection fall back to manual "just note the handle" entry.
const MANUAL_ONLY_PLATFORMS = ["TikTok"];

type GatewayAvailability = { provider: string; available: boolean; reason: string | null };

async function fetchPaymentAvailability(vendorId: number): Promise<GatewayAvailability[]> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-availability`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payment availability");
  const data = await res.json();
  return data.gateways ?? [];
}

/**
 * For a checkout-mode post, warns the vendor if any of their enabled payment
 * gateways are currently unavailable — so they see the issue right where
 * they're about to share the link, not buried in Payment Settings.
 *
 * Payment availability is fetched once per page render (React Query caches
 * by key) so multiple checkout cards on the same page share a single request.
 */
function CheckoutPaymentHealthWarning({ vendorId }: { vendorId: number }) {
  const { data: gateways } = useQuery({
    queryKey: ["vendor-payment-availability", vendorId],
    queryFn: () => fetchPaymentAvailability(vendorId),
    enabled: !!vendorId,
    staleTime: 60_000,
  });

  if (!gateways) return null;

  const unavailable = gateways.filter((g) => !g.available);
  if (unavailable.length === 0) return null;

  const allUnavailable = unavailable.length === gateways.length;

  return (
    <div className={`rounded-md border px-3 py-2 mb-3 space-y-1.5 ${allUnavailable ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${allUnavailable ? "text-destructive" : "text-amber-600"}`}>
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {allUnavailable ? "No payment methods are working" : "Some payment methods unavailable"}
      </div>
      <div className="space-y-1">
        {unavailable.map((g) => (
          <p key={g.provider} className="text-xs text-muted-foreground">
            <span className="font-medium capitalize">{g.provider}:</span>{" "}
            {g.reason ?? "Credentials missing or not verified"}
          </p>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Customers won't be able to pay with {unavailable.length === 1 ? "this method" : "these methods"} until you fix it in{" "}
        <a href="/vendors/1" className="underline hover:text-foreground">Payment Settings</a>.
      </p>
    </div>
  );
}

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
      const providerParam = params.get("provider");
      const provider = providerParam === "linkedin" ? "LinkedIn" : providerParam === "twitter" ? "X" : "Facebook/Instagram";
      toast.success(`Connected ${count ?? ""} ${provider} account${count === "1" ? "" : "s"}`.trim());
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

  const handleConnectLinkedIn = () => {
    window.location.href = `${BASE_URL}/api/social/oauth/linkedin/start`;
  };

  const handleConnectTwitter = () => {
    window.location.href = `${BASE_URL}/api/social/oauth/twitter/start`;
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
          <Button size="sm" onClick={handleConnectLinkedIn}>
            <Linkedin className="w-3.5 h-3.5 mr-1.5" /> Connect LinkedIn
          </Button>
          <Button size="sm" onClick={handleConnectTwitter}>
            <Twitter className="w-3.5 h-3.5 mr-1.5" /> Connect X
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Add manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Register another account</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Live OAuth publishing is wired up for Facebook/Instagram, LinkedIn, and X — TikTok is label-only until it gets a real connection.
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
              <div key={a.id} className={`flex items-center gap-2 rounded-full border pl-3 pr-1 py-1 text-sm ${a.status === "needs_reconnect" ? "border-destructive/40 bg-destructive/5" : ""}`}>
                <span className="font-medium">{a.platform}</span>
                <span className="text-muted-foreground">{a.accountName}</span>
                {a.status === "needs_reconnect" ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                    <AlertCircle className="w-2.5 h-2.5" /> Reconnect needed
                  </Badge>
                ) : (
                  (a.connectedVia === "oauth_meta" || a.connectedVia === "oauth_linkedin" || a.connectedVia === "oauth_twitter") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Live</Badge>
                  )
                )}
                {a.status === "needs_reconnect" && a.connectedVia === "oauth_meta" && (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleConnectMeta}>
                    Reconnect
                  </Button>
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

/** Groups scheduled posts by calendar day (local time) for the upcoming-schedule view. */
function groupByDay<T extends { scheduledAt?: string | null }>(items: T[]): { day: Date; items: T[] }[] {
  const groups = new Map<string, { day: Date; items: T[] }>();
  for (const item of items) {
    if (!item.scheduledAt) continue;
    const d = new Date(item.scheduledAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups.has(key)) groups.set(key, { day: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] });
    groups.get(key)!.items.push(item);
  }
  return Array.from(groups.values()).sort((a, b) => a.day.getTime() - b.day.getTime());
}

function formatDayHeading(day: Date): string {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((day.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Chronological calendar view of every "scheduled" post across all statuses,
 * grouped by day, so a vendor can see the whole upcoming week/month at a
 * glance instead of scanning the general post grid. Reuses the same
 * reschedule/cancel handlers and ScheduleDialog as the grid view.
 */
function UpcomingScheduleView({
  getPlatformIcon,
  onReschedule,
  onCancelSchedule,
}: {
  getPlatformIcon: (platform: string) => ReactNode;
  onReschedule: (id: number, date: Date, force?: boolean) => Promise<{ warnings?: { platform: string; message: string }[] } | void>;
  onCancelSchedule: (id: number) => void;
}) {
  const { data: scheduled, isLoading } = useListScheduledPosts({
    query: { enabled: true, queryKey: getListScheduledPostsQueryKey() },
  });
  const { data: accounts } = useListSocialAccounts({ vendorId: 1 });
  // "all" | "platform:<Platform>" | "account:<id>" — narrows the list without a refetch.
  const [filter, setFilter] = useState("all");

  const filtered = (scheduled ?? []).filter((post: Post) => {
    if (filter === "all") return true;
    if (filter.startsWith("platform:")) {
      return post.platforms.includes(filter.slice("platform:".length));
    }
    if (filter.startsWith("account:")) {
      const accountId = Number(filter.slice("account:".length));
      return (post.socialAccountIds ?? []).includes(accountId);
    }
    return true;
  });
  const groups = groupByDay(filtered);
  const platforms = Array.from(new Set((scheduled ?? []).flatMap((p) => p.platforms))).sort();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="w-4 h-4" /> Upcoming Schedule
        </CardTitle>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms &amp; accounts</SelectItem>
            {platforms.length > 0 && (
              <SelectGroup>
                <SelectLabel>Platform</SelectLabel>
                {platforms.map((p) => (
                  <SelectItem key={p} value={`platform:${p}`}>{p}</SelectItem>
                ))}
              </SelectGroup>
            )}
            {accounts && accounts.length > 0 && (
              <SelectGroup>
                <SelectLabel>Account</SelectLabel>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={`account:${a.id}`}>{a.platform} — {a.accountName}</SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "all"
              ? "No posts are scheduled yet. Approve a post and set a publish time to see it here."
              : "No scheduled posts match this filter."}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map(({ day, items }) => (
              <div key={day.toISOString()}>
                <h3 className="text-sm font-semibold mb-2">{formatDayHeading(day)}</h3>
                <div className="space-y-2">
                  {items
                    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
                    .map((post) => (
                      <div key={post.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex -space-x-1 shrink-0">
                            {post.platforms.map((p) => (
                              <div key={p} className="w-6 h-6 rounded-full bg-muted border flex items-center justify-center" title={p}>
                                {getPlatformIcon(p)}
                              </div>
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm truncate max-w-md">{post.caption}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(post.scheduledAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <ScheduleDialog
                            postId={post.id}
                            title="Reschedule this post"
                            confirmLabel="Reschedule"
                            initialValue={new Date(post.scheduledAt!)}
                            onConfirm={onReschedule}
                            trigger={<Button size="sm" variant="outline">Reschedule</Button>}
                          />
                          <Button size="sm" variant="ghost" onClick={() => onCancelSchedule(post.id)}>
                            <CalendarX className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
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

  const invalidatePosts = () => {
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListScheduledPostsQueryKey() });
  };

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
  const handleSchedule = async (id: number, date: Date, force?: boolean) => {
    try {
      await schedulePost.mutateAsync({ id, data: { scheduledAt: date.toISOString(), force } });
      invalidatePosts();
      toast.success(`Scheduled for ${date.toLocaleString()}`);
      return;
    } catch (err: any) {
      // A 409 carrying `warnings` means the only problem is a missing/broken
      // platform connection — hand it back to the dialog so it can show the
      // warning and offer to schedule anyway, instead of a dead-end toast.
      const warnings = err?.data?.warnings;
      if (warnings && warnings.length > 0) return { warnings };
      toast.error(err?.data?.error ?? "Failed to schedule post");
      return;
    }
  };
  const handleReschedule = async (id: number, date: Date, force?: boolean): Promise<{ warnings?: { platform: string; message: string }[] } | void> => {
    try {
      await updatePost.mutateAsync({ id, data: { scheduledAt: date.toISOString(), force } });
      invalidatePosts();
      toast.success(`Rescheduled for ${date.toLocaleString()}`);
      return;
    } catch (err: any) {
      // A 409 carrying `warnings` means the only problem is a missing/broken
      // platform connection — hand it back to the dialog so it can show the
      // "confirm anyway" step, matching the initial-schedule flow exactly.
      const warnings = err?.data?.warnings;
      if (warnings && warnings.length > 0) return { warnings };
      toast.error(err?.data?.error ?? "Failed to reschedule post");
      return;
    }
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

      <UpcomingScheduleView
        getPlatformIcon={getPlatformIcon}
        onReschedule={handleReschedule}
        onCancelSchedule={handleCancelSchedule}
      />

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
                  <div className="flex items-center gap-1.5">
                    {post.autoPublishFailed && (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <AlertCircle className="w-3 h-3" /> Auto-publish failed
                      </Badge>
                    )}
                    <Badge variant="outline" className={getStatusColor(post.status)}>
                      {post.status}
                    </Badge>
                  </div>
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

                {post.autoPublishFailed && <AutoPublishFailureNotice postId={post.id} />}

                {post.linkMode === "checkout" && <CheckoutPaymentHealthWarning vendorId={1} />}

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