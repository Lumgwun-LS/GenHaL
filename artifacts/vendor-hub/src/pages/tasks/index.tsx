import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isPast, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Plus, MoreHorizontal, Calendar, User, Building2, Tag, Loader2,
  CheckCircle2, Circle, Clock, AlertCircle, Flame, ChevronDown,
  Paperclip, Trash2, Edit2, X, Filter, ArrowUpDown, Zap, Phone,
  MessageSquare, Receipt, ShoppingBag, ListTodo, Globe, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ───────────────────────────────────────────────────────────────────
type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskType = "general" | "call_customer" | "send_message" | "send_invoice" | "send_product" | "post_social_media" | "create_strategy";

interface VendorTask {
  id: number;
  vendorId: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  branchId?: number | null;
  workerId?: number | null;
  customerId?: number | null;
  leadId?: number | null;
  taskType: TaskType;
  taskData?: string | null;
  automatedAction: boolean;
  reminderSentAt?: string | null;
  actionExecutedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Assignees {
  branches: { id: number; name: string }[];
  workers: { id: number; name: string; role?: string | null; branchId?: number | null }[];
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function fetchTasks(filters: Record<string, string>): Promise<VendorTask[]> {
  const params = new URLSearchParams(filters);
  const res = await fetch(`${BASE_URL}/api/tasks?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

async function fetchAssignees(): Promise<Assignees> {
  const res = await fetch(`${BASE_URL}/api/tasks/meta/assignees`, { credentials: "include" });
  if (!res.ok) return { branches: [], workers: [] };
  return res.json();
}

async function createTask(data: Partial<VendorTask>): Promise<VendorTask> {
  const res = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Failed to create task"); }
  return res.json();
}

async function updateTask(id: number, data: Partial<VendorTask>): Promise<VendorTask> {
  const res = await fetch(`${BASE_URL}/api/tasks/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Failed to update task"); }
  return res.json();
}

async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/tasks/${id}`, {
    method: "DELETE", credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete task");
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLUMNS: { status: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "todo",        label: "To Do",      icon: <Circle className="w-4 h-4" />,        color: "border-slate-300" },
  { status: "in_progress", label: "In Progress", icon: <Clock className="w-4 h-4 text-blue-500" />, color: "border-blue-400" },
  { status: "done",        label: "Done",        icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, color: "border-green-400" },
];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: React.ReactNode }> = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-600",  icon: <ArrowUpDown className="w-3 h-3" /> },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-700",    icon: <ArrowUpDown className="w-3 h-3" /> },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700",icon: <Flame className="w-3 h-3" /> },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700",      icon: <AlertCircle className="w-3 h-3" /> },
};

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: React.ReactNode }> = {
  general:           { label: "General",            icon: <ListTodo className="w-4 h-4" /> },
  call_customer:     { label: "Call Customer",      icon: <Phone className="w-4 h-4 text-green-600" /> },
  send_message:      { label: "Send Message",       icon: <MessageSquare className="w-4 h-4 text-blue-600" /> },
  send_invoice:      { label: "Send Invoice",       icon: <Receipt className="w-4 h-4 text-purple-600" /> },
  send_product:      { label: "Send Product",       icon: <ShoppingBag className="w-4 h-4 text-orange-600" /> },
  post_social_media: { label: "Post to Social",     icon: <Globe className="w-4 h-4 text-violet-600" /> },
  create_strategy:   { label: "Create AI Strategy", icon: <Lightbulb className="w-4 h-4 text-amber-600" /> },
};

// ─── Due date label ───────────────────────────────────────────────────────────
function DueDateBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const overdue = isPast(d) && !isToday(d);
  const today   = isToday(d);
  const tomorrow = isTomorrow(d);
  return (
    <span className={cn(
      "flex items-center gap-1 text-xs rounded px-1.5 py-0.5",
      overdue ? "bg-red-100 text-red-700" :
      today   ? "bg-orange-100 text-orange-700" :
      tomorrow ? "bg-yellow-100 text-yellow-700" :
      "bg-slate-100 text-slate-500",
    )}>
      <Calendar className="w-3 h-3" />
      {overdue ? `Overdue · ${formatDistanceToNow(d, { addSuffix: false })} ago` :
       today   ? `Today ${format(d, "h:mm a")}` :
       tomorrow ? "Tomorrow" :
       format(d, "MMM d")}
    </span>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({
  task, assignees,
  onEdit, onDelete, onStatusChange,
}: {
  task: VendorTask;
  assignees: Assignees;
  onEdit: (t: VendorTask) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: TaskStatus) => void;
}) {
  const worker = task.workerId ? assignees.workers.find(w => w.id === task.workerId) : null;
  const branch = task.branchId ? assignees.branches.find(b => b.id === task.branchId) : null;
  const pri = PRIORITY_CONFIG[task.priority];
  const typ = TASK_TYPE_CONFIG[task.taskType];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-4 group cursor-pointer"
      onClick={() => onEdit(task)}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {typ.icon}
          <p className="font-medium text-sm text-slate-800 truncate">{task.title}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onEdit(task)}><Edit2 className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
            {task.status !== "done" && (
              <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />Mark Done
              </DropdownMenuItem>
            )}
            {task.status !== "in_progress" && task.status !== "done" && (
              <DropdownMenuItem onClick={() => onStatusChange(task.id, "in_progress")}>
                <Clock className="w-4 h-4 mr-2 text-blue-600" />Start Working
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600"
              onClick={() => onDelete(task.id)}>
              <Trash2 className="w-4 h-4 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{task.description}</p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className={cn("flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5", pri.color)}>
          {pri.icon}{pri.label}
        </span>
        <DueDateBadge dueDate={task.dueDate} />
        {task.automatedAction && (
          <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">
            <Zap className="w-3 h-3" />Auto
          </span>
        )}
        {(task.imageUrl || task.videoUrl) && (
          <span className="flex items-center gap-1 text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
            <Paperclip className="w-3 h-3" />Media
          </span>
        )}
      </div>

      {/* Footer: assignees */}
      {(worker || branch) && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          {worker && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />{worker.name}
            </span>
          )}
          {branch && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3" />{branch.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task form dialog ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: "", description: "", status: "todo" as TaskStatus, priority: "medium" as TaskPriority,
  dueDate: "", imageUrl: "", videoUrl: "", branchId: "", workerId: "",
  taskType: "general" as TaskType, automatedAction: false, notes: "",
  // taskData fields — shown dynamically based on taskType
  tdMessage: "", tdSubject: "", tdScript: "", tdTopic: "", tdPlatforms: "instagram, facebook", tdProblem: "",
};

function parseTaskData(raw: string | null | undefined): Record<string, any> {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}

function buildTaskDataFromForm(form: typeof EMPTY_FORM): Record<string, any> | undefined {
  switch (form.taskType) {
    case "send_message":
      if (!form.tdMessage && !form.tdSubject) return undefined;
      return { message: form.tdMessage || undefined, subject: form.tdSubject || undefined };
    case "call_customer":
      if (!form.tdScript) return undefined;
      return { script: form.tdScript };
    case "post_social_media": {
      const platforms = form.tdPlatforms.split(",").map(s => s.trim()).filter(Boolean);
      return { topic: form.tdTopic || undefined, platforms: platforms.length ? platforms : ["instagram", "facebook"] };
    }
    case "create_strategy":
      if (!form.tdProblem) return undefined;
      return { problem: form.tdProblem };
    default:
      return undefined;
  }
}

function TaskFormDialog({
  open, onClose, editing, assignees, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: VendorTask | null;
  assignees: Assignees;
  onSave: (data: Partial<VendorTask>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  function syncFromEditing(e: VendorTask) {
    const td = parseTaskData(e.taskData);
    setForm({
      title:           e.title,
      description:     e.description ?? "",
      status:          e.status,
      priority:        e.priority,
      dueDate:         e.dueDate ? e.dueDate.slice(0, 16) : "",
      imageUrl:        e.imageUrl ?? "",
      videoUrl:        e.videoUrl ?? "",
      branchId:        e.branchId?.toString() ?? "",
      workerId:        e.workerId?.toString() ?? "",
      taskType:        e.taskType,
      automatedAction: e.automatedAction,
      notes:           e.notes ?? "",
      tdMessage:       td.message ?? "",
      tdSubject:       td.subject ?? "",
      tdScript:        td.script  ?? "",
      tdTopic:         td.topic   ?? "",
      tdPlatforms:     Array.isArray(td.platforms) ? td.platforms.join(", ") : (td.platforms ?? "instagram, facebook"),
      tdProblem:       td.problem ?? "",
    });
  }

  // Sync form when editing task changes
  useState(() => {
    if (editing) syncFromEditing(editing);
    else setForm({ ...EMPTY_FORM });
  });

  // Re-sync when editing changes (not just on mount)
  const prevEditingRef = { current: editing };
  if (prevEditingRef.current !== editing) {
    prevEditingRef.current = editing;
    if (editing) syncFromEditing(editing);
    else setForm({ ...EMPTY_FORM });
  }

  function set(k: keyof typeof EMPTY_FORM, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const taskData = buildTaskDataFromForm(form);
      await onSave({
        title:           form.title.trim(),
        description:     form.description || undefined,
        status:          form.status,
        priority:        form.priority,
        dueDate:         form.dueDate || undefined,
        imageUrl:        form.imageUrl || undefined,
        videoUrl:        form.videoUrl || undefined,
        branchId:        form.branchId ? parseInt(form.branchId) : undefined,
        workerId:        form.workerId ? parseInt(form.workerId) : undefined,
        taskType:        form.taskType,
        automatedAction: form.automatedAction,
        taskData:        taskData ? JSON.stringify(taskData) : undefined,
        notes:           form.notes || undefined,
      });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Task" : "Create Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="What needs to be done?" required />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Additional details..." rows={3} />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label>Due Date & Time</Label>
            <Input type="datetime-local" value={form.dueDate}
              onChange={e => set("dueDate", e.target.value)} />
          </div>

          {/* Task type */}
          <div className="space-y-1.5">
            <Label>Task Type</Label>
            <Select value={form.taskType} onValueChange={v => set("taskType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TASK_TYPE_CONFIG) as [TaskType, { label: string; icon: React.ReactNode }][]).map(([v, cfg]) => (
                  <SelectItem key={v} value={v}>
                    <span className="flex items-center gap-2">{cfg.icon}{cfg.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic taskData fields */}
          {form.taskType === "send_message" && (
            <div className="space-y-3 rounded-lg bg-blue-50 p-4 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />Email Configuration
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <input className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={form.tdSubject} onChange={e => set("tdSubject", e.target.value)} placeholder="Email subject line" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Message Body</Label>
                <Textarea value={form.tdMessage} onChange={e => set("tdMessage", e.target.value)} placeholder="Write the message to send to the customer…" rows={3} className="bg-white" />
              </div>
            </div>
          )}
          {form.taskType === "call_customer" && (
            <div className="space-y-3 rounded-lg bg-green-50 p-4 border border-green-100">
              <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />Call Script — read aloud by AI voice (ElevenLabs)
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Script</Label>
                <Textarea value={form.tdScript} onChange={e => set("tdScript", e.target.value)} placeholder="Hi, this is a message from [Business Name]. We'd like to remind you…" rows={4} className="bg-white" />
              </div>
            </div>
          )}
          {form.taskType === "post_social_media" && (
            <div className="space-y-3 rounded-lg bg-violet-50 p-4 border border-violet-100">
              <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />Social Post — AI generates the caption from your topic
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Topic / Trending Issue</Label>
                <Textarea value={form.tdTopic} onChange={e => set("tdTopic", e.target.value)} placeholder="e.g. New product launch, seasonal offer, industry news…" rows={3} className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Platforms (comma-separated)</Label>
                <input className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={form.tdPlatforms} onChange={e => set("tdPlatforms", e.target.value)} placeholder="instagram, facebook, twitter" />
              </div>
            </div>
          )}
          {form.taskType === "create_strategy" && (
            <div className="space-y-3 rounded-lg bg-amber-50 p-4 border border-amber-100">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />AI Strategy — a full structured plan emailed to you
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Business Problem or Goal</Label>
                <Textarea value={form.tdProblem} onChange={e => set("tdProblem", e.target.value)} placeholder="Describe the challenge or goal you want a strategy for…" rows={4} className="bg-white" />
              </div>
            </div>
          )}

          {/* Branch + Worker */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assign to Branch</Label>
              <Select value={form.branchId} onValueChange={v => set("branchId", v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {assignees.branches.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to Worker</Label>
              <Select value={form.workerId} onValueChange={v => set("workerId", v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {assignees.workers.map(w => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name}{w.role ? ` · ${w.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Media */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)}
                placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Video URL</Label>
              <Input value={form.videoUrl} onChange={e => set("videoUrl", e.target.value)}
                placeholder="https://..." />
            </div>
          </div>

          {/* Automated action toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-600" />Automated Action
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically execute this task's action at the due date/time
              </p>
            </div>
            <Switch checked={form.automatedAction}
              onCheckedChange={v => set("automatedAction", v)} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Internal notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const qc = useQueryClient();
  const [filterWorker, setFilterWorker] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorTask | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>("todo");

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (filterWorker)   f.workerId  = filterWorker;
    if (filterBranch)   f.branchId  = filterBranch;
    if (filterPriority) f.priority  = filterPriority;
    return f;
  }, [filterWorker, filterBranch, filterPriority]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => fetchTasks(filters),
  });

  const { data: assignees = { branches: [], workers: [] } } = useQuery({
    queryKey: ["task-assignees"],
    queryFn: fetchAssignees,
  });

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task created"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VendorTask> }) => updateTask(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task deleted"); },
  });

  function openCreate(status: TaskStatus = "todo") {
    setEditing(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }

  async function handleSave(data: Partial<VendorTask>) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast.success("Task updated");
    } else {
      await createMutation.mutateAsync({ ...data, status: defaultStatus });
    }
  }

  function handleStatusChange(id: number, status: TaskStatus) {
    updateMutation.mutate({ id, data: { status } }, {
      onSuccess: () => toast.success(status === "done" ? "Task marked done ✅" : "Status updated"),
    });
  }

  function handleDelete(id: number) {
    if (confirm("Delete this task?")) deleteMutation.mutate(id);
  }

  // Summary counts for header
  const counts = useMemo(() => ({
    todo:        tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done:        tasks.filter(t => t.status === "done").length,
    overdue:     tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== "done" && t.status !== "cancelled").length,
  }), [tasks]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-primary" />Task Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.todo} to do · {counts.in_progress} in progress · {counts.done} done
            {counts.overdue > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {counts.overdue} overdue</span>
            )}
          </p>
        </div>
        <Button onClick={() => openCreate()} className="gap-2">
          <Plus className="w-4 h-4" />New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 h-9 text-xs">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {assignees.branches.length > 0 && (
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All branches</SelectItem>
              {assignees.branches.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {assignees.workers.length > 0 && (
          <Select value={filterWorker} onValueChange={setFilterWorker}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue placeholder="All workers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All workers</SelectItem>
              {assignees.workers.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {(filterPriority || filterBranch || filterWorker) && (
          <Button variant="ghost" size="sm" className="h-9 text-xs gap-1"
            onClick={() => { setFilterPriority(""); setFilterBranch(""); setFilterWorker(""); }}>
            <X className="w-3 h-3" />Clear filters
          </Button>
        )}
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.status);
            return (
              <div key={col.status} className="flex flex-col gap-3">
                {/* Column header */}
                <div className={cn("flex items-center justify-between px-3 py-2 rounded-lg border-l-4 bg-white shadow-sm", col.color)}>
                  <div className="flex items-center gap-2">
                    {col.icon}
                    <span className="font-semibold text-sm text-slate-800">{col.label}</span>
                    <span className="text-xs text-muted-foreground bg-slate-100 rounded-full px-2 py-0.5">
                      {colTasks.length}
                    </span>
                  </div>
                  {col.status !== "done" && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => openCreate(col.status)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Task cards */}
                <div className="space-y-3 min-h-[100px]">
                  {colTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-muted-foreground">
                      <Circle className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-xs">No tasks here</p>
                      {col.status === "todo" && (
                        <button onClick={() => openCreate("todo")}
                          className="text-xs text-primary hover:underline mt-1">+ Add task</button>
                      )}
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        assignees={assignees}
                        onEdit={t => { setEditing(t); setDialogOpen(true); }}
                        onDelete={handleDelete}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <TaskFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        assignees={assignees}
        onSave={handleSave}
      />
    </div>
  );
}
