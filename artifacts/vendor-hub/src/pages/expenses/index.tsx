import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendors,
  useListExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Plus, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CATEGORIES = ["Inventory", "Marketing", "Utilities", "Rent", "Payroll", "Shipping", "Software", "Fees", "Travel", "Other"];

export default function ExpensesPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<string>("all");

  const listParams = {
    vendorId: vendorId as number,
    ...(category !== "all" ? { category } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
  };
  const { data: expenses, isLoading } = useListExpenses(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListExpensesQueryKey(listParams) },
  });

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [open, setOpen] = useState(false);
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]!);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");

  const [editing, setEditing] = useState<{ id: number; category: string; description: string; amount: number; expenseDate: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey(listParams) });
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
        },
      });
      toast.success("Expense recorded");
      setOpen(false);
      setDescription(""); setAmount(""); setExpenseDate("");
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

  async function handleExport() {
    if (!vendorId) return;
    const params = new URLSearchParams({ vendorId: String(vendorId) });
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
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
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading expenses...</TableCell></TableRow>
            ) : !expenses?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No expenses recorded yet.</TableCell></TableRow>
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(expense.expenseDate), "MMM d, yyyy")}</TableCell>
                  <TableCell><Badge variant="secondary">{expense.category}</Badge></TableCell>
                  <TableCell>{expense.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">${expense.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: expense.id, category: expense.category, description: expense.description ?? "", amount: expense.amount, expenseDate: expense.expenseDate.slice(0, 10) })}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record an Expense</DialogTitle></DialogHeader>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createExpense.isPending || !amount}>
              {createExpense.isPending ? "Saving…" : "Record Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          {editing && (
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
