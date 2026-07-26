import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLeads,
  useGetLeadsStats,
  useCreateLead,
  useListVendors,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Download, Upload, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/csv-import-dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"];
const SOURCES = ["manual", "web_scrape", "linkedin", "google_maps", "referral", "other"];

export default function Leads() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find(v => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const { data: leads, isLoading } = useListLeads({ search });
  const { data: stats } = useGetLeadsStats();
  const createLead = useCreateLead();

  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState("new");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setName(""); setEmail(""); setPhone(""); setCompany(""); setIndustry(""); setStatus("new"); setSource("manual"); setNotes("");
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListLeadsQueryKey({}) });
  }

  async function handleExport() {
    const params = new URLSearchParams();
    if (vendorId) params.set("vendorId", String(vendorId));
    try {
      const res = await fetch(`${BASE_URL}/api/leads/export?${params}`, { credentials: "include" });
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  }

  async function handleCreate() {
    if (!vendorId || !name) return;
    try {
      await createLead.mutateAsync({
        data: {
          vendorId,
          name,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(company ? { company } : {}),
          ...(industry ? { industry } : {}),
          ...(source ? { source } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      toast.success("Lead added");
      setAddOpen(false);
      resetForm();
      invalidate();
    } catch { toast.error("Failed to add lead"); }
  }

  const getStatusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "converted": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "qualified":  return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "new":        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "contacted":  return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "lost":       return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground">Manage and track your potential customers.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={!vendorId}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!vendorId}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} disabled={!vendorId}>
            <Plus className="w-4 h-4 mr-2" /> Add Lead
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold tracking-tight">{stats?.totalLeads || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-500">New</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold tracking-tight">{stats?.newLeads || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-purple-500">Qualified</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold tracking-tight">{stats?.qualifiedLeads || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-500">Converted</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold tracking-tight">{stats?.convertedLeads || 0}</div></CardContent></Card>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input placeholder="Search leads by name, email, or company..." className="pl-9 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading leads...</TableCell></TableRow>
            ) : leads?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No leads found.</TableCell></TableRow>
            ) : (
              leads?.map(lead => (
                <TableRow key={lead.id} className="cursor-pointer">
                  <TableCell><div className="font-medium">{lead.name}</div><div className="text-xs text-muted-foreground">{lead.email}</div></TableCell>
                  <TableCell><div className="text-sm">{lead.company || "—"}</div><div className="text-xs text-muted-foreground">{lead.industry}</div></TableCell>
                  <TableCell><Badge variant="outline" className={getStatusColor(lead.status)}>{lead.status}</Badge></TableCell>
                  <TableCell className="text-sm">{lead.source || "Manual"}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{format(new Date(lead.createdAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Lead Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); setAddOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a Lead</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emeka Johnson" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Company</Label><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label>Industry</Label><Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Retail" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending || !name}>
              {createLead.isPending ? "Saving…" : "Add Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import */}
      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        importUrl="/api/leads/import"
        entityName="Leads"
        columns={["Name", "Email", "Phone", "Company", "Industry", "Status", "Source", "Notes"]}
        requiredColumns={["Name"]}
        onSuccess={() => invalidate()}
      />
    </div>
  );
}
