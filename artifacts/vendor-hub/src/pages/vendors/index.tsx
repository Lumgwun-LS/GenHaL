import { useState } from "react";
import { useListVendors, useCreateVendor, getListVendorsQueryKey, useGetVendorStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Building2, Store } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const INDUSTRIES = ["Retail", "Food & Beverage", "Technology", "Healthcare", "Education", "Fashion", "Agriculture", "Logistics", "Finance", "Real Estate", "Entertainment", "Other"];

export default function Vendors() {
  const [search, setSearch] = useState("");
  const { data: vendors, isLoading } = useListVendors({ search });
  const { data: stats } = useGetVendorStats();
  const createVendor = useCreateVendor();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("Retail");
  const [plan, setPlan] = useState("free");

  function resetForm() {
    setName(""); setEmail(""); setPhone(""); setIndustry("Retail"); setPlan("free");
  }

  async function handleCreate() {
    if (!name || !email) return;
    try {
      await createVendor.mutateAsync({
        data: {
          name,
          email,
          industry,
          ...(phone ? { phone } : {}),
        },
      });
      toast.success("Vendor created");
      setAddOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: getListVendorsQueryKey({}) });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create vendor");
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">Manage companies, agencies, and partners.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Vendor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalVendors || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Vendors</CardTitle>
            <Store className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.activeVendors || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Signups</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.recentSignups || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input placeholder="Search vendors..." className="pl-9 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading vendors...</TableCell></TableRow>
            ) : vendors?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No vendors found.</TableCell></TableRow>
            ) : (
              vendors?.map(vendor => (
                <TableRow key={vendor.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/vendors/${vendor.id}`} className="font-medium hover:underline">{vendor.name}</Link>
                  </TableCell>
                  <TableCell>{vendor.industry}</TableCell>
                  <TableCell><Badge variant={vendor.status === "active" ? "default" : "secondary"}>{vendor.status}</Badge></TableCell>
                  <TableCell><div className="text-sm">{vendor.email}</div><div className="text-xs text-muted-foreground">{vendor.phone}</div></TableCell>
                  <TableCell className="text-right text-muted-foreground">{new Date(vendor.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Vendor Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); setAddOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a Vendor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Business Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ade's Electronics" /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@business.com" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createVendor.isPending || !name || !email}>
              {createVendor.isPending ? "Creating…" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
