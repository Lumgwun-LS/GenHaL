import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvestments,
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  useListBranches,
  useListWorkers,
  getListInvestmentsQueryKey,
  getListBranchesQueryKey,
  getListWorkersQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PiggyBank, Plus, Download, Upload, Pencil, Trash2 } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilterControl, BranchWorkerFilterControl, BranchWorkerFormFields } from "@/components/finance-filters";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const TYPES = [
  { value: "owner_capital", label: "Owner Capital" },
  { value: "loan", label: "Loan" },
  { value: "equity", label: "Equity" },
  { value: "external_asset", label: "External Asset" },
];
const STATUSES = ["active", "closed"];

export default function InvestmentsPage() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const listParams = {
    vendorId: vendorId as number,
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(branchFilter !== "all" ? { branchId: Number(branchFilter) } : {}),
    ...(workerFilter !== "all" ? { workerId: Number(workerFilter) } : {}),
  };
  const { data: investmentsRaw, isLoading } = useListInvestments(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListInvestmentsQueryKey(listParams) },
  });

  // Investments list endpoint has no from/to filter server-side; apply the date-range preset client-side.
  const investments = investmentsRaw?.filter((inv) => {
    if (!dateFilter.from && !dateFilter.to) return true;
    const d = new Date(inv.investmentDate).getTime();
    if (dateFilter.from && d < new Date(dateFilter.from).getTime()) return false;
    if (dateFilter.to && d > new Date(dateFilter.to).getTime()) return false;
    return true;
  });

  const createInvestment = useCreateInvestment();
  const updateInvestment = useUpdateInvestment();
  const deleteInvestment = useDeleteInvestment();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [formType, setFormType] = useState(TYPES[0]!.value);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [investmentDate, setInvestmentDate] = useState("");
  const [formBranchId, setFormBranchId] = useState("none");
  const [formWorkerId, setFormWorkerId] = useState("none");

  const [editing, setEditing] = useState<{ id: number; type: string; name: string; notes: string; amount: number; currentValue: number | null; status: string; investmentDate: string; branchId: string; workerId: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListInvestmentsQueryKey(listParams) });
  }

  async function handleCreate() {
    if (!vendorId || !name || !amount) return;
    try {
      await createInvestment.mutateAsync({
        data: {
          vendorId,
          type: formType,
          name,
          notes: notes || undefined,
          amount: parseFloat(amount),
          currentValue: currentValue ? parseFloat(currentValue) : undefined,
          investmentDate: investmentDate ? new Date(investmentDate).toISOString() : undefined,
          branchId: formBranchId !== "none" ? Number(formBranchId) : undefined,
          workerId: formWorkerId !== "none" ? Number(formWorkerId) : undefined,
        },
      });
      toast.success("Investment recorded");
      setOpen(false);
      setName(""); setNotes(""); setAmount(""); setCurrentValue(""); setInvestmentDate(""); setFormBranchId("none"); setFormWorkerId("none");
      invalidate();
    } catch {
      toast.error("Failed to record investment");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateInvestment.mutateAsync({
        id: editing.id,
        data: {
          type: editing.type,
          name: editing.name,
          notes: editing.notes || undefined,
          amount: editing.amount,
          currentValue: editing.currentValue ?? undefined,
          status: editing.status,
          investmentDate: editing.investmentDate ? new Date(editing.investmentDate).toISOString() : undefined,
          branchId: editing.branchId !== "none" ? Number(editing.branchId) : null,
          workerId: editing.workerId !== "none" ? Number(editing.workerId) : null,
        },
      });
      toast.success("Investment updated");
      setEditing(null);
      invalidate();
    } catch {
      toast.error("Failed to update investment");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteInvestment.mutateAsync({ id });
      toast.success("Investment deleted");
      invalidate();
    } catch {
      toast.error("Failed to delete investment");
    }
  }

  async function handleExport() {
    if (!vendorId) return;
    const params = new URLSearchParams({ vendorId: String(vendorId) });
    if (branchFilter !== "all") params.set("branchId", branchFilter);
    if (workerFilter !== "all") params.set("workerId", workerFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    try {
      const res = await fetch(`${BASE_URL}/api/investments/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `investments-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Export failed");
    }
  }

  const totalInvested = investments?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalCurrentValue = investments?.reduce((s, r) => s + (r.currentValue ?? r.amount), 0) ?? 0;
  const overallRoi = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;

  function typeLabel(t: string) {
    return TYPES.find((x) => x.value === t)?.label ?? t;
  }
  function branchName(id: number | null | undefined) {
    if (!id) return "—";
    return branches?.find((b) => b.id === id)?.name ?? "—";
  }
  function workerName(id: number | null | undefined) {
    if (!id) return "—";
    return workers?.find((w) => w.id === id)?.name ?? "—";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investments</h1>
          <p className="text-muted-foreground">Owner capital, loans, equity, and external assets.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!vendorId}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!vendorId}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!vendorId}>
            <Plus className="w-4 h-4 mr-2" /> Record Investment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overall ROI</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center gap-2 ${overallRoi >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              <PiggyBank className="w-5 h-5" /> {overallRoi.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invested</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
              <TableHead className="text-right">ROI</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8">Loading investments...</TableCell></TableRow>
            ) : !investments?.length ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8">No investments recorded yet.</TableCell></TableRow>
            ) : (
              investments.map((inv) => {
                const cv = inv.currentValue ?? inv.amount;
                const roi = inv.amount > 0 ? ((cv - inv.amount) / inv.amount) * 100 : 0;
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.investmentDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{inv.name}</TableCell>
                    <TableCell><Badge variant="secondary">{typeLabel(inv.type)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{branchName(inv.branchId)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{workerName(inv.workerId)}</TableCell>
                    <TableCell><Badge variant={inv.status === "active" ? "outline" : "secondary"}>{inv.status}</Badge></TableCell>
                    <TableCell className="text-right">${inv.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${cv.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-medium ${roi >= 0 ? "text-emerald-500" : "text-destructive"}`}>{roi.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: inv.id, type: inv.type, name: inv.name, notes: inv.notes ?? "", amount: inv.amount, currentValue: inv.currentValue ?? null, status: inv.status, investmentDate: inv.investmentDate.slice(0, 10), branchId: inv.branchId ? String(inv.branchId) : "none", workerId: inv.workerId ? String(inv.workerId) : "none" })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(inv.id)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record an Investment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founder capital injection" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount Invested</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Current Value</Label>
                <Input type="number" step="0.01" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={investmentDate} onChange={(e) => setInvestmentDate(e.target.value)} />
            </div>
            <BranchWorkerFormFields
              branches={branches} workers={workers}
              branchId={formBranchId} onBranchChange={setFormBranchId}
              workerId={formWorkerId} onWorkerChange={setFormWorkerId}
            />
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createInvestment.isPending || !name || !amount}>
              {createInvestment.isPending ? "Saving…" : "Record Investment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Investment</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount Invested</Label>
                  <Input type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Current Value</Label>
                  <Input type="number" step="0.01" value={editing.currentValue ?? ""} onChange={(e) => setEditing({ ...editing, currentValue: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={editing.investmentDate} onChange={(e) => setEditing({ ...editing, investmentDate: e.target.value })} />
              </div>
              <BranchWorkerFormFields
                branches={branches} workers={workers}
                branchId={editing.branchId} onBranchChange={(v) => setEditing({ ...editing, branchId: v })}
                workerId={editing.workerId} onWorkerChange={(v) => setEditing({ ...editing, workerId: v })}
              />
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateInvestment.isPending}>
              {updateInvestment.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        importUrl="/api/investments/import"
        entityName="Investments"
        columns={["Name", "Type", "Amount", "Date", "Current Value", "Status", "Notes"]}
        requiredColumns={["Name", "Amount"]}
        extraFields={vendorId ? { vendorId: String(vendorId) } : {}}
        onSuccess={() => qc.invalidateQueries({ queryKey: getListInvestmentsQueryKey({}) })}
      />
    </div>
  );
}
