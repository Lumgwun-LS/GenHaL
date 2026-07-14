import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Sparkles, Image as ImageIcon, Video as VideoIcon, CalendarClock, ShoppingBag, Link as LinkIcon, Copy, Check, Loader2, Send, Upload } from "lucide-react";
import {
  useCreatePost, useUpdatePost, useListProducts, useGenerateAiCaption, useGenerateAiImage, useGenerateAiVideo,
  useGetAiVideoUploadUrl, useAnalyzeVideoCaption, useSubmitPostForReview, useListSocialAccounts,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPostsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type LinkMode = "none" | "interest" | "checkout";

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
  const [uploadedVideoStage, setUploadedVideoStage] = useState<"idle" | "uploading" | "analyzing">("idle");
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const { data: products } = useListProducts({ vendorId: 1 });
  const { data: socialAccounts } = useListSocialAccounts({ vendorId: 1 });
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const generateCaption = useGenerateAiCaption();
  const generateImage = useGenerateAiImage();
  const generateVideo = useGenerateAiVideo();
  const getVideoUploadUrl = useGetAiVideoUploadUrl();
  const analyzeVideoCaption = useAnalyzeVideoCaption();
  const submitForReviewMutation = useSubmitPostForReview();
  const queryClient = useQueryClient();

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
      toast.success("Image generated — review before publishing");
    } catch {
      toast.error("Failed to generate image");
    }
  };

  const handleGenerateVideo = async () => {
    if (!caption.trim()) {
      toast.error("Write a caption first so the video matches your post");
      return;
    }
    try {
      const result = await generateVideo.mutateAsync({
        data: {
          vendorId: 1,
          prompt: caption,
          captionText: caption,
          sceneCount,
          motionTemplate,
          includeMusic,
        },
      });
      if (result.status === "failed") { toast.error(result.result ?? "Video generation failed"); return; }
      setGeneratedVideo(result.result ?? null);
      setGeneratedImage(null);
      toast.success("Video generated — review before publishing");
    } catch {
      toast.error("Failed to generate video");
    }
  };

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
      setCaption(result.result ?? caption);
      toast.success("AI watched your video and drafted a caption — review and edit as needed");
    } catch {
      toast.error("Failed to upload/analyze video");
    } finally {
      setUploadedVideoStage("idle");
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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/social"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Compose Post</h1>
      </div>

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
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleGenerateImage} disabled={generateImage.isPending || generateVideo.isPending}>
                    {generateImage.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                    AI Image
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleGenerateVideo} disabled={generateImage.isPending || generateVideo.isPending}>
                    {generateVideo.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <VideoIcon className="w-4 h-4 mr-2" />}
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
                </div>
                <span>{caption.length} / 2200</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                "Upload My Video" lets AI watch your own footage and write a caption grounded in what it actually shows — different from "AI Video", which generates a new video from an image.
              </p>
              {!generatedVideo && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">
                    Scenes
                    <select
                      className="rounded-md border bg-background px-1.5 py-1 text-xs"
                      value={sceneCount}
                      onChange={(e) => setSceneCount(Number(e.target.value) as 1 | 2 | 3)}
                      disabled={generateVideo.isPending}
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
                      disabled={generateVideo.isPending}
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
                    <Checkbox checked={includeMusic} onCheckedChange={(v) => setIncludeMusic(!!v)} disabled={generateVideo.isPending} />
                    Background music
                  </label>
                </div>
              )}
              {generateVideo.isPending && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {sceneCount > 1 ? `Generating a ${sceneCount}-scene video with AI product images` : "Generating a short video from an AI product image"}
                  {includeMusic ? " and background music" : ""} — this can take up to a minute or two…
                </p>
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