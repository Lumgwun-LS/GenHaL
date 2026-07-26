/**
 * MediaPickerDialog — reusable media library picker.
 *
 * Shows AI-generated images/videos and vendor uploads in a filterable grid.
 * Supports inline upload so the user can add new files without leaving the dialog.
 *
 * Usage:
 *   <MediaPickerDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSelect={(url, type) => { ... }}
 *     typeFilter="image"          // optional — "image" | "video" | "all"
 *     vendorId={vendor.id}
 *   />
 */
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Image as ImageIcon, Video as VideoIcon, Check, Clock } from "lucide-react";
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

interface MediaPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms a selection. */
  onSelect: (url: string, type: "image" | "video") => void;
  /** Restrict which media types are shown and can be selected. Default: "all". */
  typeFilter?: "image" | "video" | "all";
  title?: string;
}

export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  typeFilter = "all",
  title = "Choose from Media Library",
}: MediaPickerDialogProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "image" | "video">(typeFilter === "all" ? "all" : typeFilter);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Fetch the media library on open
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    fetch(`${BASE_URL}/api/media-library`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: MediaItem[]) => setItems(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Could not load media library"))
      .finally(() => setLoading(false));
  }, [open]);

  const visible = items.filter((item) => {
    if (tab === "all") return typeFilter === "all" ? true : item.type === typeFilter;
    return item.type === tab;
  });

  const handleConfirm = () => {
    const item = items.find((i) => i.id === selected);
    if (!item) return;
    onSelect(item.url, item.type);
    onClose();
  };

  const handleUploadFile = async (file: File, mediaType: "image" | "video") => {
    setUploading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/media/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mediaType }),
      });
      if (!r.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, mediaUrl: finalUrl } = await r.json() as { uploadUrl: string; mediaUrl: string };

      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

      // Refresh the library
      const refreshed = await fetch(`${BASE_URL}/api/media-library`, { credentials: "include" }).then((r) => r.json()) as MediaItem[];
      setItems(Array.isArray(refreshed) ? refreshed : []);

      // Auto-select the just-uploaded item
      const newItem = refreshed.find((i) => i.url === finalUrl);
      if (newItem) setSelected(newItem.id);
      toast.success(`${mediaType === "image" ? "Image" : "Video"} uploaded`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Tab options — only show tabs that match the typeFilter
  const showImageTab = typeFilter !== "video";
  const showVideoTab = typeFilter !== "image";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="px-6 py-3 border-b flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              {typeFilter === "all" && <TabsTrigger value="all" className="text-xs h-6 px-3">All</TabsTrigger>}
              {showImageTab && <TabsTrigger value="image" className="text-xs h-6 px-3">Images</TabsTrigger>}
              {showVideoTab && <TabsTrigger value="video" className="text-xs h-6 px-3">Videos</TabsTrigger>}
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            {showImageTab && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                  Upload Image
                </Button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (f) handleUploadFile(f, "image");
                }} />
              </>
            )}
            {showVideoTab && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => videoInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                  Upload Video
                </Button>
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (f) handleUploadFile(f, "video");
                }} />
              </>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading library…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              {tab === "image" ? <ImageIcon className="w-10 h-10 opacity-20" /> : <VideoIcon className="w-10 h-10 opacity-20" />}
              <p className="text-sm">No {tab === "all" ? "media" : tab + "s"} yet.</p>
              <p className="text-xs">Generate some from the AI Studio or upload a file above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {visible.map((item) => {
                const isSelected = selected === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(isSelected ? null : item.id)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square group focus:outline-none ${
                      isSelected ? "border-primary shadow-md shadow-primary/20" : "border-transparent hover:border-muted-foreground/40"
                    }`}
                  >
                    {item.type === "video" ? (
                      <video src={item.url} className="w-full h-full object-cover bg-black" muted preload="metadata" />
                    ) : (
                      <img src={item.url} alt={item.prompt ?? ""} className="w-full h-full object-cover" />
                    )}

                    {/* Selection checkmark */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary rounded-full p-1">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      </div>
                    )}

                    {/* Source badge */}
                    <div className="absolute top-1.5 left-1.5">
                      <Badge variant={item.source === "ai" ? "default" : "secondary"} className="text-[9px] px-1 py-0 h-4">
                        {item.source === "ai" ? "AI" : "Upload"}
                      </Badge>
                    </div>

                    {/* Video icon */}
                    {item.type === "video" && (
                      <div className="absolute bottom-1.5 right-1.5 bg-black/60 rounded px-1 py-0.5">
                        <VideoIcon className="w-3 h-3 text-white" />
                      </div>
                    )}

                    {/* Expiring soon indicator */}
                    {item.expiringSoon && (
                      <div className="absolute bottom-0 inset-x-0 bg-amber-500/90 py-0.5 flex items-center justify-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-white" />
                        <span className="text-[9px] text-white font-medium">Expires soon</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            Use Selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
