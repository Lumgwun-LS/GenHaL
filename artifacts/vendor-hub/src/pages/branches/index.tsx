import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendors,
  useListBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  getListBranchesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["active", "inactive"];

export default function BranchesPage() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const [adminVendorId, setAdminVendorId] = useState<number | undefined>(undefined);
  const vendorId = myVendor?.id ?? adminVendorId;
  const qc = useQueryClient();

  const listParams = { vendorId: vendorId as number };
  const { data: branches, isLoading } = useListBranches(listParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListBranchesQueryKey(listParams) },
  });

  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");

  const [editing, setEditing] = useState<{ id: number; name: string; address: string; city: string; state: string; country: string; status: string } | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListBranchesQueryKey(listParams) });
  }

  function resetForm() {
    setName(""); setAddress(""); setCity(""); setState(""); setCountry("");
  }

  async function handleCreate() {
    if (!vendorId || !name) return;
    try {
      await createBranch.mutateAsync({
        data: { vendorId, name, address: address || undefined, city: city || undefined, state: state || undefined, country: country || undefined },
      });
      toast.success("Branch created");
      setOpen(false);
      resetForm();
      invalidate();
    } catch {
      toast.error("Failed to create branch");
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateBranch.mutateAsync({
        id: editing.id,
        data: {
          name: editing.name,
          address: editing.address || undefined,
          city: editing.city || undefined,
          state: editing.state || undefined,
          country: editing.country || undefined,
          status: editing.status,
        },
      });
      toast.success("Branch updated");
      setEditing(null);
      invalidate();
    } catch {
      toast.error("Failed to update branch");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteBranch.mutateAsync({ id });
      toast.success("Branch deleted");
      invalidate();
    } catch {
      toast.error("Failed to delete branch");
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
          <p className="text-muted-foreground">Physical locations your organization operates out of.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!vendorId}>
          <Plus className="w-4 h-4 mr-2" /> Add Branch
        </Button>
      </div>

      {!myVendor && vendors && vendors.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 shrink-0">Admin mode — operating as:</span>
          <Select value={adminVendorId ? String(adminVendorId) : ""} onValueChange={(v) => setAdminVendorId(Number(v))}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
            <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Loading branches...</TableCell></TableRow>
            ) : !branches?.length ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">No branches yet.</TableCell></TableRow>
            ) : (
              branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {b.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[b.address, b.city, b.state, b.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell><Badge variant={b.status === "active" ? "outline" : "secondary"}>{b.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: b.id, name: b.name, address: b.address ?? "", city: b.city ?? "", state: b.state ?? "", country: b.country ?? "", status: b.status })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}>
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
          <DialogHeader><DialogTitle>Add a Branch</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lagos Warehouse" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createBranch.isPending || !name}>
              {createBranch.isPending ? "Saving…" : "Add Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Branch</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Input value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} />
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateBranch.isPending}>
              {updateBranch.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
