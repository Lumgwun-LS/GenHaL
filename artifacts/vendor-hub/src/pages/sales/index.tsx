import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendors,
  useListSales,
  useCreateSale,
  useUpdateSale,
  useDeleteSale,
  getListSalesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, Plus, Download, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function SalesPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listParams = {
    vendorId: vendorId as number,
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
  };
  const { data: sales, isLoading } = useListSales(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListSalesQueryKey(listParams) },
  });

  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [saleDate, setSaleDate] = useState("");

  const [editing, setEditing] = useState<{ id: number; description: string; customerName: string; amount: number; saleDate: string } | null>(null);

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
        },
      });
      toast.success("Sale recorded");
      setOpen(false);
      setDescription(""); setCustomerName(""); setAmount(""); setSaleDate("");
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
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
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
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading sales...</TableCell></TableRow>
            ) : !sales?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">No sales recorded yet.</TableCell></TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(sale.saleDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{sale.description ?? "—"}</TableCell>
                  <TableCell>{sale.customerName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={sale.source === "manual" ? "secondary" : "outline"}>
                      {sale.source === "manual" ? "Manual" : "Auto (payment)"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">${sale.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {sale.source === "manual" ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: sale.id, description: sale.description ?? "", customerName: sale.customerName ?? "", amount: sale.amount, saleDate: sale.saleDate.slice(0, 10) })}>
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
    </div>
  );
}
