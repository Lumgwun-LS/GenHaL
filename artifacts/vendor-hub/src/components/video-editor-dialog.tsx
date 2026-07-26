/**
 * VideoEditorDialog — trim a video and/or burn in a caption overlay.
 *
 * The UI shows the video with interactive start/end trim sliders and an
 * optional caption form. When the user clicks "Process", the video bytes
 * are sent to the server where ffmpeg applies the edit. The result is saved
 * as a new vendor upload and the URL is returned via onSave.
 */
import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, Scissors, Type, Play, Pause, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface VideoEditorDialogProps {
  open: boolean;
  onClose: () => void;
  videoUrl: string;
  /** Called with the processed video URL when the server has finished. */
  onSave: (newUrl: string) => void;
}

type CaptionPosition = "top" | "center" | "bottom";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoEditorDialog({ open, onClose, videoUrl, onSave }: VideoEditorDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [captionEnabled, setCaptionEnabled] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionPos, setCaptionPos] = useState<CaptionPosition>("bottom");
  const [processing, setProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setTrimStart(0);
    setTrimEnd(0);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setCaptionEnabled(false);
    setCaptionText("");
    setCaptionPos("bottom");
    setProcessing(false);
    setProcessedUrl(null);
  }, [open]);

  const handleVideoLoaded = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    setTrimEnd(vid.duration);
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentTime(vid.currentTime);
    // Loop within the trim range
    if (vid.currentTime >= trimEnd) {
      vid.currentTime = trimStart;
    }
  };

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (playing) {
      vid.pause();
      setPlaying(false);
    } else {
      vid.currentTime = trimStart;
      vid.play();
      setPlaying(true);
    }
  };

  // Seek video when start handle moves
  const handleTrimStartChange = (v: number) => {
    const clamped = Math.min(v, trimEnd - 1);
    setTrimStart(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const handleTrimEndChange = (v: number) => {
    const clamped = Math.max(v, trimStart + 1);
    setTrimEnd(clamped);
  };

  const handleProcess = async () => {
    if (!captionEnabled && trimStart === 0 && trimEnd === duration) {
      toast.info("No edits to apply — adjust the trim or add a caption");
      return;
    }
    setProcessing(true);
    try {
      const body: {
        sourceUrl: string;
        trim?: { startSeconds: number; durationSeconds: number };
        caption?: { text: string; position: CaptionPosition };
      } = { sourceUrl: videoUrl };

      if (trimStart > 0 || trimEnd < duration) {
        body.trim = {
          startSeconds: trimStart,
          durationSeconds: Math.max(1, trimEnd - trimStart),
        };
      }

      if (captionEnabled && captionText.trim()) {
        body.caption = { text: captionText.trim(), position: captionPos };
      }

      const r = await fetch(`${BASE_URL}/api/media/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({ error: "Unknown error" })) as { error: string };
        throw new Error(data.error);
      }

      const { videoUrl: resultUrl } = await r.json() as { videoUrl: string };
      setProcessedUrl(resultUrl);
      toast.success("Video processed — preview below");
    } catch (err) {
      toast.error(`Processing failed: ${(err as Error).message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = () => {
    if (!processedUrl) return;
    onSave(processedUrl);
    onClose();
  };

  const trimDuration = trimEnd - trimStart;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle>Edit Video</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Video player */}
          <div className="rounded-lg overflow-hidden bg-black relative group">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full max-h-60 object-contain"
              onLoadedMetadata={handleVideoLoaded}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
              preload="metadata"
            />
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div className="bg-black/60 rounded-full p-3">
                {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}
              </div>
            </button>
          </div>

          {/* Time display */}
          {duration > 0 && (
            <div className="text-center text-xs text-muted-foreground tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          )}

          {/* Trim controls */}
          {duration > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Scissors className="w-4 h-4 text-primary" />
                <Label className="font-semibold text-sm">Trim</Label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTime(trimStart)} → {formatTime(trimEnd)} ({formatTime(trimDuration)})
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Start</span>
                    <span className="tabular-nums">{formatTime(trimStart)}</span>
                  </div>
                  <Slider
                    min={0} max={Math.max(0, duration - 1)} step={0.1}
                    value={[trimStart]}
                    onValueChange={([v]) => handleTrimStartChange(v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>End</span>
                    <span className="tabular-nums">{formatTime(trimEnd)}</span>
                  </div>
                  <Slider
                    min={1} max={duration} step={0.1}
                    value={[trimEnd]}
                    onValueChange={([v]) => handleTrimEndChange(v)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Caption controls */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-4 h-4 text-primary" />
              <Label className="font-semibold text-sm">Caption</Label>
              <button
                onClick={() => setCaptionEnabled((v) => !v)}
                className={`ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${captionEnabled ? "bg-primary" : "bg-input"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${captionEnabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {captionEnabled && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <Label className="text-xs">Caption text</Label>
                  <Input
                    value={captionText}
                    onChange={(e) => setCaptionText(e.target.value)}
                    placeholder="e.g. Shop now — limited offer!"
                    maxLength={120}
                  />
                  <p className="text-xs text-muted-foreground">{captionText.length}/120 characters</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Position</Label>
                  <div className="flex gap-2">
                    {(["top", "center", "bottom"] as CaptionPosition[]).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setCaptionPos(pos)}
                        className={`flex-1 py-1.5 rounded-md text-xs border capitalize transition-colors ${captionPos === pos ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"}`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Processed preview */}
          {processedUrl && (
            <div className="rounded-lg overflow-hidden bg-black border border-primary/40">
              <div className="px-3 py-1.5 bg-primary/10 text-xs font-medium flex items-center gap-1.5 text-primary">
                <CheckCircle className="w-3.5 h-3.5" /> Processed preview
              </div>
              <video src={processedUrl} controls className="w-full max-h-52 object-contain" preload="metadata" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0 flex justify-between gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <div className="flex gap-2">
            {!processedUrl ? (
              <Button onClick={handleProcess} disabled={processing || duration === 0}>
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5 mr-1.5" />}
                {processing ? "Processing…" : "Process Video"}
              </Button>
            ) : (
              <Button onClick={handleSave}>
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Save to Library
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
