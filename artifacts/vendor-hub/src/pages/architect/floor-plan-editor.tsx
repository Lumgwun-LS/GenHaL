import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MousePointer2, Square, Minus, DoorOpen, AppWindow, Type,
  AlignJustify, Droplets, Undo2, Redo2, Download, Save, X,
  Grid3X3, Trash2, ZoomIn, ZoomOut,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ShapeType = "room" | "wall" | "door" | "window" | "text" | "staircase" | "bathroom";
type Tool = "select" | ShapeType;

interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  label?: string;
  color?: string;
}

interface FloorPlanData {
  shapes: Shape[];
  gridSize: number;
  unit: string;
}

interface Props {
  plan: { id: number; name: string; data: string | null };
  vendorId: number;
  projectName?: string;
  onSave: (shapes: Shape[]) => Promise<void>;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID = 20;
const W = 1200;
const H = 900;

const ROOM_COLORS = [
  "#dbeafe", "#fce7f3", "#d1fae5", "#fef3c7",
  "#ede9fe", "#fee2e2", "#e0f2fe", "#f3f4f6",
];

const TOOL_DEFS: { tool: Tool; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
  { tool: "select",    label: "Select",    Icon: MousePointer2 },
  { tool: "room",      label: "Room",      Icon: Square },
  { tool: "wall",      label: "Wall",      Icon: Minus },
  { tool: "door",      label: "Door",      Icon: DoorOpen },
  { tool: "window",    label: "Window",    Icon: AppWindow },
  { tool: "text",      label: "Label",     Icon: Type },
  { tool: "staircase", label: "Staircase", Icon: AlignJustify },
  { tool: "bathroom",  label: "Bathroom",  Icon: Droplets },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function snap(v: number) { return Math.round(v / GRID) * GRID; }
function uid() { return Math.random().toString(36).slice(2, 10); }

function normalizeRect(x: number, y: number, w: number, h: number) {
  return { x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, width: Math.abs(w), height: Math.abs(h) };
}

function rectHit(s: Shape, px: number, py: number): boolean {
  const x2 = (s.x ?? 0) + (s.width ?? 0);
  const y2 = (s.y ?? 0) + (s.height ?? 0);
  return px >= Math.min(s.x, x2) && px <= Math.max(s.x, x2) &&
         py >= Math.min(s.y, y2) && py <= Math.max(s.y, y2);
}

function lineHit(s: Shape, px: number, py: number): boolean {
  const x1 = s.x, y1 = s.y, x2 = s.x2 ?? s.x, y2 = s.y2 ?? s.y;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1) < 12;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) < 12;
}

function hitTest(shapes: Shape[], px: number, py: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === "wall") { if (lineHit(s, px, py)) return s; continue; }
    if (["room", "staircase", "bathroom"].includes(s.type)) { if (rectHit(s, px, py)) return s; continue; }
    if (["door", "window"].includes(s.type)) { if (rectHit({ ...s, width: (s.width ?? 60) + 20, height: (s.width ?? 60) + 20 }, px - 10, py - 10)) return s; continue; }
    if (s.type === "text") { if (Math.abs(px - s.x) < 80 && Math.abs(py - s.y) < 20) return s; continue; }
  }
  return null;
}

// ─── Shape renderers ──────────────────────────────────────────────────────────

