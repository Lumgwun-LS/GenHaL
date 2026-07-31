/**
 * Media Library & AI Studio
 *
 * Central hub for all vendor media:
 *  - AI-generated images and videos (from /ai/generations)
 *  - Vendor-uploaded images and videos (from /media-library)
 *  - AI-generated captions
 *
 * From here the vendor can:
 *  - Upload new images or videos
 *  - Edit images (crop, rotate, filters, adjustments)
 *  - Edit videos (trim, caption overlay)
 *  - Download any file
 *  - Use media directly for a social post
 *  - Set an image as a product image
 *  - Generate a product image with AI
 *  - Copy the URL to paste into the website builder
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles, Image as ImageIcon, Video as VideoIcon, MessageSquare,
  Download, Clock, Upload, Pencil, Send, Copy, Check, Loader2, Plus,
  Package, Wand2,
} from "lucide-react";
import { useListAiGenerations, useListProducts, useGenerateAiImage } from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { ImageEditorDialog } from "@/components/image-editor-dialog";
import { VideoEditorDialog } from "@/components/video-editor-dialog";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface MediaItem {
  id: string;
  source: "ai" | "upload";
  type: "image" | "video";
  url: string;
  prompt: string | null;
  expiringSoon: boolean;
  createdAt: string;
}

type Tab = "all" | "images" | "videos" | "captions" | "generate";

export default function AiStudio() {
  const [, setLocation] = useLocation();
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;

  const [tab, setTab] = useState<Tab>("all");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editVideo, setEditVideo] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // "Set as product image" dialog state
  const [productPickUrl, setProductPickUrl] = useState<string | null>(null);
  const [productPickId, setProductPickId] = useState<string>("");
  const [productPickSaving, setProductPickSaving] = useState(false);

  // AI Generate tab state
  const [genPrompt, setGenPrompt] = useState("");
  const [genProductId, setGenProductId] = useState<string>("");
  const [genAssign, setGenAssign] = useState(false);
  const generateAiImage = useGenerateAiImage();

  const { data: allGenerations, isLoading: captionsLoading, refetch: refetchGenerations } =
    useListAiGenerations();

  const { data: products } = useListProducts(vendorId ? { vendorId } : {});

  const captions = (allGenerations ?? []).filter(
    (g) => g.type === "caption" || (g.type !== "image" && g.type !== "video"),
  );

  // ── Fetch unified media library ─────────────────────────────────────────────
  const fetchLibrary = () => {
    setMediaLoading(true);
    fetch(`${BASE_URL}/api/media-library`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: MediaItem[]) => setMediaItems(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Could not load media library"))
      .finally(() => setMediaLoading(false));
  };

  useEffect(() => { fetchLibrary(); }, []);

  // ── Upload a file ───────────────────────────────────────────────────────────
  const uploadFile = async (file: File, mediaType: "image" | "video") => {
    setUploading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/media/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mediaType }),
      });
      if (!r.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl } = await r.json() as { uploadUrl: string; mediaUrl: string };
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      toast.success(`${mediaType === "image" ? "Image" : "Video"} uploaded`);
      fetchLibrary();
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Copy URL ────────────────────────────────────────────────────────────────
  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("URL copied — paste it in the website builder");
    });
  };

  // ── Use for post ────────────────────────────────────────────────────────────
  const useForPost = (item: MediaItem) => {
    const param = item.type === "video" ? "videoUrl" : "imageUrl";
    setLocation(`${BASE_URL}/social/create?${param}=${encodeURIComponent(item.url)}`);
  };

  // ── Set as product image ────────────────────────────────────────────────────
  async function applyToProduct() {
    if (!productPickUrl || !productPickId) return;
    setProductPickSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/products/${productPickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl: productPickUrl }),
      });
      if (!r.ok) { toast.error("Failed to update product"); return; }
      toast.success("Product image updated! Visit Products to see it.");
      setProductPickUrl(null);
      setProductPickId("");
    } catch { toast.error("Network error"); }
    finally { setProductPickSaving(false); }
  }

  // ── Generate product image ──────────────────────────────────────────────────
  async function handleGenerate() {
    if (!vendorId || !genPrompt.trim()) return;
    try {
      const result = await generateAiImage.mutateAsync({
        data: { vendorId, prompt: genPrompt.trim() },
      });
      if (result.status === "failed") { toast.error(result.result ?? "Generation failed"); return; }
      const url = result.result ?? null;
      if (!url) return;
      // Optionally assign to a product
      if (genAssign && genProductId) {
        await fetch(`${BASE_URL}/api/products/${genProductId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageUrl: url }),
        });
        toast.success("Image generated and set as product image!");
      } else {
        toast.success("Image generated and saved to your library.");
      }
      fetchLibrary();
      setTab("images");
      setGenPrompt("");
      setGenProductId("");
      setGenAssign(false);
    } catch { toast.error("Generation failed"); }
  }

  // ── Download ────────────────────────────────────────────────────────────────
  const download = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `media-${Date.now()}.${url.includes(".mp4") ? "mp4" : "jpg"}`;
    a.target = "_blank";
    a.click();
  };

  // ── Tab filter ──────────────────────────────────────────────────────────────
  const visibleMedia = mediaItems.filter((item) => {
    if (tab === "all") return true;
    if (tab === "images") return item.type === "image";
    if (tab === "videos") return item.type === "video";
    return false;
  });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all",      label: "All Media",    count: mediaItems.length },
    { id: "images",   label: "Images",       count: mediaItems.filter((i) => i.type === "image").length },
    { id: "videos",   label: "Videos",       count: mediaItems.filter((i) => i.type === "video").length },
    { id: "captions", label: "AI Captions",  count: captions.length },
    { id: "generate", label: "✦ Generate",              },
  ];

  const isMediaTab = tab !== "captions" && tab !== "generate";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Design Studio</h1>
          <p className="text-muted-foreground">
            Create, edit, and manage product images, videos, and captions — all powered by AI.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload Image
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload Video
          </Button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadFile(f, "image"); }} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadFile(f, "video"); }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Generate tab ─────────────────────────────────────────────── */}
      {tab === "generate" && (
        <div className="max-w-xl mx-auto space-y-6">
          <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-purple-500/5 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">AI Product Image Generator</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Describe your product image. Be specific — mention style, background, lighting, angle, and mood.
            </p>
            <div className="space-y-1.5">
              <Label>Image description</Label>
              <Textarea
                rows={4}
                value={genPrompt}
                onChange={e => setGenPrompt(e.target.value)}
                placeholder="e.g. A bottle of organic honey on a rustic wooden table, warm golden light, shallow depth of field, professional product photo"
                className="resize-none"
              />
            </div>

            {/* Optional: assign directly to a product */}
            <div className="rounded-xl border p-3 space-y-3 bg-background/60">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="assign-toggle"
                  checked={genAssign}
                  onChange={e => setGenAssign(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="assign-toggle" className="cursor-pointer text-sm font-normal">
                  Set this image as a product image right away
                </Label>
              </div>
              {genAssign && (
                <Select value={genProductId} onValueChange={setGenProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products ?? []).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleGenerate}
              disabled={generateAiImage.isPending || !genPrompt.trim() || (genAssign && !genProductId)}
            >
              {generateAiImage.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generate Image</>
              )}
            </Button>
          </div>

          <div className="rounded-xl border p-4 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              Pro tips for great product images
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Specify a clean background: "white background", "marble surface", "outdoor setting"</li>
              <li>Mention lighting: "soft studio lighting", "natural sunlight", "moody shadows"</li>
              <li>Add style: "flat lay", "close-up macro", "lifestyle photo", "minimalist"</li>
              <li>After generating, use <strong>Refine in Editor</strong> to adjust brightness, contrast, and apply filters</li>
            </ul>
          </div>
        </div>
      )}

      {/* Media grid */}
      {isMediaTab && (
        <>
          {(mediaLoading) ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading your media…
            </div>
          ) : visibleMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed rounded-xl bg-card gap-4">
              <Sparkles className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <h3 className="text-lg font-medium text-foreground mb-1">No media yet</h3>
                <p className="text-sm">Upload images/videos above, or generate them with AI.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Upload Image
                </Button>
                <Button size="sm" onClick={() => setTab("generate")}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate with AI
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleMedia.map((item) => {
                const isCopied = copiedId === item.id;
                return (
                  <Card key={item.id} className={`overflow-hidden flex flex-col group ${item.expiringSoon ? "border-amber-400/60" : ""}`}>
                    {/* Media preview */}
                    <div className="relative aspect-square bg-muted">
                      {item.type === "video" ? (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover bg-black"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <img src={item.url} alt={item.prompt ?? ""} className="w-full h-full object-cover" />
                      )}

                      {/* Expiry banner */}
                      {item.expiringSoon && (
                        <div className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-white text-[10px] font-medium px-2 py-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" /> Expires soon — attach to a post to keep
                        </div>
                      )}

                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto p-3">
                        <div className="flex gap-2 flex-wrap justify-center">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs"
                            onClick={() => item.type === "image" ? setEditImage(item.url) : setEditVideo(item.url)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {item.type === "image" ? "Edit & Refine" : "Edit"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs"
                            onClick={() => download(item.url)}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-center">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs"
                            onClick={() => useForPost(item)}
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Use for Post
                          </Button>
                          {item.type === "image" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => {
                                setProductPickUrl(item.url);
                                setProductPickId("");
                              }}
                            >
                              <Package className="w-3 h-3 mr-1" />
                              Set as Product
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs w-full max-w-[160px]"
                          onClick={() => copyUrl(item.id, item.url)}
                        >
                          {isCopied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                          {isCopied ? "Copied!" : "Copy URL"}
                        </Button>
                      </div>
                    </div>

                    {/* Footer */}
                    <CardContent className="p-3 bg-card border-t mt-auto">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex gap-1">
                          <Badge variant={item.source === "ai" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                            {item.source === "ai" ? "AI" : "Upload"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                            {item.type === "video" ? <VideoIcon className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {item.prompt && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1" title={item.prompt}>
                          {item.prompt}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Captions tab */}
      {tab === "captions" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {captionsLoading ? (
            <div className="col-span-full flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading captions…
            </div>
          ) : captions.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground border border-dashed rounded-xl bg-card">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No AI captions yet. Generate them from the social post creator.</p>
            </div>
          ) : (
            captions.map((gen) => {
              const isCopied = copiedId === `cap-${gen.id}`;
              return (
                <Card key={gen.id} className="flex flex-col group">
                  <div className="p-5 flex-1 bg-muted/30 rounded-t-lg">
                    <MessageSquare className="w-5 h-5 text-primary mb-3" />
                    <p className="text-sm leading-relaxed">{gen.result || "Generating…"}</p>
                  </div>
                  <CardContent className="p-3 bg-card border-t flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground line-clamp-1 flex-1" title={gen.prompt}>{gen.prompt}</span>
                    {gen.result && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(gen.result!);
                          setCopiedId(`cap-${gen.id}`);
                          setTimeout(() => setCopiedId(null), 2000);
                          toast.success("Caption copied");
                        }}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Set as Product Image dialog ──────────────────────────────── */}
      <Dialog open={!!productPickUrl} onOpenChange={v => { if (!v) { setProductPickUrl(null); setProductPickId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-4 h-4" /> Set as Product Image
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {productPickUrl && (
              <img src={productPickUrl} alt="Selected" className="w-full aspect-video object-contain rounded-lg border bg-muted" />
            )}
            <div className="space-y-1.5">
              <Label>Select product</Label>
              <Select value={productPickId} onValueChange={setProductPickId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a product…" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProductPickUrl(null); setProductPickId(""); }}>Cancel</Button>
            <Button onClick={applyToProduct} disabled={!productPickId || productPickSaving}>
              {productPickSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Apply to Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image editor dialog */}
      {editImage && (
        <ImageEditorDialog
          open={!!editImage}
          onClose={() => setEditImage(null)}
          imageUrl={editImage}
          onSave={(newUrl) => {
            toast.success("Edited image saved to library");
            setEditImage(null);
            fetchLibrary();
            void newUrl;
          }}
        />
      )}

      {/* Video editor dialog */}
      {editVideo && (
        <VideoEditorDialog
          open={!!editVideo}
          onClose={() => setEditVideo(null)}
          videoUrl={editVideo}
          onSave={(newUrl) => {
            toast.success("Edited video saved to library");
            setEditVideo(null);
            fetchLibrary();
            void newUrl;
          }}
        />
      )}
    </div>
  );
}
