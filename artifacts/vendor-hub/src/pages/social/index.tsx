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
  type PostPublication,
} from "@workspace/api-client-react";
import { handleAddTikTokAccount } from "@/lib/social-connect";
import { filterScheduledPosts } from "@/lib/schedule-filters";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Twitter, Facebook, Linkedin, Instagram, Youtube, Share2, Clock, CheckCircle2, XCircle, Send, Link2, Trash2, ExternalLink, AlertCircle, CalendarClock, CalendarX, Search, Filter, X as XIcon, Loader2, Bookmark, BookmarkCheck, ChevronDown, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContentStudio } from "./content-studio";

/** Converts a Date to the value a <input type="datetime-local"> expects, in the browser's local timezone. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local input's value is naive local time with no offset — new Date(value) already parses it as local time. */
function fromDatetimeLocalValue(value: string): Date {
  return new Date(value);
}

const SCHEDULE_REOPEN_KEY = "schedule_reopen";
const SAVED_VIEWS_KEY = "schedule_saved_views";

type ScheduleReopenState = { postId: number; scheduledAt: string };

/** A named snapshot of the Upcoming Schedule filter state persisted to localStorage. */
type SavedView = {
  name: string;
  selectedFilters: string[];
  search: string;
  dateFrom: string;
  dateTo: string;
};

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // localStorage unavailable — silently skip persistence
  }
}

/**
 * Warns a vendor, before they confirm a schedule, that one or more of the
 * post's selected platforms has no usable connected account right now —
 * the exact situation that otherwise silently fails hours later when the
 * scheduled auto-publisher picks the post up. Checked live (not just from
 * already-loaded account state) so a stale accounts list can't hide a
 * warning the backend would still catch.
 *
 * Each warning row includes a "Connect" action so the vendor can fix the
 * problem without losing context:
 *  - OAuth platforms (Facebook/Instagram, LinkedIn, X) save the current
 *    post id and scheduled-at time to sessionStorage, then redirect to the
 *    provider's auth flow. On return, Social reads that key and
 *    automatically reopens the same schedule dialog so the vendor continues
 *    where they left off and can confirm the (now-empty) warnings list.
 *  - Manual-only platforms (TikTok) open a small inline add-account form;
 *    after saving, the warnings query is immediately invalidated so the row
 *    disappears without the vendor needing to reopen anything.
 */
