import { useRef, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Sparkles, Image as ImageIcon, Video as VideoIcon, CalendarClock, ShoppingBag, Link as LinkIcon, Copy, Check, Loader2, Send, Upload, RefreshCw, Film, X } from "lucide-react";
import {
  useCreatePost, useUpdatePost, useListProducts, useGenerateAiCaption, useGenerateAiImage,
  useGenerateAiVideoScenes, useRegenerateAiVideoScene, useRenderAiVideo,
  useGetAiVideoUploadUrl, useGetAiImageUploadUrl, useAnalyzeVideoCaption, useSubmitPostForReview, useListSocialAccounts,
  useGetDraftVideoScenes, useSaveDraftVideoScenes, useClearDraftVideoScenes,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPostsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type LinkMode = "none" | "interest" | "checkout";

/** Mirrors MAX_PROMPT_LEN in artifacts/api-server/src/routes/ai.ts */
const MAX_SCENE_PROMPT_LEN = 500;

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-600' },
  { id: 'twitter', label: 'Twitter/X', color: 'bg-zinc-900' },
  { id: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-teal-600' }
];

// Mirrors artifacts/api-server/src/lib/platform-constraints.ts — kept as a small
// frontend copy so Compose can show format guidance without a network round trip.
// Purely informational: publishing still relies on each platform's own API validation.
const PLATFORM_SPECS: Record<string, { captionMax: number; image: string; video: string }> = {
  facebook: { captionMax: 63206, image: "Square (1:1) or portrait (4:5)", video: "Up to ~4hr, 1:1 or 4:5 crops preview best" },
  instagram: { captionMax: 2200, image: "Square (1:1) or portrait (4:5)", video: "Vertical (9:16), up to 90s, needs a public URL to publish" },
  twitter: { captionMax: 280, image: "Landscape (16:9)", video: "Landscape (16:9), up to ~2m20s" },
  linkedin: { captionMax: 3000, image: "Landscape (1.91:1)", video: "16:9 or 1:1, up to 10 min — first 3s matter (autoplays muted)" },
  tiktok: { captionMax: 2200, image: "Vertical (9:16)", video: "Full-bleed vertical (9:16), up to 10 min" },
};

/** Mirrors the server's normalizePlatformKey so account.platform ("Facebook", "X (Twitter)", ...) matches a PLATFORMS id. */
function normalizePlatformKey(platform: string): string {
  const p = platform.trim().toLowerCase();
  if (p === "x" || p === "twitter" || p.startsWith("x (")) return "twitter";
  return p;
}

/** Converts a Date to the value a <input type="datetime-local"> expects, in the browser's local timezone. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreatePost() {
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [linkMode, setLinkMode] = useState<LinkMode>("none");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [, setLocation] = useLocation();

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [selectedAccountByPlatform, setSelectedAccountByPlatform] = useState<Record<string, number>>({});
  const [sceneCount, setSceneCount] = useState<1 | 2 | 3>(1);
  const [motionTemplate, setMotionTemplate] = useState<"auto" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "zoom-pan">("auto");
  const [includeMusic, setIncludeMusic] = useState(false);
  // Session-storage key used to persist scene previews (including edited
  // prompts) across accidental reloads. Cleared whenever scenes are discarded
  // or the vendor finishes rendering the video.
  const SCENE_STORAGE_KEY = "vendorhub:video-scenes-draft";

  // Scene previews the vendor can review/regenerate before any render (and
  // therefore before any aiVideos quota) is spent. Each entry mirrors the
  // AiGeneration (type "image") row the server created for that scene.
  // Initialised lazily from sessionStorage so a reload restores any edits.
  const [videoScenes, setVideoScenes] = useState<{ id: number; prompt: string; imageUrl: string }[] | null>(() => {
    try {
      const stored = sessionStorage.getItem("vendorhub:video-scenes-draft");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  // Debounce timer ref for server-side draft saves so rapid prompt edits
  // don't fire a network request on every keystroke.
  const serverDraftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the server-side draft DELETE from firing before the initial restore
  // decision has been made. Starts false; becomes true once either (a) scenes
  // are set to a non-null value (sessionStorage restored or server restored), or
  // (b) the server query resolves with no scenes to restore. Until this flag is
  // true, any null videoScenes value is the initial mount state, not a
  // user-initiated discard, and must NOT trigger a server DELETE.
  const draftHydratedRef = useRef(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<number | null>(null);
  const [uploadedVideoStage, setUploadedVideoStage] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [uploadingImage, setUploadingImage] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Warn the vendor before they lose unsaved scene previews (which already
  // spent aiImages quota). Three layered guards:
  //   1. beforeunload  — browser refresh or tab close
  //   2. pushState patch — every in-app SPA navigation (sidebar links,
  //                        <Link> components, setLocation() calls)
  //   3. popstate listener — browser back / forward button
  //
  // ─── Browser compatibility matrix ────────────────────────────────────────
  //
  //  Chrome (desktop, ≥76)
  //    beforeunload: fires IF the page has received at least one user gesture
  //    (click, keydown, scroll). Pages loaded fresh without any interaction
  //    silently suppress the dialog — Chrome's anti-abuse policy. The custom
  //    message text is also ignored; Chrome shows its own generic string.
  //    pushState patch (Guard 2): works reliably.
  //    popstate (Guard 3): works reliably.
  //
  //  Firefox (desktop)
  //    beforeunload: fires reliably; shows a browser-native dialog. Custom
  //    message text is ignored (Firefox replaced it with a generic string in
  //    v44 to prevent phishing). Guards 2 & 3 work reliably.
  //
  //  Safari (desktop, ≥12.1)
  //    beforeunload: fires reliably but ignores the returnValue string —
  //    Safari shows its own "Are you sure you want to leave?" dialog.
  //    Guards 2 & 3 work reliably.
  //
  //  Mobile Safari (iOS, all versions)
  //    beforeunload: NOT supported — the event fires but the browser does NOT
  //    pause navigation or show any dialog. iOS intentionally omits this
  //    behaviour. Guard 1 provides ZERO protection here.
  //    pushState patch (Guard 2): works for in-app navigation.
  //    popstate (Guard 3): works for the browser back button, but the URL
  //    change is instant and the confirm() call may open with a short delay on
  //    older iOS; in practice the guard still catches it.
  //
  //  Chrome Android (≥80)
  //    beforeunload: inconsistently suppressed — Google has deprioritised the
  //    event on Android to match the back-navigation model used on mobile.
  //    Vendors who tap the system Back button or close the tab may not see a
  //    dialog even after interacting with the page.
  //    Guards 2 & 3 work for in-app navigations; system-level gestures remain
  //    uncatchable.
  //
  //  Samsung Internet / WebView / other Android browsers
  //    beforeunload: similarly unreliable. Treat the same as Chrome Android.
  //
  // ─── UX fallback ─────────────────────────────────────────────────────────
  //
  //  Because beforeunload is silent on iOS and unreliable on Android, a
  //  persistent in-page banner is rendered whenever hasUnconfirmedScenes is
  //  true (see the JSX below). The banner:
  //    • is always visible — no browser permissions required
  //    • reinforces the disk-icon reminder that credits have already been spent
  //    • gives the vendor a one-click path to render or discard without
  //      needing to navigate away first
  //  This makes Guard 1 effectively optional on mobile — the banner alone is
  //  sufficient to prevent accidental loss in the most common use pattern
  //  (vendor reviews scenes on the same screen before navigating).
  //
  const hasUnconfirmedScenes = videoScenes !== null && videoScenes.length > 0;

  const SCENE_GUARD_MSG =
    "You have scene previews that haven't been rendered yet.\n\n" +
    "Leaving now will discard them — the AI image credits already spent cannot be recovered.\n\n" +
    "Leave anyway?";

  // Ref used by the popstate handler to skip the synthetic popstate that
  // history.go(1) fires when we restore the URL after a declined back navigation.
  const popstateRestoringRef = useRef(false);

  useEffect(() => {
    if (!hasUnconfirmedScenes) return;

    // Guard 1: browser hard unload (refresh / tab close).
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = SCENE_GUARD_MSG;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Guard 2: in-app SPA navigation — patch history.pushState so all route
    // changes (sidebar <Link>s, breadcrumbs, setLocation calls) are intercepted.
    // Same-path navigations (hash changes, query-string updates) pass through
    // unchanged because they don't navigate away from this page.
    //
    // Sequence tagging: tag every history entry pushed while the guard is
    // active with a monotonically increasing _gs counter. The current (guard)
    // entry gets sequence 1. Any entry pushed after that gets 2, 3, …
    // The popstate handler uses these values to distinguish back vs. forward:
    //   newSeq < GUARD_SEQ  → the user went back  → go(+1) to restore
    //   newSeq > GUARD_SEQ  → the user went forward → go(-1) to restore
    const GUARD_SEQ = 1;
    let seq = GUARD_SEQ;
    // Tag the current history entry so the popstate handler can detect direction.
    history.replaceState(
      { ...(history.state as object | null ?? {}), _gs: GUARD_SEQ },
      "",
    );

    const originalPushState = history.pushState.bind(history);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (history as any).pushState = function (state: unknown, title: string, url?: string | URL | null) {
      const targetPath = url
        ? new URL(String(url), window.location.href).pathname
        : window.location.pathname;
      if (targetPath === window.location.pathname) {
        return originalPushState(state, title, url);
      }
      if (!window.confirm(SCENE_GUARD_MSG)) return; // block — user stays
      seq++;
      return originalPushState({ ...(state as object | null ?? {}), _gs: seq }, title, url);
    };

    // Guard 3: browser back / forward button.
    // popstate fires AFTER the URL has already changed, so we must reverse the
    // navigation if the user declines. We determine direction from the _gs tag:
    // a sequence lower than GUARD_SEQ means we went back (older entry);
    // a sequence higher means we went forward (newer entry).
    const handlePopState = () => {
      if (popstateRestoringRef.current) {
        popstateRestoringRef.current = false;
        return;
      }
      const newSeq: number = (history.state as { _gs?: number } | null)?._gs ?? 0;
      const wentBack = newSeq < GUARD_SEQ;

      if (!window.confirm(SCENE_GUARD_MSG)) {
        popstateRestoringRef.current = true;
        // Reverse the navigation: back→go(+1), forward→go(-1).
        history.go(wentBack ? 1 : -1);
      }
      // If confirmed: URL already changed; wouter re-renders the new route.
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (history as any).pushState = originalPushState;
    };
  // SCENE_GUARD_MSG is a stable string literal; excluding from deps is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnconfirmedScenes]);

  // Persist scene previews (including any edited prompts) to sessionStorage AND
  // server-side so they survive accidental reloads AND browser crashes / tab
  // restores. Server saves are debounced (800 ms) so rapid prompt edits don't
  // hammer the network.
  //
  // The server DELETE only fires once draftHydratedRef is true, which prevents
  // the initial-mount null state (before the server-restore effect has run)
  // from wiping the very draft we're trying to recover.
  useEffect(() => {
    if (videoScenes === null) {
      sessionStorage.removeItem(SCENE_STORAGE_KEY);
      if (serverDraftSaveTimerRef.current) {
        clearTimeout(serverDraftSaveTimerRef.current);
        serverDraftSaveTimerRef.current = null;
      }
      // Only delete the server draft after hydration is complete — i.e. this
      // null is a user-initiated discard/render, not the initial mount state.
      if (draftHydratedRef.current) {
        clearDraft.mutate({ data: { vendorId: 1 } });
      }
    } else {
      // Scenes are set (either from sessionStorage lazy init or from restore) —
      // hydration is definitively complete from this point on.
      draftHydratedRef.current = true;
      try {
        sessionStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(videoScenes));
      } catch {
        // sessionStorage full or unavailable — silently skip local persistence.
      }
      // Debounced server save — fire and forget (errors are non-critical;
      // sessionStorage still protects against reloads).
      if (serverDraftSaveTimerRef.current) clearTimeout(serverDraftSaveTimerRef.current);
      serverDraftSaveTimerRef.current = setTimeout(() => {
        saveDraft.mutate({ data: { vendorId: 1, scenes: videoScenes } });
      }, 800);
    }
  // SCENE_STORAGE_KEY and the mutation fns are stable references.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoScenes]);

  // Simple back navigation — the pushState patch above handles the confirm
  // dialog so this can just call setLocation unconditionally.
  const handleNavBack = useCallback(() => {
    setLocation("/social");
  }, [setLocation]);

  const { data: products } = useListProducts({ vendorId: 1 });
  const { data: socialAccounts } = useListSocialAccounts({ vendorId: 1 });
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const generateCaption = useGenerateAiCaption();
  const generateImage = useGenerateAiImage();
  const generateVideoScenes = useGenerateAiVideoScenes();
  const regenerateVideoScene = useRegenerateAiVideoScene();
  const renderVideo = useRenderAiVideo();
  const getVideoUploadUrl = useGetAiVideoUploadUrl();
  const getImageUploadUrl = useGetAiImageUploadUrl();
  const analyzeVideoCaption = useAnalyzeVideoCaption();
  const submitForReviewMutation = useSubmitPostForReview();
  const queryClient = useQueryClient();

  // Server-side draft persistence — survives browser crashes and cleared
  // sessionStorage (e.g. after a tab restores from a previous session).
  const { data: serverDraft } = useGetDraftVideoScenes({ vendorId: 1 });
  const saveDraft = useSaveDraftVideoScenes();
  const clearDraft = useClearDraftVideoScenes();

  // Restore scenes from the server draft when sessionStorage had nothing (i.e.
  // the initial state was null). Runs once after the server query resolves.
  // Shows a toast so the vendor knows their previous edits were recovered.
  //
  // Also marks draftHydratedRef true in both branches once the server query has
  // resolved — this lets the persistence effect safely call clearDraft after
  // any subsequent user-initiated discard or render.
  useEffect(() => {
    // Still loading — wait for the query to resolve before making any decision.
    if (serverDraft === undefined) return;

    if (videoScenes !== null) {
      // sessionStorage already restored a draft — hydration is complete.
      draftHydratedRef.current = true;
      return;
    }

    if (!serverDraft.scenes || serverDraft.scenes.length === 0) {
      // Server has no draft either — mark hydrated so future discards correctly
      // call clearDraft instead of being silently skipped.
      draftHydratedRef.current = true;
      return;
    }

    // Server has a draft and sessionStorage was empty — restore it.
    setVideoScenes(serverDraft.scenes);
    // draftHydratedRef.current will be set to true by the videoScenes effect
    // when it fires with the newly-set non-null scenes value.
    toast.info(`Your ${serverDraft.scenes.length} scene preview${serverDraft.scenes.length > 1 ? "s" : ""} from your last session have been restored — review and render when ready`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDraft]);

  // Pre-fill composer from the AI Content Studio ("Use in Post" button).
  // Runs once on mount; clears the sessionStorage key immediately so a
  // subsequent page load doesn't double-apply the same prefill.
  useEffect(() => {
    const stored = sessionStorage.getItem("vendorhub:studio-prefill");
    if (!stored) return;
    sessionStorage.removeItem("vendorhub:studio-prefill");
    try {
      const prefill = JSON.parse(stored) as {
        caption?: string;
        imageUrl?: string;
        videoScenes?: { id: number; prompt: string; imageUrl: string }[];
      };
      if (prefill.caption) setCaption(prefill.caption);
      if (prefill.imageUrl) {
        setGeneratedImage(prefill.imageUrl);
        setGeneratedVideo(null);
        setVideoScenes(null);
      }
      if (prefill.videoScenes && prefill.videoScenes.length > 0) {
        setVideoScenes(prefill.videoScenes);
        setGeneratedImage(null);
        setGeneratedVideo(null);
      }
    } catch {
      // Malformed prefill — silently ignore.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateCaption = async () => {
    if (!caption.trim()) {
      toast.error("Give the AI a topic to write about first (type a few words in the caption box)");
      return;
    }
    try {
      const result = await generateCaption.mutateAsync({
        data: { vendorId: 1, topic: caption, platform: selectedPlatforms[0], tone: "professional", includeHashtags: true, includeEmoji: true },
      });
      if (result.status === "failed") { toast.error(result.result ?? "Caption generation failed"); return; }
      setCaption(result.result ?? caption);
      toast.success("Caption drafted by AI — review and edit as needed");
    } catch {
      toast.error("Failed to generate caption");
    }
  };

  const handleGenerateImage = async () => {
    if (!caption.trim()) {
      toast.error("Write a caption first so the image matches your post");
      return;
    }
    try {
      const result = await generateImage.mutateAsync({ data: { vendorId: 1, prompt: caption } });
      if (result.status === "failed") { toast.error(result.result ?? "Image generation failed"); return; }
      setGeneratedImage(result.result ?? null);
      setGeneratedVideo(null);
      setVideoScenes(null);
      toast.success("Image generated — review before publishing");
    } catch {
      toast.error("Failed to generate image");
    }
  };

  // Step 1 of AI video: generate scene preview images only (no render, no
  // aiVideos quota spent) so the vendor can see what each scene looks like
  // first.
  const handlePreviewVideoScenes = async () => {
    if (!caption.trim()) {
      toast.error("Write a caption first so the video matches your post");
      return;
    }
    if (caption.length > MAX_SCENE_PROMPT_LEN) {
      toast.error(`Caption is too long (${caption.length}/${MAX_SCENE_PROMPT_LEN} characters) — shorten it before generating scenes`);
      return;
    }
    try {
      const result = await generateVideoScenes.mutateAsync({ data: { vendorId: 1, prompt: caption, sceneCount } });
      const failed = result.scenes.find((s) => s.status === "failed");
      if (failed) { toast.error(failed.result ?? "Scene generation failed"); return; }
      setVideoScenes(result.scenes.map((s) => ({ id: s.id, prompt: s.prompt, imageUrl: s.result ?? "" })));
      setGeneratedVideo(null);
      setGeneratedImage(null);
      toast.success(`Generated ${result.scenes.length} scene${result.scenes.length > 1 ? "s" : ""} — review below, then render the video`);
    } catch {
      toast.error("Failed to generate scene previews");
    }
  };

  // Updates a single scene's prompt text in local state so the vendor can
  // steer the next regeneration without touching the other scenes.
  const handleScenePromptChange = (index: number, newPrompt: string) => {
    setVideoScenes((prev) =>
      prev ? prev.map((s, i) => (i === index ? { ...s, prompt: newPrompt } : s)) : prev,
    );
  };

  // Regenerates just one scene's image, leaving the others (and any quota
  // already spent on them) untouched.
  const handleRegenerateScene = async (index: number) => {
    if (!videoScenes) return;
    const scene = videoScenes[index];
    setRegeneratingSceneId(scene.id);
    try {
      const result = await regenerateVideoScene.mutateAsync({ data: { vendorId: 1, prompt: scene.prompt } });
      if (result.status === "failed") { toast.error(result.result ?? "Scene regeneration failed"); return; }
      setVideoScenes((prev) =>
        prev ? prev.map((s, i) => (i === index ? { id: result.id, prompt: result.prompt, imageUrl: result.result ?? "" } : s)) : prev,
      );
      toast.success("Scene regenerated");
    } catch {
      toast.error("Failed to regenerate scene");
    } finally {
      setRegeneratingSceneId(null);
    }
  };

  // Step 2: once every scene looks right, stitch the confirmed images into
  // the final video — this is the only step that spends aiVideos quota.
  const handleRenderVideo = async () => {
    if (!videoScenes || videoScenes.length === 0) return;
    try {
      const result = await renderVideo.mutateAsync({
        data: {
          vendorId: 1,
          prompt: caption,
          sceneImageUrls: videoScenes.map((s) => s.imageUrl),
          captionText: caption,
          motionTemplate,
          includeMusic,
        },
      });
      if (result.status === "failed") { toast.error(result.result ?? "Video generation failed"); return; }
      setGeneratedVideo(result.result ?? null);
      setGeneratedImage(null);
      setVideoScenes(null);
      toast.success("Video generated — review before publishing");
    } catch {
      toast.error("Failed to render video");
    }
  };

  const handleDiscardScenes = () => setVideoScenes(null);

  const handleVideoFileSelected = async (file: File) => {
    const MAX_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("Video is too large (max 100MB)");
      return;
    }
    try {
      setUploadedVideoStage("uploading");
      const { uploadUrl, videoUrl } = await getVideoUploadUrl.mutateAsync({ data: { vendorId: 1 } });
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");

      setUploadedVideoStage("analyzing");
      const result = await analyzeVideoCaption.mutateAsync({
        data: { vendorId: 1, videoUrl, platform: selectedPlatforms[0], tone: "professional", includeHashtags: true, includeEmoji: true },
      });
      if (result.status === "failed") { toast.error(result.result ?? "Couldn't analyze the video"); return; }

      setGeneratedVideo(videoUrl);
      setGeneratedImage(null);
      setVideoScenes(null);
      setCaption(result.result ?? caption);
      toast.success("AI watched your video and drafted a caption — review and edit as needed");
    } catch {
      toast.error("Failed to upload/analyze video");
    } finally {
      setUploadedVideoStage("idle");
    }
  };

  const handleImageFileSelected = async (file: File) => {
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("Photo is too large (max 20MB)");
      return;
    }
    try {
      setUploadingImage(true);
      const { uploadUrl, imageUrl } = await getImageUploadUrl.mutateAsync({ data: { vendorId: 1 } });
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");

      setGeneratedImage(imageUrl);
      setGeneratedVideo(null);
      setVideoScenes(null);
      toast.success("Photo attached — it'll be used as this post's media");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploadingImage(false);
    }
  };

  const accountsForPlatform = (platformId: string) =>
    (socialAccounts ?? []).filter((a) => normalizePlatformKey(a.platform) === platformId && a.status === "active");

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      return next;
    });
    // Auto-pick the account when there's exactly one connected account for this
    // platform; when there are several, the vendor must choose explicitly below
    // so publishing never guesses which live account to post to.
    if (!selectedPlatforms.includes(id)) {
      const matches = accountsForPlatform(id);
      if (matches.length === 1) {
        setSelectedAccountByPlatform((prev) => ({ ...prev, [id]: matches[0].id }));
      }
    } else {
      setSelectedAccountByPlatform((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const toggleProduct = (id: number) => {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handlePublish = async (mode: "draft" | "review" | "schedule") => {
    if (!caption || selectedPlatforms.length === 0) {
      toast.error("Please enter a caption and select at least one platform");
      return;
    }
    if (selectedProductIds.length > 0 && linkMode === "none") {
      toast.error("Choose what customers can do with the shop link (express interest or check out)");
      return;
    }
    const ambiguousPlatform = selectedPlatforms.find((id) => accountsForPlatform(id).length > 1 && !selectedAccountByPlatform[id]);
    if (ambiguousPlatform) {
      const label = PLATFORMS.find((p) => p.id === ambiguousPlatform)?.label ?? ambiguousPlatform;
      toast.error(`You have multiple ${label} accounts connected — choose which one this post goes to.`);
      return;
    }
    let scheduledDate: Date | null = null;
    if (mode === "schedule") {
      scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        toast.error("Pick a date/time in the future to schedule this post");
        return;
      }
    }

    try {
      const post = await createPost.mutateAsync({
        data: {
          vendorId: 1, // hardcoded for demo, normally from context
          caption,
          platforms: selectedPlatforms,
          socialAccountIds: selectedPlatforms.map((id) => selectedAccountByPlatform[id] ?? 0),
          productIds: selectedProductIds,
          linkMode,
          ...(generatedVideo
            ? { mediaUrls: [generatedVideo], mediaType: "video" }
            : generatedImage
              ? { mediaUrls: [generatedImage], mediaType: "image" }
              : {}),
          ...(scheduledDate ? { scheduledAt: scheduledDate.toISOString() } : {}),
        }
      });

      if (post.shareToken) {
        // Always append the shop link to the bottom of the caption once we know the token.
        const url = `${window.location.origin}${BASE_URL}/p/${post.shareToken}`;
        const cta = linkMode === "checkout" ? "🛍️ Shop this post" : "🛍️ Interested? Let us know";
        const finalCaption = `${caption}\n\n${cta}: ${url}`;
        await updatePost.mutateAsync({ id: post.id, data: { caption: finalCaption } });
        setShareUrl(url);
      }

      // AI-drafted posts must be approved by a vendor/admin before publishing —
      // this only moves the post to "pending_review", it never publishes directly.
      // Scheduled posts skip review — a vendor scheduling their own post for a
      // chosen time is the approval, and the background job publishes it
      // automatically once scheduledAt arrives.
      if (mode === "review") {
        await submitForReviewMutation.mutateAsync({ id: post.id });
      }

      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      toast.success(mode === "schedule" ? `Scheduled for ${scheduledDate!.toLocaleString()}` : mode === "review" ? "Post submitted for review" : "Draft saved");
      if (!post.shareToken) setLocation("/social");
    } catch (e) {
      toast.error("Failed to save post");
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleNavBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Compose Post</h1>
      </div>

      {/* Persistent scene-preview warning banner — visible on all browsers
          including Mobile Safari and Chrome Android where the beforeunload
          dialog is suppressed or unreliable. This is the primary guard on
          mobile; the beforeunload / pushState / popstate guards are a
          secondary layer on desktop browsers that support them. */}
      {hasUnconfirmedScenes && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Film className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="flex-1 leading-snug">
            <span className="font-semibold">You have scene previews that haven't been rendered yet.</span>
            {" "}AI image credits were already spent to generate them — navigating away will discard those scenes permanently.
            Render the video or discard the scenes before leaving.
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 h-full">
        {/* Editor Side */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Platforms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                      selectedPlatforms.includes(p.id) 
                        ? `${p.color} text-white border-transparent` 
                        : 'bg-transparent text-foreground hover:bg-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {selectedPlatforms.some((id) => accountsForPlatform(id).length > 1) && (
                <div className="mt-3 space-y-2">
                  {selectedPlatforms.filter((id) => accountsForPlatform(id).length > 1).map((id) => (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-20">{PLATFORMS.find((p) => p.id === id)?.label}:</span>
                      <select
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={selectedAccountByPlatform[id] ?? ""}
                        onChange={(e) => setSelectedAccountByPlatform((prev) => ({ ...prev, [id]: Number(e.target.value) }))}
                      >
                        <option value="" disabled>Choose which account...</option>
                        {accountsForPlatform(id).map((a) => (
                          <option key={a.id} value={a.id}>{a.accountName}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {selectedPlatforms.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">Connect accounts from the Social Hub to publish for real once approved.</p>
              )}
              {selectedPlatforms.length > 0 && (
                <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Format guidance — each platform crops/plays media differently:</p>
                  {selectedPlatforms.map((id) => {
                    const spec = PLATFORM_SPECS[id];
                    if (!spec) return null;
                    const label = PLATFORMS.find((p) => p.id === id)?.label ?? id;
                    return (
                      <div key={id} className="text-xs leading-relaxed">
                        <span className="font-semibold">{label}:</span>{" "}
                        <span className="text-muted-foreground">
                          image {spec.image} · video {spec.video} · caption up to {spec.captionMax.toLocaleString()} chars
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Caption</CardTitle>
              <Button variant="outline" size="sm" className="h-8" onClick={handleGenerateCaption} disabled={generateCaption.isPending}>
                {generateCaption.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2 text-primary" />}
                AI Writer
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea 
                placeholder="What do you want to share?"
                className="min-h-[200px] resize-none text-base"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <div className="flex justify-between items-center mt-3 text-sm text-muted-foreground">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleGenerateImage} disabled={generateImage.isPending || generateVideoScenes.isPending}>
                    {generateImage.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                    AI Image
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handlePreviewVideoScenes} disabled={generateImage.isPending || generateVideoScenes.isPending || !!videoScenes}>
                    {generateVideoScenes.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <VideoIcon className="w-4 h-4 mr-2" />}
                    AI Video
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => videoFileInputRef.current?.click()}
                    disabled={uploadedVideoStage !== "idle"}
                  >
                    {uploadedVideoStage !== "idle" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadedVideoStage === "uploading" ? "Uploading…" : uploadedVideoStage === "analyzing" ? "AI watching your video…" : "Upload My Video"}
                  </Button>
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) handleVideoFileSelected(file);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => imageFileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadingImage ? "Uploading…" : "Upload Photo"}
                  </Button>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) handleImageFileSelected(file);
                    }}
                  />
                </div>
                <span>{caption.length} / 2200</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                "Upload My Video" lets AI watch your own footage and write a caption grounded in what it actually shows — different from "AI Video", which generates a new video from an image. "Upload Photo" attaches your own picture directly, no AI involved.
              </p>
              {!generatedVideo && !videoScenes && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">
                    Scenes
                    <select
                      className="rounded-md border bg-background px-1.5 py-1 text-xs"
                      value={sceneCount}
                      onChange={(e) => setSceneCount(Number(e.target.value) as 1 | 2 | 3)}
                      disabled={generateVideoScenes.isPending}
                    >
                      <option value={1}>1 (single shot)</option>
                      <option value={2}>2 (multi-scene)</option>
                      <option value={3}>3 (multi-scene)</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    Motion
                    <select
                      className="rounded-md border bg-background px-1.5 py-1 text-xs"
                      value={motionTemplate}
                      onChange={(e) => setMotionTemplate(e.target.value as typeof motionTemplate)}
                      disabled={generateVideoScenes.isPending}
                    >
                      <option value="auto">Auto (cycle)</option>
                      <option value="zoom-in">Zoom in</option>
                      <option value="zoom-out">Zoom out</option>
                      <option value="pan-left">Pan left</option>
                      <option value="pan-right">Pan right</option>
                      <option value="zoom-pan">Zoom + pan</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={includeMusic} onCheckedChange={(v) => setIncludeMusic(!!v)} disabled={generateVideoScenes.isPending} />
                    Background music
                  </label>
                </div>
              )}
              {generateVideoScenes.isPending && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {sceneCount > 1 ? `Generating ${sceneCount} scene previews with AI product images` : "Generating a scene preview with an AI product image"}
                  — this can take a moment. No video-generation credit is spent until you render.
                </p>
              )}
              {videoScenes && (
                <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Review your scene{videoScenes.length > 1 ? "s" : ""} — regenerate any you don't like, then render. Rendering is the only step that spends AI video credits.
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={handleDiscardScenes} disabled={renderVideo.isPending}>
                      <X className="w-3.5 h-3.5 mr-1" /> Discard
                    </Button>
                  </div>
                  <div className={`grid gap-3 ${videoScenes.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {videoScenes.map((scene, i) => {
                      const promptTooLong = scene.prompt.length > MAX_SCENE_PROMPT_LEN;
                      return (
                        <div key={scene.id} className="flex flex-col gap-1.5">
                          <div className="relative">
                            <img src={scene.imageUrl} alt={`Scene ${i + 1}`} className="w-full rounded-md border aspect-video object-cover" />
                            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px]">Scene {i + 1}</Badge>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="absolute top-1.5 right-1.5 h-7 px-2"
                              onClick={() => handleRegenerateScene(i)}
                              disabled={regeneratingSceneId !== null || renderVideo.isPending || promptTooLong}
                              title={promptTooLong ? `Prompt is too long — shorten it to ${MAX_SCENE_PROMPT_LEN} characters or fewer to regenerate` : "Regenerate this scene using the prompt below"}
                            >
                              {regeneratingSceneId === scene.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                          <Textarea
                            className="text-xs resize-none min-h-[60px] leading-snug"
                            placeholder="Edit the prompt to steer the next regeneration…"
                            value={scene.prompt}
                            onChange={(e) => handleScenePromptChange(i, e.target.value)}
                            disabled={regeneratingSceneId !== null || renderVideo.isPending}
                          />
                          <p className={`text-right text-[10px] leading-none ${promptTooLong ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {scene.prompt.length} / {MAX_SCENE_PROMPT_LEN}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleRenderVideo}
                    disabled={renderVideo.isPending || regeneratingSceneId !== null}
                  >
                    {renderVideo.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Film className="w-4 h-4 mr-2" />}
                    {renderVideo.isPending ? "Rendering video…" : "Render Video"}
                  </Button>
                </div>
              )}
              {generatedImage && (
                <div className="mt-3 relative">
                  <img src={generatedImage} alt="AI generated" className="w-full rounded-md border aspect-video object-cover" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-7 px-2"
                    onClick={() => setGeneratedImage(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}
              {generatedVideo && (
                <div className="mt-3 relative">
                  <video src={generatedVideo} controls loop className="w-full rounded-md border aspect-video object-cover bg-black" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-7 px-2"
                    onClick={() => setGeneratedVideo(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Shop this post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Attach products and we'll add a shoppable link to the bottom of your post automatically.
              </p>

              {products && products.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {products.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                        selectedProductIds.includes(p.id) ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <Checkbox
                        checked={selectedProductIds.includes(p.id)}
                        onCheckedChange={() => toggleProduct(p.id)}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">${p.price.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No products yet — add some in Products first.</p>
              )}

              {selectedProductIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setLinkMode("interest")}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                      linkMode === "interest" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
                    }`}
                  >
                    Let customers express interest
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkMode("checkout")}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                      linkMode === "checkout" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
                    }`}
                  >
                    Let customers buy now
                  </button>
                </div>
              )}

              {shareUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{shareUrl}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={copyShareUrl}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="w-4 h-4" /> Schedule for later
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(!!v)} />
                Publish automatically at a future date/time instead of submitting for review
              </label>
              {scheduleEnabled && (
                <input
                  type="datetime-local"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  min={toDatetimeLocalValue(new Date(Date.now() + 60 * 1000))}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2 items-end">
            <p className="text-xs text-muted-foreground">
              {scheduleEnabled ? "Scheduled posts publish automatically — no separate review step." : "Posts need approval before they go live — even AI-drafted ones."}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => handlePublish("draft")}>Save Draft</Button>
              {scheduleEnabled ? (
                <Button onClick={() => handlePublish("schedule")}>
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Schedule Post
                </Button>
              ) : (
                <Button onClick={() => handlePublish("review")}>
                  <Send className="w-4 h-4 mr-2" />
                  Submit for Review
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Preview Side */}
        <div className="hidden md:block">
          <Card className="h-full bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider text-center">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center p-8">
              {caption || selectedPlatforms.length > 0 ? (
                <div className="w-full max-w-sm bg-card border rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20"></div>
                    <div>
                      <div className="font-bold text-sm">Awa Biz Suite</div>
                      <div className="text-xs text-muted-foreground">Just now</div>
                    </div>
                  </div>
                  <div className="p-4 text-sm whitespace-pre-wrap">
                    {caption || <span className="text-muted-foreground italic">Your caption will appear here...</span>}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Start writing to see preview</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}