import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceField, useVoiceCommand } from "@/contexts/voice-context";
import {
  useListExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useListBranches,
  useListWorkers,
  getListExpensesQueryKey,
  getListBranchesQueryKey,
  getListWorkersQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Plus, Download, Upload, Pencil, Trash2, Repeat, PauseCircle, PlayCircle, CalendarClock, List } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilterControl, BranchWorkerFilterControl, BranchWorkerFormFields } from "@/components/finance-filters";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CATEGORIES = ["Inventory", "Marketing", "Utilities", "Rent", "Payroll", "Shipping", "Software", "Fees", "Travel", "Other"];

type RecurringFrequency = "weekly" | "monthly" | "yearly";
const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];
function frequencyLabel(freq: string | null | undefined): string {
  return FREQUENCIES.find((f) => f.value === freq)?.label ?? freq ?? "";
}

export default function ExpensesPage() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"all" | "recurring">("all");
  const [category, setCategory] = useState<string>("all");
  const [recurringStatusFilter, setRecurringStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [recurringFreqFilter, setRecurringFreqFilter] = useState<"all" | RecurringFrequency>("all");
  const dateFilter = useDateRangeFilter();
  const [branchFilter, setBranchFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");

  const branchListParams = { vendorId: vendorId as number };
  const { data: branches } = useListBranches(branchListParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListBranchesQueryKey(branchListParams) },
  });
  const workerListParams = { vendorId: vendorId as number };
  const { data: workers } = useListWorkers(workerListParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListWorkersQueryKey(workerListParams) },
  });

  // All-expenses query — respects all filters including date range
  const listParams = {
    vendorId: vendorId as number,
    ...(category !== "all" ? { category } : {}),
    ...(branchFilter !== "all" ? { branchId: Number(branchFilter) } : {}),
    ...(workerFilter !== "all" ? { workerId: Number(workerFilter) } : {}),
    ...(dateFilter.from ? { from: dateFilter.from } : {}),
    ...(dateFilter.to ? { to: dateFilter.to } : {}),
  };
  const { data: expenses, isLoading } = useListExpenses(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListExpensesQueryKey(listParams) },
  });

  // Recurring-only query — no date filter so we always see all templates
  const recurringListParams = {
    vendorId: vendorId as number,
    ...(category !== "all" ? { category } : {}),
  };
  const { data: allExpenses, isLoading: isLoadingRecurring } = useListExpenses(recurringListParams, {
    query: { enabled: Boolean(vendorId) && activeTab === "recurring", queryKey: getListExpensesQueryKey(recurringListParams) },
  });

  // Filter and sort recurring templates by next occurrence date (soonest first)
  const recurringTemplates = useMemo(() => {
    const templates = (allExpenses ?? []).filter((e) => {
      if (!e.isRecurring) return false;
      if (recurringStatusFilter === "active" && e.recurringPaused) return false;
      if (recurringStatusFilter === "paused" && !e.recurringPaused) return false;
      if (recurringFreqFilter !== "all" && e.recurringFrequency !== recurringFreqFilter) return false;
      return true;
    });
    return [...templates].sort((a, b) => {
      const aDate = a.nextOccurrenceDate ? new Date(a.nextOccurrenceDate).getTime() : Infinity;
      const bDate = b.nextOccurrenceDate ? new Date(b.nextOccurrenceDate).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [allExpenses, recurringStatusFilter, recurringFreqFilter]);

  // Projected monthly recurring cost — active (non-paused) templates only
  const projectedMonthlyTotal = useMemo(() => {
    return recurringTemplates
      .filter((e) => !e.recurringPaused)
      .reduce((sum, e) => {
        const freq = e.recurringFrequency;
        if (freq === "weekly") return sum + e.amount * 4.33;
        if (freq === "yearly") return sum + e.amount / 12;
        return sum + e.amount; // monthly
      }, 0);
  }, [recurringTemplates]);

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]!);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [formBranchId, setFormBranchId] = useState("none");
  const [formWorkerId, setFormWorkerId] = useState("none");
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formFrequency, setFormFrequency] = useState<RecurringFrequency>("monthly");

  // Voice field registrations
  useVoiceField("expense-description", "description", setDescription);
  useVoiceField("expense-amount", "amount", setAmount);
  useVoiceField("expense-date", "expense date", setExpenseDate);
  useVoiceCommand("record expense", () => setOpen(true));
  useVoiceCommand("new expense", () => setOpen(true));

  const [editing, setEditing] = useState<{ id: number; category: string; description: string; amount: number; expenseDate: string; branchId: string; workerId: string; isRecurring: boolean; recurringFrequency: RecurringFrequency } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey(listParams) });
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey(recurringListParams) });
  }

  async function handleCreate() {
    if (!vendorId || !amount) return;
    try {
      await createExpense.mutateAsync({
        data: {
          vendorId,
          category: formCategory,
          description: description || undefined,
          amount: parseFloat(amount),
          expenseDate: expenseDate ? new Date(expenseDate).toISOString() : undefined,
          branchId: formBranchId !== "none" ? Number(formBranchId) : undefined,
          workerId: formWorkerId !== "none" ? Number(formWorkerId) : undefined,
          isRecurring: formIsRecurring,
          ...(formIsRecurring ? { recurringFrequency: formFrequency } : {}),
        },
      });
      toast.success(formIsRecurring ? "Recurring expense set up" : "Expense recorded");
      setOpen(false);
      setDescription(""); setAmount(""); setExpenseDate(""); setFormBranchId("none"); setFormWorkerId("none");
      setFormIsRecurring(false); setFormFrequency("monthly");
      invalidate();
    } catch {
      toast.error("Failed to record expense");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateExpense.mutateAsync({
        id: editing.id,
        data: {
          category: editing.category,
          description: editing.description || undefined,
          amount: editing.amount,
          expenseDate: editing.expenseDate ? new Date(editing.expenseDate).toISOString() : undefined,
          branchId: editing.branchId !== "none" ? Number(editing.branchId) : null,
          workerId: editing.workerId !== "none" ? Number(editing.workerId) : null,
          isRecurring: editing.isRecurring,
          recurringFrequency: editing.isRecurring ? editing.recurringFrequency : null,
        },
      });
      toast.success("Expense updated");
      setEditing(null);
      invalidate();
    } catch {
      toast.error("Failed to update expense");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteExpense.mutateAsync({ id });
      toast.success("Expense deleted");
      invalidate();
    } catch {
      toast.error("Failed to delete expense");
    }
  }

  async function handleTogglePause(id: number, currentlyPaused: boolean) {
    try {
      await updateExpense.mutateAsync({ id, data: { recurringPaused: !currentlyPaused } });
      toast.success(currentlyPaused ? "Recurring expense resumed" : "Recurring expense paused");
      invalidate();
    } catch {
      toast.error(currentlyPaused ? "Failed to resume expense" : "Failed to pause expense");
    }
  }

  async function handleExport() {
    if (!vendorId) return;
    const params = new URLSearchParams({ vendorId: String(vendorId) });
    if (branchFilter !== "all") params.set("branchId", branchFilter);
    if (workerFilter !== "all") params.set("workerId", workerFilter);
    if (dateFilter.from) params.set("from", dateFilter.from);
    if (dateFilter.to) params.set("to", dateFilter.to);
    try {
      const res = await fetch(`${BASE_URL}/api/expenses/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `expenses-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Export failed");
    }
  }

  const totalExpenses = expenses?.reduce((s, r) => s + r.amount, 0) ?? 0;

  function branchName(id: number | null | undefined) {
    if (!id) return "—";
    return branches?.find((b) => b.id === id)?.name ?? "—";
  }
  function workerName(id: number | null | undefined) {
    if (!id) return "—";
    return workers?.find((w) => w.id === id)?.name ?? "—";
  }

  function openEditDialog(expense: typeof recurringTemplates[number]) {
    setEditing({
      id: expense.id,
      category: expense.category,
      description: expense.description ?? "",
      amount: expense.amount,
      expenseDate: expense.expenseDate.slice(0, 10),
      branchId: expense.branchId ? String(expense.branchId) : "none",
      workerId: expense.workerId ? String(expense.workerId) : "none",
      isRecurring: expense.isRecurring,
      recurringFrequency: (expense.recurringFrequency as RecurringFrequency) ?? "monthly",
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track categorized business expenses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!vendorId}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!vendorId}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!vendorId}>
            <Plus className="w-4 h-4 mr-2" /> Record Expense
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses (filtered range)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
            <Receipt className="w-6 h-6" /> {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "recurring")}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <List className="w-4 h-4" /> All Expenses
          </TabsTrigger>
          <TabsTrigger value="recurring" className="gap-2">
            <Repeat className="w-4 h-4" /> Recurring
            {recurringTemplates.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{recurringTemplates.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── ALL EXPENSES TAB ── */}
        <TabsContent value="all">
          <Card>
            <div className="p-4 border-b flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <BranchWorkerFilterControl
                branches={branches} workers={workers}
                branchId={branchFilter} onBranchChange={setBranchFilter}
                workerId={workerFilter} onWorkerChange={setWorkerFilter}
              />
              <DateRangeFilterControl
                preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
                customFrom={dateFilter.customFrom} onCustomFromChange={dateFilter.setCustomFrom}
                customTo={dateFilter.customTo} onCustomToChange={dateFilter.setCustomTo}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Loading expenses...</TableCell></TableRow>
                ) : !expenses?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">No expenses recorded yet.</TableCell></TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(expense.expenseDate), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary">{expense.category}</Badge>
                          {expense.isRecurring && (
                            <Badge
                              variant="outline"
                              className={`gap-1 ${expense.recurringPaused ? "text-amber-600 border-amber-400" : "text-primary border-primary/40"}`}
                            >
                              <Repeat className="w-3 h-3" />
                              {frequencyLabel(expense.recurringFrequency)}
                              {expense.recurringPaused && " · Paused"}
                            </Badge>
                          )}
                          {!expense.isRecurring && expense.recurringParentId != null && (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Repeat className="w-3 h-3" /> Auto-generated
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{expense.description ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{branchName(expense.branchId)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{workerName(expense.workerId)}</TableCell>
                      <TableCell className="text-right font-medium">${expense.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {expense.isRecurring && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={expense.recurringPaused ? "Resume recurring" : "Pause recurring"}
                              onClick={() => handleTogglePause(expense.id, expense.recurringPaused)}
                            >
                              {expense.recurringPaused
                                ? <PlayCircle className="w-3.5 h-3.5 text-green-600" />
                                : <PauseCircle className="w-3.5 h-3.5 text-amber-500" />}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(expense)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(expense.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── RECURRING TAB ── */}
        <TabsContent value="recurring">
          {recurringTemplates.length > 0 && (
            <Card className="mb-4 border-primary/20 bg-primary/5">
              <CardContent className="flex items-center gap-4 py-4">
                <Repeat className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Projected monthly recurring cost</p>
                  <p className="text-2xl font-bold tracking-tight text-primary">
                    ${projectedMonthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Active templates only · Weekly ×4.33, Yearly ÷12
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <div className="p-4 border-b flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={recurringStatusFilter} onValueChange={(v) => setRecurringStatusFilter(v as "all" | "active" | "paused")}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select value={recurringFreqFilter} onValueChange={(v) => setRecurringFreqFilter(v as "all" | RecurringFrequency)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All frequencies</SelectItem>
                    {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground self-end pb-2">
                Sorted by next due date.
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingRecurring ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Loading recurring expenses...</TableCell></TableRow>
                ) : !recurringTemplates.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Repeat className="w-8 h-8 opacity-30" />
                        <p className="font-medium">No recurring expenses yet</p>
                        <p className="text-sm">Record an expense and check "Make this a recurring expense" to get started.</p>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => { setActiveTab("all"); setOpen(true); }}>
                          <Plus className="w-4 h-4 mr-2" /> Record Expense
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  recurringTemplates.map((expense) => {
                    const nextDate = expense.nextOccurrenceDate ? new Date(expense.nextOccurrenceDate) : null;
                    const isOverdue = nextDate ? isPast(nextDate) : false;
                    return (
                      <TableRow key={expense.id} className={expense.recurringPaused ? "opacity-60" : undefined}>
                        <TableCell>
                          <Badge variant="secondary">{expense.category}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{expense.description ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Repeat className="w-3.5 h-3.5 text-primary" />
                            <span className="text-sm font-medium">{frequencyLabel(expense.recurringFrequency)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {expense.recurringPaused ? (
                            <span className="text-sm text-muted-foreground italic">Paused</span>
                          ) : nextDate ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <CalendarClock className={`w-3.5 h-3.5 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                                <span className={`text-sm font-medium ${isOverdue ? "text-destructive" : ""}`}>
                                  {format(nextDate, "MMM d, yyyy")}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground pl-5">
                                {isOverdue
                                  ? `Overdue by ${formatDistanceToNow(nextDate)}`
                                  : `in ${formatDistanceToNow(nextDate)}`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">${expense.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          {expense.recurringPaused ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1">
                              <PauseCircle className="w-3 h-3" /> Paused
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-400 gap-1">
                              <PlayCircle className="w-3 h-3" /> Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title={expense.recurringPaused ? "Resume recurring" : "Pause recurring"}
                              onClick={() => handleTogglePause(expense.id, expense.recurringPaused)}
                            >
                              {expense.recurringPaused
                                ? <PlayCircle className="w-3.5 h-3.5 text-green-600" />
                                : <PauseCircle className="w-3.5 h-3.5 text-amber-500" />}
                            </Button>
                            <Button size="sm" variant="ghost" title="Edit template" onClick={() => openEditDialog(expense)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete template" onClick={() => handleDelete(expense.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CREATE DIALOG ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record an Expense</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreate(); }}>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Expense Date</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <BranchWorkerFormFields
                branches={branches} workers={workers}
                branchId={formBranchId} onBranchChange={setFormBranchId}
                workerId={formWorkerId} onWorkerChange={setFormWorkerId}
              />
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="create-recurring" checked={formIsRecurring} onCheckedChange={(c) => setFormIsRecurring(c === true)} />
                <Label htmlFor="create-recurring" className="cursor-pointer">Make this a recurring expense</Label>
              </div>
              {formIsRecurring && (
                <div className="space-y-1.5">
                  <Label>Repeats</Label>
                  <Select value={formFrequency} onValueChange={(v) => setFormFrequency(v as RecurringFrequency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">A new expense will be created automatically each period, starting from the expense date above.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createExpense.isPending || !amount}>
                {createExpense.isPending ? "Saving…" : "Record Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.isRecurring ? "Edit Recurring Template" : "Edit Expense"}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={e => { e.preventDefault(); handleSaveEdit(); }}>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expense Date</Label>
                  <Input type="date" value={editing.expenseDate} onChange={(e) => setEditing({ ...editing, expenseDate: e.target.value })} />
                </div>
                <BranchWorkerFormFields
                  branches={branches} workers={workers}
                  branchId={editing.branchId} onBranchChange={(v) => setEditing({ ...editing, branchId: v })}
                  workerId={editing.workerId} onWorkerChange={(v) => setEditing({ ...editing, workerId: v })}
                />
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox id="edit-recurring" checked={editing.isRecurring} onCheckedChange={(c) => setEditing({ ...editing, isRecurring: c === true })} />
                  <Label htmlFor="edit-recurring" className="cursor-pointer">Make this a recurring expense</Label>
                </div>
                {editing.isRecurring && (
                  <div className="space-y-1.5">
                    <Label>Repeats</Label>
                    <Select value={editing.recurringFrequency} onValueChange={(v) => setEditing({ ...editing, recurringFrequency: v as RecurringFrequency })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={updateExpense.isPending}>
                  {updateExpense.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        importUrl="/api/expenses/import"
        entityName="Expenses"
        columns={["Category", "Description", "Amount", "Date"]}
        requiredColumns={["Amount", "Category"]}
        extraFields={vendorId ? { vendorId: String(vendorId) } : {}}
        onSuccess={() => qc.invalidateQueries({ queryKey: getListExpensesQueryKey({}) })}
      />
    </div>
  );
}