function ConnectionWarningsNotice({
  postId,
  scheduledAtValue,
}: {
  postId: number;
  /** The current datetime-local value from the parent ScheduleDialog — persisted
   *  to sessionStorage before an OAuth redirect so the dialog can restore its state. */
  scheduledAtValue: string;
}) {
  const { data } = useGetPostConnectionWarnings(postId, {
    query: { enabled: true, queryKey: getGetPostConnectionWarningsQueryKey(postId) },
  });
  const queryClient = useQueryClient();
  const createAccount = useCreateSocialAccount();
  const [tiktokDialogOpen, setTiktokDialogOpen] = useState(false);
  const [tiktokAccountName, setTiktokAccountName] = useState("");

  const warnings = data?.warnings ?? [];
  if (warnings.length === 0) return null;

  const handleConnectPlatform = (platform: string, accountId?: number) => {
    const normalized = platform.toLowerCase();
    // When reconnecting an existing expired/revoked account, pass ?reconnect=<accountId>
    // so the OAuth callback updates the existing row instead of inserting a new one.
    const reconnectParam = accountId ? `?reconnect=${accountId}` : "";
    if (normalized === "facebook" || normalized === "instagram") {
      sessionStorage.setItem(SCHEDULE_REOPEN_KEY, JSON.stringify({ postId, scheduledAt: scheduledAtValue } satisfies ScheduleReopenState));
      window.location.href = `${BASE_URL}/api/social/oauth/meta/start${reconnectParam}`;
    } else if (normalized === "linkedin") {
      sessionStorage.setItem(SCHEDULE_REOPEN_KEY, JSON.stringify({ postId, scheduledAt: scheduledAtValue } satisfies ScheduleReopenState));
      window.location.href = `${BASE_URL}/api/social/oauth/linkedin/start${reconnectParam}`;
    } else if (normalized === "x" || normalized === "twitter") {
      sessionStorage.setItem(SCHEDULE_REOPEN_KEY, JSON.stringify({ postId, scheduledAt: scheduledAtValue } satisfies ScheduleReopenState));
      window.location.href = `${BASE_URL}/api/social/oauth/twitter/start${reconnectParam}`;
    } else if (normalized === "tiktok") {
      setTiktokDialogOpen(true);
    }
  };

  const handleAddTikTok = async () => {
    const result = await handleAddTikTokAccount({
      accountName: tiktokAccountName,
      vendorId: 1,
      postId,
      mutateAsync: createAccount.mutateAsync,
      connectionWarningsQueryKey: getGetPostConnectionWarningsQueryKey(postId),
      onInvalidateConnectionWarnings: (queryKey) =>
        queryClient.invalidateQueries({ queryKey: queryKey as string[] }),
      onInvalidateSocialAccounts: () =>
        queryClient.invalidateQueries({ queryKey: getListSocialAccountsQueryKey({ vendorId: 1 }) }),
    });
    if (result.ok) {
      toast.success("TikTok account connected");
      setTiktokAccountName("");
      setTiktokDialogOpen(false);
    } else if ("validationError" in result) {
      toast.error(result.validationError);
    } else {
      toast.error("Failed to connect account");
    }
  };

  return (
    <>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> This post may fail to auto-publish
        </div>
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{w.platform}:</span> {w.message}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] shrink-0"
                onClick={() => handleConnectPlatform(w.platform, w.accountId ?? undefined)}
              >
                {MANUAL_ONLY_PLATFORMS.includes(w.platform)
                  ? "Add account"
                  : w.accountId
                  ? "Reconnect"
                  : "Connect"}
              </Button>
            </div>
          ))}
        </div>
      </div>
      <Dialog open={tiktokDialogOpen} onOpenChange={setTiktokDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add TikTok Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              TikTok publishing is label-only — enter your account name so the post is tracked correctly.
            </p>
            <Input
              placeholder="TikTok account or username"
              value={tiktokAccountName}
              onChange={(e) => setTiktokAccountName(e.target.value)}
            />
            <Button className="w-full" onClick={handleAddTikTok} disabled={createAccount.isPending}>
              Add Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScheduleDialog({
  postId,
  trigger,
  title,
  initialValue,
  onConfirm,
  confirmLabel,
  defaultOpen,
}: {
  postId: number;
  trigger: ReactNode;
  title: string;
  initialValue?: Date;
  onConfirm: (postId: number, date: Date, force?: boolean) => Promise<{ warnings?: { platform: string; message: string }[] } | void>;
  confirmLabel: string;
  /** When true, the dialog opens immediately on (re-)mount — used to restore state after an OAuth redirect. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const minValue = toDatetimeLocalValue(new Date(Date.now() + 60 * 1000));
  const [value, setValue] = useState(() => toDatetimeLocalValue(initialValue ?? new Date(Date.now() + 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);
  // Set once the backend has rejected a plain schedule attempt because of a
  // connection warning — surfaces a "confirm anyway" step instead of a dead end.
  const [blockedWarnings, setBlockedWarnings] = useState<{ platform: string; message: string }[] | null>(null);

  // Auto-open when parent signals a restore after OAuth redirect.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

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
          <ConnectionWarningsNotice postId={postId} scheduledAtValue={value} />
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

/**
 * Returns the refetch interval for PostProcessingPublications: 15 s while any
 * row is still processing, false (stop polling) once all have resolved.
 *
 * Exported for unit testing.
 */
export function computePostProcessingRefetchInterval(
  rows: PostPublication[] | undefined
): number | false {
  const hasProcessing = (rows ?? []).some((p) => p.status === "processing");
  return hasProcessing ? 15_000 : false;
}

/**
 * Polls GET /posts/:id/publications for any "processing" entries on a published
 * Facebook video post and renders a yellow "Processing…" badge per row until
 * they resolve to "success" or "failed". Polling stops automatically once all
 * entries have left the processing state, so no timer leaks on resolved posts.
 */
export function PostProcessingPublications({ postId }: { postId: number }) {
  const { data: publications } = useListPostPublications(postId, {
    query: {
      queryKey: getListPostPublicationsQueryKey(postId),
      // Poll every 15 s while any row is still processing; stop once all resolve.
      refetchInterval: (query) =>
        computePostProcessingRefetchInterval(
          query.state.data as PostPublication[] | undefined
        ),
    },
  });

  const processing = (publications ?? []).filter((p: PostPublication) => p.status === "processing");
  if (processing.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-3">
      {processing.map((p) => (
        <div key={p.id} className="flex items-center gap-1.5 text-xs">
          <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
          <span className="font-medium">{p.platform}:</span>
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 text-xs py-0"
          >
            Processing…
          </Badge>
          <span className="text-muted-foreground">Video is being processed by Facebook and will be live shortly.</span>
        </div>
      ))}
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
 *
 * Filtering supports:
 *  - Multi-select platforms and/or accounts (any selected = OR logic; empty = all)
 *  - Free-text caption search
 *  - Date range (from / to) based on the post's scheduled date
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

  // Multi-select: set of "platform:<Platform>" | "account:<id>" strings.
  // Empty set = no filter applied (show all).
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Saved views — persisted to localStorage.
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");

  const platforms = Array.from(new Set((scheduled ?? []).flatMap((p) => p.platforms))).sort();

  const toggleFilter = (key: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSelectedFilters(new Set());
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = selectedFilters.size > 0 || search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const handleSaveView = () => {
    const name = saveViewName.trim();
    if (!name) {
      toast.error("Enter a name for this view");
      return;
    }
    if (savedViews.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A saved view with that name already exists");
      return;
    }
    const newView: SavedView = {
      name,
      selectedFilters: Array.from(selectedFilters),
      search,
      dateFrom,
      dateTo,
    };
    const next = [...savedViews, newView];
    setSavedViews(next);
    persistSavedViews(next);
    setSaveViewName("");
    setSaveViewOpen(false);
    toast.success(`Saved view "${name}"`);
  };

  const handleRestoreView = (view: SavedView) => {
    setSelectedFilters(new Set(view.selectedFilters));
    setSearch(view.search);
    setDateFrom(view.dateFrom);
    setDateTo(view.dateTo);
    setSavedViewsOpen(false);
    toast.success(`Applied view "${view.name}"`);
  };

  const handleDeleteView = (name: string) => {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    persistSavedViews(next);
    toast.success(`Deleted view "${name}"`);
  };

  const filtered = filterScheduledPosts(scheduled ?? [], { selectedFilters, search, dateFrom, dateTo });

  const groups = groupByDay(filtered);

  // Active filter labels for the badge count on the popover trigger.
  const activeFilterCount = selectedFilters.size + (search.trim() ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-4 h-4" /> Upcoming Schedule
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Saved views dropdown */}
            <Popover open={savedViewsOpen} onOpenChange={setSavedViewsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                  <Bookmark className="w-3.5 h-3.5" />
                  Saved views
                  {savedViews.length > 0 && (
                    <Badge className="ml-0.5 h-4 min-w-4 px-1 text-[10px] rounded-full">{savedViews.length}</Badge>
                  )}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                {savedViews.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1.5">
                    No saved views yet. Set a filter and click "Save view" to pin it.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {savedViews.map((view) => (
                      <div key={view.name} className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted group">
                        <button
                          type="button"
                          className="flex-1 text-left text-sm truncate px-1"
                          onClick={() => handleRestoreView(view)}
                        >
                          {view.name}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                          title={`Delete "${view.name}"`}
                          onClick={() => handleDeleteView(view.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Save current filter as a named view */}
            {hasActiveFilters && (
              <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                    <BookmarkCheck className="w-3.5 h-3.5" /> Save view
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Save current filter as…</p>
                    <Input
                      className="h-8 text-sm"
                      placeholder="View name"
                      value={saveViewName}
                      onChange={(e) => setSaveViewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveView(); }}
                      autoFocus
                    />
                    <Button size="sm" className="w-full h-8 text-xs" onClick={handleSaveView}>
                      Save
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearAllFilters}>
                <XIcon className="w-3 h-3 mr-1" /> Clear filters
              </Button>
            )}
          </div>
        </div>
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Caption search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search captions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Platform / Account multi-select popover */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Platforms &amp; Accounts
                {selectedFilters.size > 0 && (
                  <Badge className="ml-0.5 h-4 min-w-4 px-1 text-[10px] rounded-full">{selectedFilters.size}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              {platforms.length === 0 && (!accounts || accounts.length === 0) ? (
                <p className="text-xs text-muted-foreground">No platforms or accounts yet.</p>
              ) : (
                <div className="space-y-3">
                  {platforms.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Platform</p>
                      <div className="space-y-1.5">
                        {platforms.map((p) => {
                          const key = `platform:${p}`;
                          return (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={selectedFilters.has(key)}
                                onCheckedChange={() => toggleFilter(key)}
                              />
                              <span className="text-sm">{p}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {platforms.length > 0 && accounts && accounts.length > 0 && (
                    <Separator />
                  )}
                  {accounts && accounts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Account</p>
                      <div className="space-y-1.5">
                        {accounts.map((a) => {
                          const key = `account:${a.id}`;
                          return (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={selectedFilters.has(key)}
                                onCheckedChange={() => toggleFilter(key)}
                              />
                              <span className="text-sm truncate">{a.platform} — {a.accountName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedFilters.size > 0 && (
                    <>
                      <Separator />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => setSelectedFilters(new Set())}
                      >
                        Clear platform/account selection
                      </Button>
                    </>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-8 text-sm w-[140px]"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              className="h-8 text-sm w-[140px]"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                title="Clear date range"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {selectedFilters.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selectedFilters).map((f) => {
              let label = f;
              if (f.startsWith("platform:")) label = f.slice("platform:".length);
              else if (f.startsWith("account:")) {
                const id = Number(f.slice("account:".length));
                const acct = accounts?.find((a) => a.id === id);
                label = acct ? `${acct.platform} — ${acct.accountName}` : `Account ${id}`;
              }
              return (
                <Badge key={f} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
                  {label}
                  <button
                    type="button"
                    className="hover:text-foreground text-muted-foreground ml-0.5"
                    onClick={() => toggleFilter(f)}
                  >
                    <XIcon className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {!hasActiveFilters
              ? "No posts are scheduled yet. Approve a post and set a publish time to see it here."
              : `No scheduled posts match ${activeFilterCount > 1 ? "these filters" : "this filter"}.`}
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

  // After an OAuth redirect from the schedule-dialog warning, restore the
  // dialog open state so the vendor can finish scheduling without friction.
  const [scheduleReopen, setScheduleReopen] = useState<ScheduleReopenState | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SCHEDULE_REOPEN_KEY);
      if (raw) {
        sessionStorage.removeItem(SCHEDULE_REOPEN_KEY);
        const state = JSON.parse(raw) as ScheduleReopenState;
        setScheduleReopen(state);
        // Ensure the warnings query refetches in the reopened dialog.
        queryClient.invalidateQueries({ queryKey: getGetPostConnectionWarningsQueryKey(state.postId) });
        // Also refresh the accounts list so the newly-connected account is visible.
        queryClient.invalidateQueries({ queryKey: getListSocialAccountsQueryKey({ vendorId: 1 }) });
      }
    } catch {
      // Malformed sessionStorage entry — ignore.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const processing = result.publications.filter((p) => p.status === "processing").length;
      const failed = result.publications.filter((p) => p.status === "failed").length;
      if (failed === 0 && processing === 0) toast.success("Published to all selected platforms");
      else if (processing > 0 && failed === 0) toast.success(`Published${succeeded > 0 ? ` to ${succeeded} platform${succeeded === 1 ? "" : "s"}` : ""} — Facebook video is processing and will be live shortly`);
      else if (failed === 0) toast.success("Published to all selected platforms");
      else if (succeeded + processing > 0) toast.warning(`Published to ${succeeded + processing} platform${succeeded + processing === 1 ? "" : "s"}, ${failed} failed — see details on the post`);
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
    <div className="p-8 max-w-7xl mx-auto space-y-6 w-full">
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

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="studio">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            AI Content Studio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-6 space-y-8">
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
                        ) : r.status === "processing" ? (
                          <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium">{r.platform}:</span>
                        {r.status === "success" && r.externalUrl ? (
                          <a href={r.externalUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-0.5 truncate">
                            View live post <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : r.status === "processing" ? (
                          <span className="text-amber-600 truncate">Processing… video will be live shortly</span>
                        ) : (
                          <span className="text-muted-foreground truncate">{r.errorMessage}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {post.status === "published" && <PostProcessingPublications postId={post.id} />}

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
                        defaultOpen={scheduleReopen?.postId === post.id}
                        initialValue={scheduleReopen?.postId === post.id && scheduleReopen.scheduledAt ? new Date(scheduleReopen.scheduledAt) : undefined}
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
                        initialValue={scheduleReopen?.postId === post.id && scheduleReopen.scheduledAt ? new Date(scheduleReopen.scheduledAt) : (post.scheduledAt ? new Date(post.scheduledAt) : undefined)}
                        onConfirm={handleReschedule}
                        defaultOpen={scheduleReopen?.postId === post.id}
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
        </TabsContent>

        <TabsContent value="studio" className="mt-6">
          <ContentStudio />
        </TabsContent>
      </Tabs>
    </div>
  );
}