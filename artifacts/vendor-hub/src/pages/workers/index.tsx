import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBranches,
  useListWorkers,
  useCreateWorker,
  useUpdateWorker,
  useDeleteWorker,
  getListWorkersQueryKey,
  getListBranchesQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["active", "inactive", "suspended"];

export default function WorkersPage() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const branchListParams = { vendorId: vendorId as number };
  const { data: branches } = useListBranches(branchListParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListBranchesQueryKey(branchListParams) },
  });

  const listParams = { vendorId: vendorId as number };
  const { data: workers, isLoading } = useListWorkers(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListWorkersQueryKey(listParams) },
  });

  const createWorker = useCreateWorker();
  const updateWorker = useUpdateWorker();
  const deleteWorker = useDeleteWorker();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [branchId, setBranchId] = useState("none");

  const [editing, setEditing] = useState<{ id: number; name: string; email: string; phone: string; role: string; branchId: string; status: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListWorkersQueryKey(listParams) });
  }

  function resetForm() {
    setName(""); setEmail(""); setPhone(""); setRole(""); setBranchId("none");
  }

  function branchName(id: number | null | undefined) {
    if (!id) return "—";
    return branches?.find((b) => b.id === id)?.name ?? "—";
  }

  async function handleCreate() {
    if (!vendorId || !name) return;
    try {
      await createWorker.mutateAsync({
        data: {
          vendorId,
          name,
          email: email || undefined,
          phone: phone || undefined,
          role: role || undefined,
          branchId: branchId !== "none" ? Number(branchId) : undefined,
        },
      });
      toast.success("Worker added");
      setOpen(false);
      resetForm();
      invalidate();
    } catch {
      toast.error("Failed to add worker");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateWorker.mutateAsync({
        id: editing.id,
        data: {
          name: editing.name,
          email: editing.email || undefined,
          phone: editing.phone || undefined,
          role: editing.role || undefined,
          status: editing.status,
          branchId: editing.branchId !== "none" ? Number(editing.branchId) : null,
        },
      });
      toast.success("Worker updated");
      setEditing(null);
      invalidate();
    } catch {
      toast.error("Failed to update worker");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteWorker.mutateAsync({ id });
      toast.success("Worker removed");
      invalidate();
    } catch {
      toast.error("Failed to remove worker");
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workers</h1>
          <p className="text-muted-foreground">Staff members across your organization's branches.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!vendorId}>
          <Plus className="w-4 h-4 mr-2" /> Add Worker
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading workers...</TableCell></TableRow>
            ) : !workers?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">No workers yet.</TableCell></TableRow>
            ) : (
              workers.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> {w.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {w.email ?? "—"}{w.phone ? ` · ${w.phone}` : ""}
                  </TableCell>
                  <TableCell>{w.role ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{branchName(w.branchId)}</TableCell>
                  <TableCell><Badge variant={w.status === "active" ? "outline" : "secondary"}>{w.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: w.id, name: w.name, email: w.email ?? "", phone: w.phone ?? "", role: w.role ?? "", branchId: w.branchId ? String(w.branchId) : "none", status: w.status })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(w.id)}>
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
          <DialogHeader><DialogTitle>Add a Worker</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amaka Okafor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Cashier, Sales Rep" />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createWorker.isPending || !name}>
              {createWorker.isPending ? "Saving…" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Worker</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={editing.branchId} onValueChange={(v) => setEditing({ ...editing, branchId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateWorker.isPending}>
              {updateWorker.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
