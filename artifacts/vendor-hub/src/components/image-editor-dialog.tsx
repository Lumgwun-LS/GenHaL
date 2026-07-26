/**
 * ImageEditorDialog — browser-based image editor using the Canvas API.
 *
 * Supports: rotate (±90°), flip horizontal/vertical, brightness/contrast/saturation
 * sliders, and preset filter styles (Vivid, Grayscale, Sepia, Warm, Cool).
 * On save, the result is uploaded as a new vendor image and the URL returned
 * via the onSave callback.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCw, RotateCcw, FlipHorizontal, FlipVertical, Download, Save } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface ImageEditorDialogProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  /** Called with the new URL when the edited image has been saved. */
  onSave: (newUrl: string) => void;
}

type FilterPreset = "none" | "vivid" | "grayscale" | "sepia" | "warm" | "cool";

const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: "none",      label: "Normal"    },
  { id: "vivid",     label: "Vivid"     },
  { id: "grayscale", label: "B&W"       },
  { id: "sepia",     label: "Sepia"     },
  { id: "warm",      label: "Warm"      },
  { id: "cool",      label: "Cool"      },
];

function buildFilter(
  preset: FilterPreset,
  brightness: number,
  contrast: number,
  saturation: number,
): string {
  const parts: string[] = [];

  // Preset base
  if (preset === "grayscale") parts.push("grayscale(100%)");
  else if (preset === "sepia")     parts.push("sepia(80%)");
  else if (preset === "vivid")     parts.push(`saturate(${saturation + 70}%) contrast(${contrast + 15}%)`);
  else if (preset === "warm")      parts.push("sepia(30%) saturate(120%) hue-rotate(-10deg)");
  else if (preset === "cool")      parts.push("hue-rotate(10deg) saturate(90%)");

  // Manual adjustments (on top of preset)
  if (preset !== "vivid") {
    parts.push(`brightness(${brightness}%)`);
    parts.push(`contrast(${contrast}%)`);
    parts.push(`saturate(${saturation}%)`);
  } else {
    parts.push(`brightness(${brightness}%)`);
  }

  return parts.join(" ");
}

export function ImageEditorDialog({ open, onClose, imageUrl, onSave }: ImageEditorDialogProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [rotation, setRotation] = useState(0); // degrees: 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [preset, setPreset] = useState<FilterPreset>("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const cssFilter = buildFilter(preset, brightness, contrast, saturation);

  // Load image
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setRotation(0); setFlipH(false); setFlipV(false);
    setPreset("none"); setBrightness(100); setContrast(100); setSaturation(100);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => toast.error("Could not load image for editing");
    img.src = imageUrl;
  }, [open, imageUrl]);

  // Redraw canvas whenever any parameter changes
  const redraw = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !loaded) return;

    const rad = (rotation * Math.PI) / 180;
    const isPortrait = rotation === 90 || rotation === 270;
    const w = isPortrait ? img.naturalHeight : img.naturalWidth;
    const h = isPortrait ? img.naturalWidth : img.naturalHeight;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.filter = cssFilter;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rad);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [loaded, rotation, flipH, flipV, cssFilter]);

  useEffect(() => { redraw(); }, [redraw]);

  const downloadEdited = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `edited-${Date.now()}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.click();
  };

  const handleSave = async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      // Get canvas blob
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Canvas export failed");

      // Get presigned upload URL (auth-based, no vendorId needed)
      const r = await fetch(`${BASE_URL}/api/media/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mediaType: "image" }),
      });
      if (!r.ok) throw new Error("Could not get upload URL");
      const { uploadUrl, mediaUrl: newUrl } = await r.json() as { uploadUrl: string; mediaUrl: string };

      // Upload
      await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });

      toast.success("Edited image saved to your library");
      onSave(newUrl);
      onClose();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // Max display size for the canvas preview
  const canvasStyle: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "50vh",
    objectFit: "contain",
    display: "block",
    margin: "0 auto",
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle>Edit Image</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Canvas preview */}
          <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-center min-h-[200px]">
            {!loaded ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <canvas ref={previewCanvasRef} style={canvasStyle} />
            )}
          </div>

          {/* Transform controls */}
          <div>
            <Label className="text-xs font-semibold mb-2 block text-muted-foreground uppercase tracking-wide">Transform</Label>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setRotation((r) => (r + 270) % 360)}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Rotate L
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw className="w-3.5 h-3.5 mr-1.5" /> Rotate R
              </Button>
              <Button variant={flipH ? "default" : "outline"} size="sm" onClick={() => setFlipH((v) => !v)}>
                <FlipHorizontal className="w-3.5 h-3.5 mr-1.5" /> Flip H
              </Button>
              <Button variant={flipV ? "default" : "outline"} size="sm" onClick={() => setFlipV((v) => !v)}>
                <FlipVertical className="w-3.5 h-3.5 mr-1.5" /> Flip V
              </Button>
            </div>
          </div>

          {/* Filter presets */}
          <div>
            <Label className="text-xs font-semibold mb-2 block text-muted-foreground uppercase tracking-wide">Filter</Label>
            <div className="flex gap-2 flex-wrap">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setPreset(f.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    preset === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Adjustment sliders */}
          <div className="space-y-4">
            <Label className="text-xs font-semibold mb-1 block text-muted-foreground uppercase tracking-wide">Adjustments</Label>
            {[
              { label: "Brightness", value: brightness, onChange: setBrightness, min: 20, max: 200 },
              { label: "Contrast",   value: contrast,   onChange: setContrast,   min: 50, max: 200 },
              { label: "Saturation", value: saturation, onChange: setSaturation, min: 0,  max: 200 },
            ].map(({ label, value, onChange, min, max }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{value}%</span>
                </div>
                <Slider
                  min={min} max={max} step={1}
                  value={[value]}
                  onValueChange={([v]) => onChange(v)}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0 flex justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={downloadEdited} disabled={!loaded}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !loaded}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save to Library
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
