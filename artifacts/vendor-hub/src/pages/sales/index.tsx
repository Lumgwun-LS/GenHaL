import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendors,
  useListSales,
  useCreateSale,
  useUpdateSale,
  useDeleteSale,
  useListBranches,
  useListWorkers,
  getListSalesQueryKey,
  getListBranchesQueryKey,
  getListWorkersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, Plus, Download, Upload, Pencil, Trash2, Lock } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilterControl, BranchWorkerFilterControl, BranchWorkerFormFields } from "@/components/finance-filters";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function SalesPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

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
    ...(branchFilter !== "all" ? { branchId: Number(branchFilter) } : {}),
    ...(workerFilter !== "all" ? { workerId: Number(workerFilter) } : {}),
    ...(dateFilter.from ? { from: dateFilter.from } : {}),
    ...(dateFilter.to ? { to: dateFilter.to } : {}),
  };
  const { data: sales, isLoading } = useListSales(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListSalesQueryKey(listParams) },
  });

  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [formBranchId, setFormBranchId] = useState("none");
  const [formWorkerId, setFormWorkerId] = useState("none");

  const [editing, setEditing] = useState<{ id: number; description: string; customerName: string; amount: number; saleDate: string; branchId: string; workerId: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListSalesQueryKey(listParams) });
  }

  async function handleCreate() {
    if (!vendorId || !amount) return;
    try {
      await createSale.mutateAsync({
        data: {
          vendorId,
          description: description || undefined,
          customerName: customerName || undefined,
          amount: parseFloat(amount),
          saleDate: saleDate ? new Date(saleDate).toISOString() : undefined,
          branchId: formBranchId !== "none" ? Number(formBranchId) : undefined,
          workerId: formWorkerId !== "none" ? Number(formWorkerId) : undefined,
        },
      });
      toast.success("Sale recorded");
      setOpen(false);
      setDescription(""); setCustomerName(""); setAmount(""); setSaleDate(""); setFormBranchId("none"); setFormWorkerId("none");
      invalidate();
    } catch {
      toast.error("Failed to record sale");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateSale.mutateAsync({
        id: editing.id,
        data: {
          description: editing.description || undefined,
          customerName: editing.customerName || undefined,
          amount: editing.amount,
          saleDate: editing.saleDate ? new Date(editing.saleDate).toISOString() : undefined,
          branchId: editing.branchId !== "none" ? Number(editing.branchId) : null,
          workerId: editing.workerId !== "none" ? Number(editing.workerId) : null,
        },
      });
      toast.success("Sale updated");
      setEditing(null);
      invalidate();
    } catch {
      toast.error("Failed to update sale");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSale.mutateAsync({ id });
      toast.success("Sale deleted");
      invalidate();
    } catch {
      toast.error("Failed to delete sale");
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
      const res = await fetch(`${BASE_URL}/api/sales/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Export failed");
    }
  }

  const totalRevenue = sales?.reduce((s, r) => s + r.amount, 0) ?? 0;

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
          <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
          <p className="text-muted-foreground">Manual entries plus sales auto-synced from paid orders.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!vendorId}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!vendorId}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!vendorId}>
            <Plus className="w-4 h-4 mr-2" /> Record Sale
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue (filtered range)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tracking-tight text-emerald-500 flex items-center gap-2">
            <DollarSign className="w-6 h-6" /> {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b flex flex-wrap gap-3 items-end">
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
              <TableHead>Description</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Loading sales...</TableCell></TableRow>
            ) : !sales?.length ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">No sales recorded yet.</TableCell></TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(sale.saleDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{sale.description ?? "—"}</TableCell>
                  <TableCell>{sale.customerName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{branchName(sale.branchId)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{workerName(sale.workerId)}</TableCell>
                  <TableCell>
                    <Badge variant={sale.source === "manual" ? "secondary" : "outline"}>
                      {sale.source === "manual" ? "Manual" : "Auto (payment)"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">${sale.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {sale.source === "manual" ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: sale.id, description: sale.description ?? "", customerName: sale.customerName ?? "", amount: sale.amount, saleDate: sale.saleDate.slice(0, 10), branchId: sale.branchId ? String(sale.branchId) : "none", workerId: sale.workerId ? String(sale.workerId) : "none" })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(sale.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground ml-auto" aria-label="Auto-synced from a payment; read only" />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record a Sale</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Custom order" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Sale Date</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <BranchWorkerFormFields
              branches={branches} workers={workers}
              branchId={formBranchId} onBranchChange={setFormBranchId}
              workerId={formWorkerId} onWorkerChange={setFormWorkerId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSale.isPending || !amount}>
              {createSale.isPending ? "Saving…" : "Record Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input value={editing.customerName} onChange={(e) => setEditing({ ...editing, customerName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sale Date</Label>
                <Input type="date" value={editing.saleDate} onChange={(e) => setEditing({ ...editing, saleDate: e.target.value })} />
              </div>
              <BranchWorkerFormFields
                branches={branches} workers={workers}
                branchId={editing.branchId} onBranchChange={(v) => setEditing({ ...editing, branchId: v })}
                workerId={editing.workerId} onWorkerChange={(v) => setEditing({ ...editing, workerId: v })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateSale.isPending}>
              {updateSale.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        importUrl="/api/sales/import"
        entityName="Sales"
        columns={["Description", "Customer", "Amount", "Date", "Currency"]}
        requiredColumns={["Amount"]}
        extraFields={vendorId ? { vendorId: String(vendorId) } : {}}
        onSuccess={() => qc.invalidateQueries({ queryKey: getListSalesQueryKey({}) })}
      />
    </div>
  );
}