function RenderShape({ s, selected }: { s: Shape; selected: boolean }) {
  const selStroke = "#3b82f6";
  const selW = selected ? 2.5 : 1.5;
  const defStroke = "#334155";

  switch (s.type) {
    case "room": {
      const w = s.width ?? 80, h = s.height ?? 60;
      const dimW = (w / GRID / 2).toFixed(1) + "m";
      const dimH = (h / GRID / 2).toFixed(1) + "m";
      return (
        <g>
          <rect x={s.x} y={s.y} width={w} height={h}
            fill={s.color ?? "#dbeafe"} stroke={selected ? selStroke : defStroke}
            strokeWidth={selW} />
          {s.label && (
            <text x={s.x + w / 2} y={s.y + h / 2 - 6} textAnchor="middle" dominantBaseline="middle"
              fontSize={Math.min(14, w / 8, h / 4)} fill="#1e293b" fontWeight="500">
              {s.label}
            </text>
          )}
          <text x={s.x + w / 2} y={s.y + h / 2 + (s.label ? 10 : 0)} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="#64748b">
            {dimW} × {dimH}
          </text>
          {selected && <>
            <circle cx={s.x} cy={s.y} r={5} fill={selStroke} />
            <circle cx={s.x + w} cy={s.y} r={5} fill={selStroke} />
            <circle cx={s.x} cy={s.y + h} r={5} fill={selStroke} />
            <circle cx={s.x + w} cy={s.y + h} r={5} fill={selStroke} />
          </>}
        </g>
      );
    }

    case "wall": {
      const x2 = s.x2 ?? s.x, y2 = s.y2 ?? s.y;
      return (
        <g>
          <line x1={s.x} y1={s.y} x2={x2} y2={y2}
            stroke={selected ? selStroke : "#0f172a"} strokeWidth={selected ? 8 : 6}
            strokeLinecap="round" />
          {selected && <>
            <circle cx={s.x} cy={s.y} r={5} fill={selStroke} />
            <circle cx={x2} cy={y2} r={5} fill={selStroke} />
          </>}
        </g>
      );
    }

    case "door": {
      const dw = s.width ?? 60;
      return (
        <g transform={`translate(${s.x},${s.y})`}>
          <line x1={0} y1={0} x2={dw} y2={0} stroke={selected ? selStroke : "#0f172a"} strokeWidth={selected ? 3 : 2} />
          <line x1={0} y1={0} x2={0} y2={-dw} stroke="#94a3b8" strokeWidth={1} />
          <path d={`M ${dw} 0 A ${dw} ${dw} 0 0 0 0 ${-dw}`}
            stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="5 3" />
        </g>
      );
    }

    case "window": {
      const ww = s.width ?? 60;
      const marks = 3;
      return (
        <g transform={`translate(${s.x},${s.y})`}>
          <line x1={0} y1={0} x2={ww} y2={0} stroke={selected ? selStroke : "#0f172a"} strokeWidth={6} strokeLinecap="square" />
          <line x1={0} y1={0} x2={ww} y2={0} stroke="#93c5fd" strokeWidth={2} />
          {Array.from({ length: marks + 1 }).map((_, i) => {
            const mx = (ww / marks) * i;
            return <line key={i} x1={mx} y1={-5} x2={mx} y2={5} stroke={selected ? selStroke : "#0f172a"} strokeWidth={1.5} />;
          })}
        </g>
      );
    }

    case "text": {
      return (
        <text x={s.x} y={s.y} fontSize={14} fill={selected ? selStroke : "#1e293b"} fontFamily="sans-serif"
          stroke={selected ? "#bfdbfe" : "none"} strokeWidth={selected ? 3 : 0} paintOrder="stroke">
          {s.label || "Label"}
        </text>
      );
    }

    case "staircase": {
      const w = s.width ?? 80, h = s.height ?? 120;
      const steps = Math.floor(h / GRID);
      return (
        <g>
          <rect x={s.x} y={s.y} width={w} height={h}
            fill="#f8fafc" stroke={selected ? selStroke : defStroke} strokeWidth={selW} />
          {Array.from({ length: steps }).map((_, i) => (
            <line key={i} x1={s.x} y1={s.y + i * GRID} x2={s.x + w} y2={s.y + i * GRID}
              stroke="#94a3b8" strokeWidth={0.8} />
          ))}
          <text x={s.x + w / 2} y={s.y + h / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fill="#64748b">Stairs</text>
          {selected && <rect x={s.x} y={s.y} width={w} height={h} fill="none" stroke={selStroke} strokeWidth={2} />}
        </g>
      );
    }

    case "bathroom": {
      const w = s.width ?? 80, h = s.height ?? 80;
      const cr = Math.min(w, h) * 0.18;
      return (
        <g>
          <rect x={s.x} y={s.y} width={w} height={h}
            fill="#e0f2fe" stroke={selected ? selStroke : defStroke} strokeWidth={selW} />
          {/* Toilet bowl */}
          <ellipse cx={s.x + w / 2} cy={s.y + h * 0.65} rx={cr * 1.2} ry={cr}
            fill="white" stroke="#94a3b8" strokeWidth={1} />
          {/* Toilet tank */}
          <rect x={s.x + w / 2 - cr} y={s.y + h * 0.65 - cr * 2.5} width={cr * 2} height={cr * 1.5}
            fill="white" stroke="#94a3b8" strokeWidth={1} rx={2} />
          {/* Sink */}
          <ellipse cx={s.x + w * 0.3} cy={s.y + h * 0.25} rx={cr * 0.9} ry={cr * 0.7}
            fill="white" stroke="#94a3b8" strokeWidth={1} />
          {selected && <rect x={s.x} y={s.y} width={w} height={h} fill="none" stroke={selStroke} strokeWidth={2} />}
        </g>
      );
    }

    default: return null;
  }
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export function FloorPlanEditor({ plan, vendorId: _vendorId, projectName, onSave, onClose }: Props) {
  const initialData: FloorPlanData = plan.data ? JSON.parse(plan.data) : { shapes: [], gridSize: GRID, unit: "m" };

  const [shapes, setShapes] = useState<Shape[]>(initialData.shapes ?? []);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Partial<Shape> | null>(null);
  const [drag, setDrag] = useState<{ id: string; mx: number; my: number; ox: number; oy: number; ox2?: number; oy2?: number } | null>(null);
  const [history, setHistory] = useState<Shape[][]>([initialData.shapes ?? []]);
  const [hi, setHi] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [colorInput, setColorInput] = useState("#dbeafe");
  const svgRef = useRef<SVGSVGElement>(null);

  const selectedShape = shapes.find((s) => s.id === selected) ?? null;

  // Sync label/color panel when selection changes
  useEffect(() => {
    if (selectedShape) {
      setLabelInput(selectedShape.label ?? "");
      setColorInput(selectedShape.color ?? "#dbeafe");
    }
  }, [selected]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setSelected(null); setPreview(null); setTextPrompt(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) undo();
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) redo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function pushHistory(next: Shape[]) {
    setHistory((h) => [...h.slice(0, hi + 1), next]);
    setHi((i) => i + 1);
  }

  function undo() {
    if (hi === 0) return;
    const newHi = hi - 1;
    setShapes(history[newHi]);
    setHi(newHi);
    setSelected(null);
  }

  function redo() {
    if (hi >= history.length - 1) return;
    const newHi = hi + 1;
    setShapes(history[newHi]);
    setHi(newHi);
    setSelected(null);
  }

  function deleteSelected() {
    if (!selected) return;
    const next = shapes.filter((s) => s.id !== selected);
    setShapes(next);
    pushHistory(next);
    setSelected(null);
  }

  function svgCoords(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y } = svgCoords(e);
    const sx = snap(x), sy = snap(y);

    if (tool === "select") {
      const hit = hitTest(shapes, x, y);
      setSelected(hit?.id ?? null);
      if (hit) {
        setDrag({ id: hit.id, mx: x, my: y, ox: hit.x, oy: hit.y, ox2: hit.x2, oy2: hit.y2 });
      }
      return;
    }

    if (tool === "text") {
      setTextPrompt({ x: sx, y: sy });
      setTextInput("");
      return;
    }

    const id = uid();
    if (["room", "staircase", "bathroom"].includes(tool)) {
      setPreview({ id, type: tool as ShapeType, x: sx, y: sy, width: 0, height: 0, color: "#dbeafe" });
    } else if (tool === "wall") {
      setPreview({ id, type: "wall", x: sx, y: sy, x2: sx, y2: sy });
    } else if (tool === "door") {
      setPreview({ id, type: "door", x: sx, y: sy, width: 60 });
    } else if (tool === "window") {
      setPreview({ id, type: "window", x: sx, y: sy, width: 60 });
    }
  }, [tool, shapes]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = svgCoords(e);
    const sx = snap(x), sy = snap(y);

    if (preview) {
      if (["room", "staircase", "bathroom"].includes(preview.type!)) {
        setPreview((p) => p ? { ...p, width: sx - p.x!, height: sy - p.y! } : p);
      } else if (preview.type === "wall") {
        setPreview((p) => p ? { ...p, x2: sx, y2: sy } : p);
      } else if (["door", "window"].includes(preview.type!)) {
        setPreview((p) => p ? { ...p, x: sx, y: sy } : p);
      }
      return;
    }

    if (drag) {
      const dx = x - drag.mx, dy = y - drag.my;
      setShapes((prev) => prev.map((s) => {
        if (s.id !== drag.id) return s;
        if (s.type === "wall") {
          return { ...s, x: snap(drag.ox + dx), y: snap(drag.oy + dy), x2: snap((drag.ox2 ?? drag.ox) + dx), y2: snap((drag.oy2 ?? drag.oy) + dy) };
        }
        return { ...s, x: snap(drag.ox + dx), y: snap(drag.oy + dy) };
      }));
    }
  }, [preview, drag]);

  const onMouseUp = useCallback(() => {
    if (drag) {
      pushHistory([...shapes]);
      setDrag(null);
      return;
    }
    if (!preview) return;

    const hasSize =
      (preview.type === "wall" && (Math.abs((preview.x2 ?? preview.x!) - preview.x!) > 5 || Math.abs((preview.y2 ?? preview.y!) - preview.y!) > 5)) ||
      (["room", "staircase", "bathroom"].includes(preview.type!) && (Math.abs(preview.width!) > 10 || Math.abs(preview.height!) > 10)) ||
      (["door", "window"].includes(preview.type!));

    if (hasSize) {
      let shape: Shape;
      if (["room", "staircase", "bathroom"].includes(preview.type!)) {
        const { x, y, width, height } = normalizeRect(preview.x!, preview.y!, preview.width!, preview.height!);
        shape = { ...preview as Shape, x, y, width, height, label: preview.type === "room" ? "Room" : undefined };
      } else {
        shape = preview as Shape;
      }
      const next = [...shapes, shape];
      setShapes(next);
      pushHistory(next);
      setSelected(shape.id);
    }
    setPreview(null);
  }, [preview, drag, shapes]);

  function commitText() {
    if (!textPrompt || !textInput.trim()) { setTextPrompt(null); return; }
    const shape: Shape = { id: uid(), type: "text", x: textPrompt.x, y: textPrompt.y, label: textInput.trim() };
    const next = [...shapes, shape];
    setShapes(next);
    pushHistory(next);
    setSelected(shape.id);
    setTextPrompt(null);
  }

  function updateSelectedLabel() {
    if (!selected) return;
    const next = shapes.map((s) => s.id === selected ? { ...s, label: labelInput } : s);
    setShapes(next);
    pushHistory(next);
  }

  function updateSelectedColor(c: string) {
    setColorInput(c);
    if (!selected) return;
    const next = shapes.map((s) => s.id === selected ? { ...s, color: c } : s);
    setShapes(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(shapes);
      toast.success("Floor plan saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function exportAsPNG() {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2; canvas.height = H * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${plan.name}.png`;
        a.click();
      });
    };
    img.src = url;
  }

  function exportAsSVG() {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${plan.name}.svg`;
    a.click();
  }

  const canUndo = hi > 0;
  const canRedo = hi < history.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-sm font-semibold text-white truncate max-w-[180px]">{plan.name}</span>
          {projectName && <span className="text-xs text-slate-400 hidden sm:block">· {projectName}</span>}
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} className="h-7 w-7 text-slate-300 hover:text-white">
            <Undo2 size={14} />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} className="h-7 w-7 text-slate-300 hover:text-white">
            <Redo2 size={14} />
          </Button>
        </div>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <Button size="icon" variant="ghost" onClick={() => setShowGrid((g) => !g)} className={`h-7 w-7 ${showGrid ? "text-violet-400" : "text-slate-500"}`}>
          <Grid3X3 size={14} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="h-7 w-7 text-slate-300 hover:text-white">
          <ZoomIn size={14} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="h-7 w-7 text-slate-300 hover:text-white">
          <ZoomOut size={14} />
        </Button>
        <span className="text-xs text-slate-500">{Math.round(zoom * 100)}%</span>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={exportAsSVG} className="h-7 gap-1 text-xs text-slate-300 hover:text-white">
            <Download size={12} /> SVG
          </Button>
          <Button size="sm" variant="ghost" onClick={exportAsPNG} className="h-7 gap-1 text-xs text-slate-300 hover:text-white">
            <Download size={12} /> PNG
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 gap-1 text-xs bg-violet-600 hover:bg-violet-500">
            <Save size={12} /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7 text-slate-400 hover:text-red-400">
            <X size={14} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Tool palette ── */}
        <div className="w-[72px] bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {TOOL_DEFS.map(({ tool: t, label, Icon }) => (
            <button key={t} title={label} onClick={() => setTool(t)}
              className={`flex flex-col items-center gap-0.5 w-14 py-2 rounded-lg text-[10px] transition-colors ${
                tool === t
                  ? "bg-violet-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}

          <div className="flex-1" />

          {selected && (
            <button onClick={deleteSelected} title="Delete (Del)"
              className="flex flex-col items-center gap-0.5 w-14 py-2 rounded-lg text-[10px] text-red-400 hover:text-red-300 hover:bg-slate-800">
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-auto bg-slate-800 flex items-center justify-center">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              className="bg-white shadow-2xl"
              style={{ cursor: tool === "select" ? "default" : "crosshair" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {/* Grid */}
              {showGrid && (
                <defs>
                  <pattern id="smallGrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                    <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
                  </pattern>
                  <pattern id="bigGrid" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
                    <rect width={GRID * 5} height={GRID * 5} fill="url(#smallGrid)" />
                    <path d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`} fill="none" stroke="#cbd5e1" strokeWidth={1} />
                  </pattern>
                </defs>
              )}
              {showGrid && <rect width={W} height={H} fill="url(#bigGrid)" />}

              {/* Scale indicator */}
              <g transform={`translate(30,${H - 30})`}>
                <line x1={0} y1={0} x2={100} y2={0} stroke="#64748b" strokeWidth={1.5} strokeLinecap="square" />
                <line x1={0} y1={-4} x2={0} y2={4} stroke="#64748b" strokeWidth={1.5} />
                <line x1={100} y1={-4} x2={100} y2={4} stroke="#64748b" strokeWidth={1.5} />
                <text x={50} y={-8} textAnchor="middle" fontSize="9" fill="#64748b">2.5m</text>
              </g>
              <text x={30} y={H - 10} fontSize="8" fill="#94a3b8">1 grid cell = 0.5m</text>

              {/* Shapes */}
              {shapes.map((s) => (
                <RenderShape key={s.id} s={s} selected={s.id === selected} />
              ))}

              {/* Preview shape while drawing */}
              {preview && (() => {
                const ps: Shape = preview as Shape;
                if (["room", "staircase", "bathroom"].includes(ps.type)) {
                  const { x, y, width, height } = normalizeRect(ps.x, ps.y, ps.width ?? 0, ps.height ?? 0);
                  return <rect x={x} y={y} width={width} height={height}
                    fill={ps.color ?? "#dbeafe"} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3" fillOpacity={0.5} />;
                }
                if (ps.type === "wall") {
                  return <line x1={ps.x} y1={ps.y} x2={ps.x2 ?? ps.x} y2={ps.y2 ?? ps.y}
                    stroke="#0f172a" strokeWidth={6} strokeLinecap="round" opacity={0.5} />;
                }
                if (ps.type === "door") {
                  return <g transform={`translate(${ps.x},${ps.y})`} opacity={0.6}>
                    <line x1={0} y1={0} x2={60} y2={0} stroke="#0f172a" strokeWidth={2} />
                    <line x1={0} y1={0} x2={0} y2={-60} stroke="#94a3b8" strokeWidth={1} />
                    <path d="M 60 0 A 60 60 0 0 0 0 -60" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="5 3" />
                  </g>;
                }
                if (ps.type === "window") {
                  return <line x1={ps.x} y1={ps.y} x2={ps.x + 60} y2={ps.y} stroke="#0f172a" strokeWidth={6} opacity={0.5} />;
                }
                return null;
              })()}

              {/* Text input cursor */}
              {textPrompt && (
                <circle cx={textPrompt.x} cy={textPrompt.y} r={4} fill="#3b82f6" opacity={0.7} />
              )}
            </svg>
          </div>
        </div>

        {/* ── Properties panel ── */}
        <div className="w-52 bg-slate-900 border-l border-slate-800 flex-shrink-0 p-3 flex flex-col gap-3 overflow-y-auto">
          {selectedShape ? (
            <>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Properties</p>
                <p className="text-xs text-slate-300 mb-3 capitalize">{selectedShape.type.replace(/_/g, " ")}</p>
              </div>

              {["room", "text", "staircase", "bathroom"].includes(selectedShape.type) && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-slate-400">Label</Label>
                  <div className="flex gap-1">
                    <Input value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && updateSelectedLabel()}
                      className="h-7 text-xs bg-slate-800 border-slate-700 text-white" placeholder="Room name" />
                    <Button size="icon" className="h-7 w-7 flex-shrink-0 bg-violet-600 hover:bg-violet-500"
                      onClick={updateSelectedLabel}><span className="text-[10px]">✓</span></Button>
                  </div>
                </div>
              )}

              {["room", "staircase", "bathroom"].includes(selectedShape.type) && (
                <>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px] text-slate-400">Fill color</Label>
                    <div className="flex gap-1 flex-wrap">
                      {ROOM_COLORS.map((c) => (
                        <button key={c} onClick={() => updateSelectedColor(c)}
                          className={`w-7 h-7 rounded border-2 transition-all ${colorInput === c ? "border-violet-400 scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px] text-slate-400">Custom color</Label>
                    <input type="color" value={colorInput} onChange={(e) => updateSelectedColor(e.target.value)}
                      className="h-7 w-full rounded cursor-pointer bg-slate-800 border border-slate-700" />
                  </div>

                  <div className="text-xs text-slate-400 space-y-0.5">
                    <p>Width: <span className="text-white">{((selectedShape.width ?? 0) / GRID / 2).toFixed(1)}m</span></p>
                    <p>Height: <span className="text-white">{((selectedShape.height ?? 0) / GRID / 2).toFixed(1)}m</span></p>
                    <p>Area: <span className="text-white">{(((selectedShape.width ?? 0) * (selectedShape.height ?? 0)) / (GRID * GRID) / 4).toFixed(1)}m²</span></p>
                  </div>
                </>
              )}

              {(selectedShape.type === "door" || selectedShape.type === "window") && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-slate-400">Width</Label>
                  <div className="flex gap-1">
                    <Input type="number" value={(selectedShape.width ?? 60) / GRID / 2}
                      onChange={(e) => {
                        const w = Math.round(parseFloat(e.target.value) * GRID * 2 / GRID) * GRID;
                        const next = shapes.map((s) => s.id === selected ? { ...s, width: w } : s);
                        setShapes(next);
                      }}
                      className="h-7 text-xs bg-slate-800 border-slate-700 text-white"
                      step={0.5} min={0.5} max={10} />
                    <span className="text-xs text-slate-400 self-center">m</span>
                  </div>
                </div>
              )}

              <Button variant="destructive" size="sm" onClick={deleteSelected} className="h-7 text-xs gap-1 mt-auto">
                <Trash2 size={11} /> Delete
              </Button>
            </>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">How to use</p>
              <div className="text-[11px] text-slate-500 space-y-2 leading-relaxed">
                <p>• Pick a tool from the left panel</p>
                <p>• Click-and-drag to draw rooms, walls, or staircases</p>
                <p>• Click to place doors, windows, and labels</p>
                <p>• Select a shape to edit its label and colour</p>
                <p>• Drag selected shapes to reposition</p>
                <p>• Del key removes the selected shape</p>
                <p>• Ctrl+Z / Ctrl+Y to undo/redo</p>
              </div>

              <div className="mt-4">
                <p className="text-[11px] text-slate-400 font-medium mb-1">Scale</p>
                <p className="text-[11px] text-slate-500">1 grid cell = 0.5 m</p>
                <p className="text-[11px] text-slate-500">Grid: {GRID}px/cell</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Text input dialog ── */}
      {textPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 w-72 shadow-2xl">
            <p className="text-sm font-medium text-white">Add text label</p>
            <Input autoFocus value={textInput} onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextPrompt(null); }}
              className="bg-slate-800 border-slate-600 text-white" placeholder="e.g. Living Room, 25m²" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setTextPrompt(null)}>Cancel</Button>
              <Button size="sm" onClick={commitText} className="bg-violet-600 hover:bg-violet-500">Add</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
