import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { useGetGenhalTree, useListGenhalTreeMembers, useAddGenhalTreeMember } from '@workspace/api-client-react';
import {
  ArrowLeft, UserPlus, ZoomIn, ZoomOut, Maximize2, RotateCcw,
  Plus, Loader2, MapPin, Users, X, Heart, Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalTreeMembersQueryKey, getGetGenhalTreeQueryKey } from '@workspace/api-client-react';

// ─── layout constants ──────────────────────────────────────────────────────────
const NODE_W = 180;
const NODE_H = 128;
const H_GAP  = 64;
const V_GAP  = 88;

// ─── hierarchical tree layout ──────────────────────────────────────────────────
function computeLayout(members: any[]): Record<number, { x: number; y: number }> {
  if (!members.length) return {};

  const childrenOf: Record<number, number[]> = {};
  const rootIds: number[] = [];
  for (const m of members) {
    if (!m.parentId) rootIds.push(m.id);
    else { (childrenOf[m.parentId] ??= []).push(m.id); }
  }

  const positions: Record<number, { x: number; y: number }> = {};

  function subtreeWidth(id: number): number {
    const kids = childrenOf[id] ?? [];
    if (!kids.length) return NODE_W;
    const w = kids.reduce((acc, cid) => acc + subtreeWidth(cid) + H_GAP, -H_GAP);
    return Math.max(w, NODE_W);
  }

  function place(id: number, left: number, level: number) {
    const kids = childrenOf[id] ?? [];
    const w = subtreeWidth(id);
    positions[id] = { x: left + (w - NODE_W) / 2, y: level * (NODE_H + V_GAP) };
    let cx = left;
    for (const cid of kids) {
      const cw = subtreeWidth(cid);
      place(cid, cx, level + 1);
      cx += cw + H_GAP;
    }
  }

  let rx = 0;
  for (const rid of rootIds) { place(rid, rx, 0); rx += subtreeWidth(rid) + H_GAP; }
  return positions;
}

