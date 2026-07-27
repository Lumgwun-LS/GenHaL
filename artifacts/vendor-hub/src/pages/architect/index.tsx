import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Ruler, FolderOpen, LayoutPanelLeft, FileText, HardHat,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Building2, Calendar, DollarSign, CheckCircle2, Clock, AlertCircle,
  Download, ExternalLink, RefreshCw, Users,
} from "lucide-react";
import { FloorPlanEditor } from "./floor-plan-editor";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(s: string | null | undefined) {
  if (!s) return "—";
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  return n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

const PROJECT_STATUSES = ["planning", "design", "permits", "construction", "completed", "on_hold"];
const PROJECT_TYPES = ["residential", "commercial", "renovation", "landscape", "mixed_use"];
const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "delayed"];
const DRAWING_STATUSES = ["draft", "for_review", "approved", "superseded"];
const CONTRACTOR_STATUSES = ["not_started", "in_progress", "completed", "delayed"];

const STATUS_COLOR: Record<string, string> = {
  planning: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  design: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  permits: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  construction: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  on_hold: "bg-red-500/15 text-red-400 border-red-500/20",
  pending: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  delayed: "bg-red-500/15 text-red-400 border-red-500/20",
  draft: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  for_review: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  superseded: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  not_started: "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_COLOR[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function milestoneProgress(milestones: Record<string, string>[]): number {
  if (!milestones.length) return 0;
  const done = milestones.filter((m) => m.status === "completed").length;
  return Math.round((done / milestones.length) * 100);
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function ProjectDialog({ open, onClose, onSave, initial, projects }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, string>) => void;
  initial?: Record<string, string>; projects?: Record<string, string>[];
}) {
  const [form, setForm] = useState<Record<string, string>>(initial ?? { status: "planning", projectType: "residential" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Project" : "New Project"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Project name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Eko Atlantic Villa" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Client name</Label>
            <Input value={form.clientName ?? ""} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Client email</Label>
            <Input value={form.clientEmail ?? ""} onChange={(e) => set("clientEmail", e.target.value)} type="email" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Client phone</Label>
            <Input value={form.clientPhone ?? ""} onChange={(e) => set("clientPhone", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Budget (₦)</Label>
            <Input value={form.budget ?? ""} onChange={(e) => set("budget", e.target.value)} type="number" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Project type</Label>
            <Select value={form.projectType ?? "residential"} onValueChange={(v) => set("projectType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_TYPES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Status</Label>
            <Select value={form.status ?? "planning"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Start date</Label>
            <Input value={form.startDate?.slice(0, 10) ?? ""} onChange={(e) => set("startDate", e.target.value)} type="date" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>End date</Label>
            <Input value={form.endDate?.slice(0, 10) ?? ""} onChange={(e) => set("endDate", e.target.value)} type="date" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Site address" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name?.trim()}>Save project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({ open, onClose, onSave, initial, projectId, projectName }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, string>) => void;
  initial?: Record<string, string>; projectId: number; projectName: string;
}) {
  const [form, setForm] = useState<Record<string, string>>(initial ?? { status: "pending" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit Milestone" : `Add Milestone — ${projectName}`}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Structural drawings approved" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Status</Label>
            <Select value={form.status ?? "pending"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Due date</Label>
            <Input value={form.dueDate?.slice(0, 10) ?? ""} onChange={(e) => set("dueDate", e.target.value)} type="date" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...form, projectId: String(projectId) })} disabled={!form.name?.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DrawingDialog({ open, onClose, onSave, initial, projects }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, string>) => void;
  initial?: Record<string, string>; projects: Record<string, string>[];
}) {
  const [form, setForm] = useState<Record<string, string>>(initial ?? { status: "draft", version: "R1" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Drawing" : "Add Drawing Revision"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Drawing name *</Label>
            <Input value={form.drawingName ?? ""} onChange={(e) => set("drawingName", e.target.value)} placeholder="e.g. Ground Floor Plan, Section A-A" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Version</Label>
            <Input value={form.version ?? "R1"} onChange={(e) => set("version", e.target.value)} placeholder="R1, R2, Rev.3…" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Status</Label>
            <Select value={form.status ?? "draft"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DRAWING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Project</Label>
            <Select value={form.projectId ?? ""} onValueChange={(v) => set("projectId", v)}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>File URL</Label>
            <Input value={form.fileUrl ?? ""} onChange={(e) => set("fileUrl", e.target.value)} placeholder="https://…/drawing.pdf" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>File name</Label>
            <Input value={form.fileName ?? ""} onChange={(e) => set("fileName", e.target.value)} placeholder="GF-Plan-R1.pdf" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Reviewer notes</Label>
            <Textarea value={form.reviewerNotes ?? ""} onChange={(e) => set("reviewerNotes", e.target.value)} rows={2} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.drawingName?.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractorDialog({ open, onClose, onSave, initial, projects }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, string>) => void;
  initial?: Record<string, string>; projects: Record<string, string>[];
}) {
  const [form, setForm] = useState<Record<string, string>>(initial ?? { status: "not_started" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Task" : "Schedule Contractor Task"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label>Contractor name *</Label>
            <Input value={form.contractorName ?? ""} onChange={(e) => set("contractorName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Task name *</Label>
            <Input value={form.taskName ?? ""} onChange={(e) => set("taskName", e.target.value)} placeholder="e.g. Foundation works" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Email</Label>
            <Input value={form.contractorEmail ?? ""} onChange={(e) => set("contractorEmail", e.target.value)} type="email" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Phone</Label>
            <Input value={form.contractorPhone ?? ""} onChange={(e) => set("contractorPhone", e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Project</Label>
            <Select value={form.projectId ?? ""} onValueChange={(v) => set("projectId", v)}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Start date</Label>
            <Input value={form.startDate?.slice(0, 10) ?? ""} onChange={(e) => set("startDate", e.target.value)} type="date" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>End date</Label>
            <Input value={form.endDate?.slice(0, 10) ?? ""} onChange={(e) => set("endDate", e.target.value)} type="date" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Cost (₦)</Label>
            <Input value={form.cost ?? ""} onChange={(e) => set("cost", e.target.value)} type="number" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Status</Label>
            <Select value={form.status ?? "not_started"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACTOR_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.contractorName?.trim() || !form.taskName?.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FloorPlanDialog({ open, onClose, onSave, projects }: {
  open: boolean; onClose: () => void; onSave: (data: Record<string, string>) => void;
  projects: Record<string, string>[];
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Floor Plan</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Plan name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ground Floor Plan" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Project (optional)</Label>
            <Select value={form.projectId ?? ""} onValueChange={(v) => set("projectId", v)}>
              <SelectTrigger><SelectValue placeholder="Link to project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name?.trim()}>Create &amp; open editor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArchitectPage() {
  const qc = useQueryClient();
  const { vendor: myVendor } = useCurrentVendor();
  const isAdmin = useIsAdmin();
  const [adminVendorId, setAdminVendorId] = useState<number | null>(null);
  const vendorId = isAdmin ? (adminVendorId ?? myVendor?.id) : myVendor?.id;

  // Dialogs
  const [projDialog, setProjDialog] = useState<{ open: boolean; item?: Record<string, string> }>({ open: false });
  const [drawingDialog, setDrawingDialog] = useState<{ open: boolean; item?: Record<string, string> }>({ open: false });
  const [contractorDialog, setContractorDialog] = useState<{ open: boolean; item?: Record<string, string> }>({ open: false });
  const [fpDialog, setFpDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Record<string, string> | null>(null);
  const [milestoneCtx, setMilestoneCtx] = useState<{ project: Record<string, string>; item?: Record<string, string> } | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Admin vendor picker
  const { data: allVendors } = useQuery({ queryKey: ["vendors-list"], queryFn: () => apiFetch("/vendors"), enabled: isAdmin });

  const q = (suffix: string, extra?: string) => `/architect/${suffix}?vendorId=${vendorId}${extra ?? ""}`;

  const { data: projects = [] } = useQuery<Record<string, string>[]>({
    queryKey: ["arch-projects", vendorId], queryFn: () => apiFetch(q("projects")), enabled: !!vendorId,
  });
  const { data: milestones = [] } = useQuery<Record<string, string>[]>({
    queryKey: ["arch-milestones", vendorId], queryFn: () => apiFetch(q("milestones")), enabled: !!vendorId,
  });
  const { data: drawings = [] } = useQuery<Record<string, string>[]>({
    queryKey: ["arch-drawings", vendorId], queryFn: () => apiFetch(q("drawings")), enabled: !!vendorId,
  });
  const { data: contractors = [] } = useQuery<Record<string, string>[]>({
    queryKey: ["arch-contractors", vendorId], queryFn: () => apiFetch(q("contractors")), enabled: !!vendorId,
  });
  const { data: floorPlans = [], refetch: refetchPlans } = useQuery<Record<string, string>[]>({
    queryKey: ["arch-floor-plans", vendorId], queryFn: () => apiFetch(q("floor-plans")), enabled: !!vendorId,
  });

  function invalidate() {
    ["arch-projects", "arch-milestones", "arch-drawings", "arch-contractors", "arch-floor-plans"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, vendorId] })
    );
  }

  // ── Project mutations ──
  const createProject = useMutation({ mutationFn: (d: Record<string, string>) => apiFetch("/architect/projects", { method: "POST", body: JSON.stringify({ ...d, vendorId }) }), onSuccess: invalidate });
  const updateProject = useMutation({ mutationFn: ({ id, ...d }: Record<string, string>) => apiFetch(`/architect/projects/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deleteProject = useMutation({ mutationFn: (id: string) => apiFetch(`/architect/projects/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  // ── Milestone mutations ──
  const createMilestone = useMutation({ mutationFn: (d: Record<string, string>) => apiFetch("/architect/milestones", { method: "POST", body: JSON.stringify({ ...d, vendorId }) }), onSuccess: invalidate });
  const updateMilestone = useMutation({ mutationFn: ({ id, ...d }: Record<string, string>) => apiFetch(`/architect/milestones/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deleteMilestone = useMutation({ mutationFn: (id: string) => apiFetch(`/architect/milestones/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  // ── Drawing mutations ──
  const createDrawing = useMutation({ mutationFn: (d: Record<string, string>) => apiFetch("/architect/drawings", { method: "POST", body: JSON.stringify({ ...d, vendorId }) }), onSuccess: invalidate });
  const updateDrawing = useMutation({ mutationFn: ({ id, ...d }: Record<string, string>) => apiFetch(`/architect/drawings/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deleteDrawing = useMutation({ mutationFn: (id: string) => apiFetch(`/architect/drawings/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  // ── Contractor mutations ──
  const createContractor = useMutation({ mutationFn: (d: Record<string, string>) => apiFetch("/architect/contractors", { method: "POST", body: JSON.stringify({ ...d, vendorId }) }), onSuccess: invalidate });
  const updateContractor = useMutation({ mutationFn: ({ id, ...d }: Record<string, string>) => apiFetch(`/architect/contractors/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deleteContractor = useMutation({ mutationFn: (id: string) => apiFetch(`/architect/contractors/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  // ── Floor plan mutations ──
  const createPlan = useMutation({ mutationFn: (d: Record<string, string>) => apiFetch("/architect/floor-plans", { method: "POST", body: JSON.stringify({ ...d, vendorId }) }), onSuccess: invalidate });
  const updatePlan = useMutation({ mutationFn: ({ id, ...d }: Record<string, unknown>) => apiFetch(`/architect/floor-plans/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: invalidate });
  const deletePlan = useMutation({ mutationFn: (id: string) => apiFetch(`/architect/floor-plans/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  // ── Stats ──
  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => ["design", "permits", "construction"].includes(p.status)).length,
    completed: projects.filter((p) => p.status === "completed").length,
    pendingMilestones: milestones.filter((m) => m.status !== "completed").length,
    contractors: [...new Set(contractors.map((c) => c.contractorName))].length,
    drawings: drawings.length,
  }), [projects, milestones, contractors, drawings]);

  // Helper to get milestones for a project
  function projectMilestones(projectId: string) {
    return milestones.filter((m) => m.projectId === projectId);
  }

  function projectName(id: string) {
    return projects.find((p) => p.id === id)?.name ?? "—";
  }

  async function handleSavePlan(plan: Record<string, string>, shapes: unknown[]) {
    await updatePlan.mutateAsync({ id: plan.id, data: { shapes } });
    await refetchPlans();
  }

  // ── Admin picker guard ──
  if (isAdmin && !adminVendorId && !myVendor) {
    return (
      <Layout>
        <div className="p-8 max-w-sm mx-auto">
          <h2 className="text-lg font-semibold mb-4">Select vendor to manage</h2>
          <Select onValueChange={(v) => setAdminVendorId(parseInt(v))}>
            <SelectTrigger><SelectValue placeholder="Choose a vendor…" /></SelectTrigger>
            <SelectContent>{(allVendors ?? []).map((v: Record<string, string>) => <SelectItem key={v.id} value={v.id}>{v.businessName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Layout>
    );
  }

  return (
    <>
      {/* Floor plan editor overlay */}
      {editingPlan && (
        <FloorPlanEditor
          plan={{ id: parseInt(editingPlan.id), name: editingPlan.name, data: editingPlan.data ?? null }}
          vendorId={vendorId!}
          projectName={editingPlan.projectId ? projectName(editingPlan.projectId) : undefined}
          onSave={async (shapes) => { await handleSavePlan(editingPlan, shapes); }}
          onClose={() => setEditingPlan(null)}
        />
      )}

      <Layout>
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Ruler size={22} /> Architect Studio</h1>
              <p className="text-muted-foreground text-sm mt-1">Floor plans, project milestones, drawing revisions, and contractor scheduling</p>
            </div>
            {isAdmin && myVendor && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Managing:</span>
                <Badge variant="secondary">{myVendor.businessName as string}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setAdminVendorId(null)} className="h-7 gap-1 text-xs"><RefreshCw size={11} /> Switch</Button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Projects", value: stats.total, icon: FolderOpen, color: "text-violet-400" },
              { label: "Active", value: stats.active, icon: Building2, color: "text-blue-400" },
              { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-emerald-400" },
              { label: "Pending steps", value: stats.pendingMilestones, icon: Clock, color: "text-amber-400" },
              { label: "Contractors", value: stats.contractors, icon: Users, color: "text-orange-400" },
              { label: "Drawings", value: stats.drawings, icon: FileText, color: "text-sky-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="bg-card/60">
                <CardContent className="p-3 flex items-center gap-2">
                  <Icon size={18} className={color} />
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="projects">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="projects" className="gap-1"><FolderOpen size={13} /> Projects</TabsTrigger>
              <TabsTrigger value="floor-plans" className="gap-1"><LayoutPanelLeft size={13} /> Floor Plans</TabsTrigger>
              <TabsTrigger value="drawings" className="gap-1"><FileText size={13} /> Drawings</TabsTrigger>
              <TabsTrigger value="contractors" className="gap-1"><HardHat size={13} /> Contractors</TabsTrigger>
            </TabsList>

            {/* ── PROJECTS ── */}
            <TabsContent value="projects" className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{projects.length} projects total</p>
                <Button size="sm" className="gap-1" onClick={() => setProjDialog({ open: true })}>
                  <Plus size={13} /> New project
                </Button>
              </div>

              {projects.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No projects yet — click "New project" to get started.</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {projects.map((proj) => {
                    const ms = projectMilestones(proj.id);
                    const prog = milestoneProgress(ms);
                    const isExpanded = expandedProject === parseInt(proj.id);

                    return (
                      <Card key={proj.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{proj.name}</span>
                                <StatusBadge status={proj.status} />
                                <span className="text-[11px] text-muted-foreground capitalize">{proj.projectType?.replace(/_/g, " ")}</span>
                              </div>
                              {proj.clientName && <p className="text-xs text-muted-foreground mt-0.5">Client: {proj.clientName}</p>}
                              {proj.address && <p className="text-xs text-muted-foreground">{proj.address}{proj.city ? `, ${proj.city}` : ""}</p>}
                              <div className="flex items-center gap-4 mt-2">
                                {proj.budget && <span className="text-xs flex items-center gap-1 text-muted-foreground"><DollarSign size={11} />₦{fmtMoney(proj.budget)}</span>}
                                {proj.startDate && <span className="text-xs flex items-center gap-1 text-muted-foreground"><Calendar size={11} />{fmtDate(proj.startDate)}{proj.endDate ? ` → ${fmtDate(proj.endDate)}` : ""}</span>}
                              </div>
                              {ms.length > 0 && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                    <span>{ms.filter((m) => m.status === "completed").length}/{ms.length} milestones</span>
                                    <span>{prog}%</span>
                                  </div>
                                  <Progress value={prog} className="h-1.5" />
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                onClick={() => setExpandedProject(isExpanded ? null : parseInt(proj.id))}>
                                {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Milestones ({ms.length})
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setProjDialog({ open: true, item: proj })}>
                                <Pencil size={12} />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => { await deleteProject.mutateAsync(proj.id); toast.success("Project deleted"); }}>
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          </div>

                          {/* Milestones panel */}
                          {isExpanded && (
                            <div className="mt-4 border-t pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground">Milestones</span>
                                <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs"
                                  onClick={() => setMilestoneCtx({ project: proj })}>
                                  <Plus size={11} /> Add
                                </Button>
                              </div>
                              {ms.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No milestones — add one above.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {ms.map((m) => (
                                    <div key={m.id} className="flex items-center gap-2 group">
                                      {m.status === "completed"
                                        ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                                        : m.status === "delayed"
                                        ? <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                                        : <Clock size={14} className="text-muted-foreground flex-shrink-0" />}
                                      <span className={`text-xs flex-1 ${m.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{m.name}</span>
                                      {m.dueDate && <span className="text-[11px] text-muted-foreground hidden sm:block">{fmtDate(m.dueDate)}</span>}
                                      <StatusBadge status={m.status} />
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="icon" variant="ghost" className="h-5 w-5"
                                          onClick={() => setMilestoneCtx({ project: proj, item: m })}><Pencil size={10} /></Button>
                                        <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive"
                                          onClick={async () => { await deleteMilestone.mutateAsync(m.id); toast.success("Deleted"); }}><Trash2 size={10} /></Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── FLOOR PLANS ── */}
            <TabsContent value="floor-plans" className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{floorPlans.length} floor plans</p>
                <Button size="sm" className="gap-1" onClick={() => setFpDialog(true)}>
                  <Plus size={13} /> New floor plan
                </Button>
              </div>

              {floorPlans.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <LayoutPanelLeft size={32} className="mx-auto mb-3 opacity-30" />
                  <p>No floor plans yet.</p>
                  <p className="text-xs mt-1">Click "New floor plan" to open the interactive editor.</p>
                </CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {floorPlans.map((fp) => {
                    const parsed = fp.data ? (() => { try { return JSON.parse(fp.data); } catch { return null; } })() : null;
                    const shapeCount = parsed?.shapes?.length ?? 0;
                    const proj = fp.projectId ? projects.find((p) => p.id === fp.projectId) : null;
                    return (
                      <Card key={fp.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        {/* Preview area */}
                        <div className="bg-slate-100 dark:bg-slate-800 h-40 flex items-center justify-center relative border-b">
                          {shapeCount > 0 ? (
                            <svg viewBox="0 0 1200 900" className="w-full h-full p-3">
                              <defs>
                                <pattern id={`g${fp.id}`} width={20} height={20} patternUnits="userSpaceOnUse">
                                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth={0.8} />
                                </pattern>
                              </defs>
                              <rect width={1200} height={900} fill={`url(#g${fp.id})`} />
                              {(parsed?.shapes ?? []).map((s: Record<string, unknown>) => {
                                if (s.type === "room" || s.type === "staircase" || s.type === "bathroom") {
                                  return <rect key={s.id as string} x={s.x as number} y={s.y as number} width={s.width as number} height={s.height as number}
                                    fill={(s.color as string) ?? "#dbeafe"} stroke="#334155" strokeWidth={2} />;
                                }
                                if (s.type === "wall") {
                                  return <line key={s.id as string} x1={s.x as number} y1={s.y as number} x2={(s.x2 ?? s.x) as number} y2={(s.y2 ?? s.y) as number} stroke="#0f172a" strokeWidth={6} strokeLinecap="round" />;
                                }
                                return null;
                              })}
                            </svg>
                          ) : (
                            <div className="text-center text-muted-foreground">
                              <LayoutPanelLeft size={28} className="mx-auto mb-1 opacity-30" />
                              <p className="text-xs">Empty canvas</p>
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">{fp.name}</p>
                              {proj && <p className="text-xs text-muted-foreground">{proj.name}</p>}
                              <p className="text-[11px] text-muted-foreground mt-0.5">{shapeCount} element{shapeCount !== 1 ? "s" : ""} · {fmtDate(fp.updatedAt)}</p>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => setEditingPlan(fp)}>
                                <Pencil size={11} /> Edit
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => { await deletePlan.mutateAsync(fp.id); toast.success("Deleted"); }}>
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── DRAWINGS ── */}
            <TabsContent value="drawings" className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{drawings.length} drawing revisions</p>
                <Button size="sm" className="gap-1" onClick={() => setDrawingDialog({ open: true })}>
                  <Plus size={13} /> Add revision
                </Button>
              </div>

              {drawings.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No drawing revisions yet.</CardContent></Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Drawing</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewer notes</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drawings.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{d.drawingName}</p>
                              {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{d.version}</span></TableCell>
                          <TableCell className="text-sm">{d.projectId ? projectName(d.projectId) : "—"}</TableCell>
                          <TableCell><StatusBadge status={d.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{d.reviewerNotes || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {d.fileUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /></a>
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawingDialog({ open: true, item: d })}><Pencil size={12} /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                                onClick={async () => { await deleteDrawing.mutateAsync(d.id); toast.success("Deleted"); }}><Trash2 size={12} /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            {/* ── CONTRACTORS ── */}
            <TabsContent value="contractors" className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{contractors.length} scheduled tasks</p>
                <Button size="sm" className="gap-1" onClick={() => setContractorDialog({ open: true })}>
                  <Plus size={13} /> Schedule task
                </Button>
              </div>

              {contractors.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No contractor tasks yet.</CardContent></Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Timeline</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contractors.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{c.contractorName}</p>
                              {c.contractorEmail && <p className="text-xs text-muted-foreground">{c.contractorEmail}</p>}
                              {c.contractorPhone && <p className="text-xs text-muted-foreground">{c.contractorPhone}</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{c.taskName}</p>
                              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.projectId ? projectName(c.projectId) : "—"}</TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground">
                              {c.startDate ? <><Calendar size={10} className="inline mr-1" />{fmtDate(c.startDate)}</> : "—"}
                              {c.endDate && <><br />→ {fmtDate(c.endDate)}</>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.cost ? `₦${fmtMoney(c.cost)}` : "—"}</TableCell>
                          <TableCell><StatusBadge status={c.status} /></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setContractorDialog({ open: true, item: c })}><Pencil size={12} /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                                onClick={async () => { await deleteContractor.mutateAsync(c.id); toast.success("Deleted"); }}><Trash2 size={12} /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Dialogs ── */}
        <ProjectDialog
          open={projDialog.open} onClose={() => setProjDialog({ open: false })} initial={projDialog.item}
          onSave={async (d) => {
            try {
              if (projDialog.item) await updateProject.mutateAsync({ id: projDialog.item.id, ...d });
              else await createProject.mutateAsync(d);
              toast.success(projDialog.item ? "Project updated" : "Project created");
              setProjDialog({ open: false });
            } catch (e) { toast.error(String(e)); }
          }}
        />

        {milestoneCtx && (
          <MilestoneDialog
            open={!!milestoneCtx} onClose={() => setMilestoneCtx(null)}
            projectId={parseInt(milestoneCtx.project.id)} projectName={milestoneCtx.project.name}
            initial={milestoneCtx.item}
            onSave={async (d) => {
              try {
                if (milestoneCtx.item) await updateMilestone.mutateAsync({ id: milestoneCtx.item.id, ...d });
                else await createMilestone.mutateAsync(d);
                toast.success(milestoneCtx.item ? "Updated" : "Milestone added");
                setMilestoneCtx(null);
              } catch (e) { toast.error(String(e)); }
            }}
          />
        )}

        <DrawingDialog
          open={drawingDialog.open} onClose={() => setDrawingDialog({ open: false })} initial={drawingDialog.item}
          projects={projects as Record<string, string>[]}
          onSave={async (d) => {
            try {
              if (drawingDialog.item) await updateDrawing.mutateAsync({ id: drawingDialog.item.id, ...d });
              else await createDrawing.mutateAsync(d);
              toast.success(drawingDialog.item ? "Updated" : "Drawing added");
              setDrawingDialog({ open: false });
            } catch (e) { toast.error(String(e)); }
          }}
        />

        <ContractorDialog
          open={contractorDialog.open} onClose={() => setContractorDialog({ open: false })} initial={contractorDialog.item}
          projects={projects as Record<string, string>[]}
          onSave={async (d) => {
            try {
              if (contractorDialog.item) await updateContractor.mutateAsync({ id: contractorDialog.item.id, ...d });
              else await createContractor.mutateAsync(d);
              toast.success(contractorDialog.item ? "Updated" : "Task scheduled");
              setContractorDialog({ open: false });
            } catch (e) { toast.error(String(e)); }
          }}
        />

        <FloorPlanDialog
          open={fpDialog} onClose={() => setFpDialog(false)}
          projects={projects as Record<string, string>[]}
          onSave={async (d) => {
            try {
              const created = await createPlan.mutateAsync(d);
              toast.success("Floor plan created");
              setFpDialog(false);
              setEditingPlan(created);
            } catch (e) { toast.error(String(e)); }
          }}
        />
      </Layout>
    </>
  );
}