// ─── TreeDetail (main page) ────────────────────────────────────────────────────
export default function TreeDetail() {
  const params   = useParams();
  const treeId   = Number(params.id);
  const { data: tree,    isLoading: tl } = useGetGenhalTree(treeId);
  const { data: members, isLoading: ml } = useListGenhalTreeMembers(treeId);

  // canvas transform
  const canvasRef              = useRef<HTMLDivElement>(null);
  const [zoom, setZoom]        = useState(1);
  const [pan,  setPan]         = useState({ x: 60, y: 60 });
  const [positions, setPos]    = useState<Record<number, { x: number; y: number }>>({});
  const [laid, setLaid]        = useState(false);

  // drag/pan refs — avoid re-render loops
  const dragRef     = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const panRef      = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const movedRef    = useRef(false);   // distinguish click vs drag

  // UI
  const [selected,   setSelected]   = useState<any>(null);
  const [isAddOpen,  setAddOpen]    = useState(false);
  const [addParent,  setAddParent]  = useState<number | undefined>();

  // ── auto-layout ──
  const doLayout = useCallback((pos?: Record<number, { x: number; y: number }>) => {
    if (!members?.length) return;
    const p = pos ?? computeLayout(members);
    setPos(p);

    const canvas = canvasRef.current;
    if (!canvas) { setPan({ x: 60, y: 60 }); setZoom(1); return; }
    const xs = Object.values(p).map(v => v.x);
    const ys = Object.values(p).map(v => v.y);
    const tw = Math.max(...xs) + NODE_W - Math.min(...xs);
    const th = Math.max(...ys) + NODE_H - Math.min(...ys);
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const z  = Math.min(1, Math.min((vw - 80) / tw, (vh - 80) / th));
    setPan({ x: (vw - tw * z) / 2 - Math.min(...xs) * z, y: (vh - th * z) / 2 - Math.min(...ys) * z });
    setZoom(z);
  }, [members]);

  useEffect(() => {
    if (members && !laid) { doLayout(computeLayout(members)); setLaid(true); }
  }, [members, laid, doLayout]);

  // fit-to-screen
  const fit = useCallback(() => doLayout(positions), [doLayout, positions]);

  // reset layout
  const reset = useCallback(() => {
    if (!members?.length) return;
    const p = computeLayout(members);
    doLayout(p);
  }, [members, doLayout]);

  // ── drag ──
  const onNodeDown = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    movedRef.current = false;
    const rect = canvasRef.current!.getBoundingClientRect();
    const p    = positions[id] ?? { x: 0, y: 0 };
    dragRef.current = {
      id,
      ox: (e.clientX - rect.left) - (p.x * zoom + pan.x),
      oy: (e.clientY - rect.top)  - (p.y * zoom + pan.y),
    };
  }, [positions, zoom, pan]);

  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, tx: pan.x, ty: pan.y };
  }, [pan]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (dragRef.current) {
      movedRef.current = true;
      const { id, ox, oy } = dragRef.current;
      const nx = ((e.clientX - rect.left) - ox - pan.x) / zoom;
      const ny = ((e.clientY - rect.top)  - oy - pan.y) / zoom;
      setPos(prev => ({ ...prev, [id]: { x: nx, y: ny } }));
    } else if (panRef.current) {
      const dx = e.clientX - panRef.current.sx;
      const dy = e.clientY - panRef.current.sy;
      setPan({ x: panRef.current.tx + dx, y: panRef.current.ty + dy });
    }
  }, [pan, zoom]);

  const onUp = useCallback(() => { dragRef.current = null; panRef.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    const dz   = e.deltaY > 0 ? 0.9 : 1.1;
    const nz   = Math.max(0.15, Math.min(2.5, zoom * dz));
    setPan(p => ({
      x: cx - (cx - p.x) * (nz / zoom),
      y: cy - (cy - p.y) * (nz / zoom),
    }));
    setZoom(nz);
  }, [zoom]);

  // ── SVG connections ──
  const { curves, spouses } = useMemo(() => {
    const curves: React.ReactElement[] = [];
    const spouses: React.ReactElement[] = [];
    const seen = new Set<string>();
    for (const m of members ?? []) {
      if (m.parentId && positions[m.parentId] && positions[m.id]) {
        const px = positions[m.parentId].x + NODE_W / 2;
        const py = positions[m.parentId].y + NODE_H;
        const cx = positions[m.id].x + NODE_W / 2;
        const cy = positions[m.id].y;
        const my = (py + cy) / 2;
        curves.push(
          <path key={`p-${m.parentId}-${m.id}`}
            d={`M${px},${py} C${px},${my} ${cx},${my} ${cx},${cy}`}
            fill="none" stroke="hsl(var(--border))" strokeWidth="2" strokeLinecap="round" />
        );
      }
      if (m.spouseId && positions[m.id] && positions[m.spouseId]) {
        const key = [m.id, m.spouseId].sort().join('-');
        if (!seen.has(key)) {
          seen.add(key);
          const ax = positions[m.id].x + NODE_W;
          const ay = positions[m.id].y + NODE_H / 2;
          const bx = positions[m.spouseId].x;
          const by = positions[m.spouseId].y + NODE_H / 2;
          spouses.push(
            <line key={`s-${key}`}
              x1={ax} y1={ay} x2={bx} y2={by}
              stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="6 4" opacity="0.6" />
          );
        }
      }
    }
    return { curves, spouses };
  }, [members, positions]);

  if (tl || ml) return (
    <div className="flex items-center justify-center h-[70vh]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
  if (!tree) return <div className="p-8 text-muted-foreground">Tree not found.</div>;

  return (
    // break out of layout padding to fill available space
    <div className="flex flex-col -mx-4 md:-mx-8 -mt-4 md:-mt-10 h-[calc(100svh-4rem)]">

      {/* ── toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card/90 backdrop-blur-sm shrink-0 z-10">
        <Link href="/genealogy">
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <p className="font-serif font-bold text-base truncate leading-tight">{tree.name}</p>
          <p className="text-xs text-muted-foreground">{members?.length ?? 0} members</p>
        </div>

        {/* zoom controls */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md"
            onClick={() => setZoom(z => Math.max(0.15, z * 0.8))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-mono w-9 text-center text-muted-foreground select-none">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md"
            onClick={() => setZoom(z => Math.min(2.5, z * 1.2))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="Fit to screen" onClick={fit}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="Reset layout" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>

        <Button size="sm" className="bg-primary rounded-full ml-1"
          onClick={() => { setAddParent(undefined); setAddOpen(true); }}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add Member
        </Button>
      </div>

      {/* ── canvas ──────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden select-none"
        style={{
          background: 'radial-gradient(circle, hsl(var(--muted)) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          cursor: dragRef.current ? 'grabbing' : panRef.current ? 'grabbing' : 'grab',
        }}
        onMouseDown={onCanvasDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onWheel={onWheel}
      >
        {/* empty state */}
        {!members?.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Network className="h-10 w-10 text-primary" />
            </div>
            <div>
              <p className="font-serif text-2xl font-bold">Start your family tree</p>
              <p className="text-muted-foreground text-sm mt-1">Add the first person to begin building your lineage.</p>
            </div>
            <Button className="rounded-full pointer-events-auto"
              onClick={() => { setAddParent(undefined); setAddOpen(true); }}>
              Add First Member
            </Button>
          </div>
        )}

        {/* transformed world */}
        <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>
          {/* SVG lines */}
          <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }} width="0" height="0">
            {curves}
            {spouses}
          </svg>

          {/* person cards */}
          {members?.map(m => {
            const p = positions[m.id];
            if (!p) return null;
            return (
              <div
                key={m.id}
                style={{ position: 'absolute', left: p.x, top: p.y, width: NODE_W, cursor: 'grab' }}
                onMouseDown={e => onNodeDown(e, m.id)}
                onClick={() => { if (!movedRef.current) setSelected(m); }}
              >
                <PersonCard
                  member={m}
                  isSelected={selected?.id === m.id}
                  onAddChild={e => {
                    e.stopPropagation();
                    setAddParent(m.id);
                    setAddOpen(true);
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* hint */}
        <div className="absolute bottom-3 left-3 text-[11px] text-muted-foreground bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-full border pointer-events-none">
          Scroll to zoom · Drag canvas to pan · Drag cards to reposition · Click a card for details
        </div>

        {/* legend */}
        <div className="absolute bottom-3 right-3 flex gap-3 text-[11px] text-muted-foreground bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-full border pointer-events-none">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-border rounded" />Parent–Child
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-primary/60 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--primary)/0.6) 0, hsl(var(--primary)/0.6) 4px, transparent 4px, transparent 8px)' }} />Spouse
          </span>
        </div>
      </div>

      {/* ── add member dialog ──────────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Add Family Member</DialogTitle>
          </DialogHeader>
          <AddMemberForm
            treeId={treeId}
            parentId={addParent}
            members={members ?? []}
            onSuccess={() => { setAddOpen(false); setLaid(false); }}
          />
        </DialogContent>
      </Dialog>

      {/* ── detail panel ──────────────────────────────── */}
      {selected && (
        <MemberPanel
          member={selected}
          all={members ?? []}
          onClose={() => setSelected(null)}
          onAddChild={() => { setAddParent(selected.id); setAddOpen(true); setSelected(null); }}
        />
      )}
    </div>
  );
}

// ─── PersonCard ────────────────────────────────────────────────────────────────
function PersonCard({ member, isSelected, onAddChild }: {
  member: any; isSelected: boolean; onAddChild: (e: React.MouseEvent) => void;
}) {
  const male   = member.gender === 'male';
  const female = member.gender === 'female';

  return (
    <div className={`relative group rounded-2xl border-2 shadow-lg bg-card transition-all duration-150
      ${isSelected   ? 'border-primary ring-2 ring-primary/30 shadow-primary/20' :
        male         ? 'border-blue-200 dark:border-blue-800 hover:border-blue-400' :
        female       ? 'border-pink-200 dark:border-pink-800 hover:border-pink-400' :
                       'border-border hover:border-primary/50'}
      hover:shadow-xl hover:-translate-y-0.5`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      {/* colour top bar */}
      <div className={`absolute inset-x-0 top-0 h-1.5 rounded-t-2xl
        ${male ? 'bg-gradient-to-r from-blue-400 to-blue-300' :
          female ? 'bg-gradient-to-r from-pink-400 to-rose-300' :
                   'bg-gradient-to-r from-muted to-muted-foreground/30'}`} />

      {/* add-child button */}
      <button
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground
                   shadow-md opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center justify-center z-10
                   hover:scale-110"
        onClick={onAddChild}
        title="Add child"
      >
        <Plus className="h-3 w-3" />
      </button>

      <div className="flex flex-col items-center justify-center h-full px-3 pt-3 pb-2 gap-1.5">
        {/* avatar */}
        <div className={`w-11 h-11 rounded-full border-2 border-white shadow overflow-hidden flex items-center justify-center
          ${male ? 'bg-blue-100 dark:bg-blue-900/40' : female ? 'bg-pink-100 dark:bg-pink-900/40' : 'bg-muted'}`}>
          {member.photoUrl
            ? <img src={member.photoUrl} className="w-full h-full object-cover" alt="" />
            : <span className="font-serif font-bold text-muted-foreground text-sm">
                {member.firstName?.[0]}{member.lastName?.[0]}
              </span>
          }
        </div>

        {/* name */}
        <div className="text-center leading-tight">
          <p className="font-serif font-bold text-foreground text-sm leading-tight line-clamp-1">
            {member.firstName} {member.lastName}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {member.birthDate ? new Date(member.birthDate).getFullYear() : '?'}
            &thinsp;–&thinsp;
            {member.isLiving ? 'Present' : (member.deathDate ? new Date(member.deathDate).getFullYear() : '?')}
          </p>
          {member.birthPlace && (
            <p className="text-[10px] text-muted-foreground/70 flex items-center justify-center gap-0.5 mt-0.5">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[120px]">{member.birthPlace}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MemberPanel ───────────────────────────────────────────────────────────────
function MemberPanel({ member, all, onClose, onAddChild }: {
  member: any; all: any[]; onClose: () => void; onAddChild: () => void;
}) {
  const male     = member.gender === 'male';
  const female   = member.gender === 'female';
  const parent   = member.parentId ? all.find(m => m.id === member.parentId) : null;
  const children = all.filter(m => m.parentId === member.id);
  const spouse   = member.spouseId ? all.find(m => m.id === member.spouseId) : null;

  return (
    <div className="absolute inset-y-0 right-0 w-72 md:w-80 bg-card border-l shadow-2xl z-20 flex flex-col
                    animate-in slide-in-from-right duration-300 overflow-hidden">
      {/* header */}
      <div className={`px-5 pt-6 pb-5 text-white
        ${male ? 'bg-gradient-to-br from-blue-500 to-blue-700' :
          female ? 'bg-gradient-to-br from-pink-500 to-rose-600' :
                   'bg-gradient-to-br from-secondary to-secondary/70'}`}>
        <div className="flex justify-end mb-3">
          <button onClick={onClose} className="p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 overflow-hidden flex items-center justify-center">
            {member.photoUrl
              ? <img src={member.photoUrl} className="w-full h-full object-cover" alt="" />
              : <span className="font-serif font-bold text-2xl">{member.firstName?.[0]}{member.lastName?.[0]}</span>
            }
          </div>
          <div>
            <h2 className="font-serif font-bold text-xl">{member.firstName} {member.lastName}</h2>
            <p className="text-white/70 text-xs mt-0.5 capitalize">{member.gender} · {member.isLiving ? 'Living' : 'Deceased'}</p>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* facts */}
        <div className="space-y-2.5 text-sm">
          {member.birthDate && (
            <Row label="Born" value={new Date(member.birthDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
          )}
          {member.birthPlace && <Row label="Birthplace" value={member.birthPlace} />}
          {!member.isLiving && member.deathDate && (
            <Row label="Died" value={new Date(member.deathDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
          )}
        </div>

        {/* relations */}
        {(parent || spouse || children.length > 0) && (
          <div className="space-y-2.5 text-sm border-t pt-4">
            {parent && <Row label="Parent" value={`${parent.firstName} ${parent.lastName}`} />}
            {spouse && (
              <div className="flex gap-3">
                <span className="font-medium text-muted-foreground w-20 shrink-0 flex items-center gap-1">
                  <Heart className="h-3 w-3 text-pink-400" /> Spouse
                </span>
                <span className="text-foreground">{spouse.firstName} {spouse.lastName}</span>
              </div>
            )}
            {children.length > 0 && (
              <div className="flex gap-3">
                <span className="font-medium text-muted-foreground w-20 shrink-0">Children</span>
                <div className="space-y-0.5">
                  {children.map(c => (
                    <p key={c.id} className="text-foreground">{c.firstName} {c.lastName}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* biography */}
        {member.bio && (
          <div className="border-t pt-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Biography</p>
            <p className="text-sm leading-relaxed text-foreground/80">{member.bio}</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-muted/30">
        <Button className="w-full rounded-full" onClick={onAddChild}>
          <Users className="mr-2 h-4 w-4" /> Add Child
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="font-medium text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// ─── AddMemberForm ─────────────────────────────────────────────────────────────
function AddMemberForm({ treeId, parentId, members, onSuccess }: {
  treeId: number; parentId?: number; members: any[]; onSuccess: () => void;
}) {
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const addMember   = useAddGenhalTreeMember();
  const [form, set] = useState({
    treeId,
    parentId: parentId,
    firstName: '', lastName: '', gender: 'male', isLiving: true,
    birthDate: '', birthPlace: '', bio: '',
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName) return;
    addMember.mutate({
      id: treeId,
      data: { ...form, birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined }
    }, {
      onSuccess: () => {
        toast({ title: 'Member added!' });
        qc.invalidateQueries({ queryKey: getListGenhalTreeMembersQueryKey(treeId) });
        qc.invalidateQueries({ queryKey: getGetGenhalTreeQueryKey(treeId) });
        onSuccess();
      },
      onError: () => toast({ variant: 'destructive', title: 'Failed to add member' }),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First Name *</Label>
          <Input value={form.firstName} onChange={e => set(f => ({ ...f, firstName: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <Label>Last Name</Label>
          <Input value={form.lastName} onChange={e => set(f => ({ ...f, lastName: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Gender</Label>
          <Select value={form.gender} onValueChange={v => set(f => ({ ...f, gender: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.isLiving ? 'living' : 'deceased'} onValueChange={v => set(f => ({ ...f, isLiving: v === 'living' }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="living">Living</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Birth Date</Label>
          <Input type="date" value={form.birthDate} onChange={e => set(f => ({ ...f, birthDate: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Birth Place</Label>
          <Input value={form.birthPlace} placeholder="e.g. Lagos, Nigeria" onChange={e => set(f => ({ ...f, birthPlace: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Parent</Label>
        <Select value={form.parentId?.toString() ?? 'none'} onValueChange={v => set(f => ({ ...f, parentId: v === 'none' ? undefined : Number(v) }))}>
          <SelectTrigger><SelectValue placeholder="Select parent (optional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No parent (root)</SelectItem>
            {members.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.firstName} {m.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Biography / Notes</Label>
        <Textarea value={form.bio} onChange={e => set(f => ({ ...f, bio: e.target.value }))}
          placeholder="Significant life events, occupation, stories…" rows={3} />
      </div>
      <div className="pt-2 flex justify-end">
        <Button type="submit" disabled={addMember.isPending || !form.firstName} className="bg-primary rounded-full px-8">
          {addMember.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Member
        </Button>
      </div>
    </form>
  );
}
