import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Building2, Users, CalendarCheck, FileText, BarChart3,
  Plus, Pencil, Trash2, Eye, ExternalLink, Home, Briefcase,
  MapPin, BedDouble, Bath, Maximize2, TrendingUp
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = ["residential", "commercial", "land", "shortlet"];
const LISTING_TYPES = ["sale", "rent", "both"];
const PROPERTY_STATUSES = ["available", "under_offer", "sold", "rented"];
const CLIENT_TYPES = ["buyer", "seller", "tenant", "landlord"];
const VIEWING_STATUSES = ["scheduled", "completed", "cancelled", "no_show"];
const CONTRACT_TYPES = ["sale_agreement", "lease", "offer_letter", "other"];
const CONTRACT_STATUSES = ["draft", "signed", "expired", "cancelled"];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  under_offer: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  sold: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  rented: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  scheduled: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
  no_show: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  draft: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  signed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  expired: "bg-red-500/15 text-red-400 border-red-500/20",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmt(n: string | null | undefined) {
  if (!n) return "—";
  const num = parseFloat(n);
  return isNaN(num) ? n : num.toLocaleString();
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── API fetch helpers ───────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Property form ───────────────────────────────────────────────────────────

function PropertyDialog({
  open, onOpenChange, vendorId, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; vendorId: number;
  initial?: Record<string, unknown>; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    title: (initial?.title as string) ?? "",
    description: (initial?.description as string) ?? "",
    propertyType: (initial?.propertyType as string) ?? "residential",
    listingType: (initial?.listingType as string) ?? "sale",
    status: (initial?.status as string) ?? "available",
    price: (initial?.price as string) ?? "",
    rentPrice: (initial?.rentPrice as string) ?? "",
    rentPeriod: (initial?.rentPeriod as string) ?? "monthly",
    bedrooms: String(initial?.bedrooms ?? ""),
    bathrooms: String(initial?.bathrooms ?? ""),
    area: (initial?.area as string) ?? "",
    areaUnit: (initial?.areaUnit as string) ?? "sqm",
    address: (initial?.address as string) ?? "",
    city: (initial?.city as string) ?? "",
    state: (initial?.state as string) ?? "",
    country: (initial?.country as string) ?? "",
    features: Array.isArray(initial?.features) ? (initial.features as string[]).join(", ") : "",
    images: Array.isArray(initial?.images) ? (initial.images as string[]).join(", ") : "",
  });

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: Record<string, string>) =>
      initial
        ? apiFetch(`/real-estate/properties/${initial.id}`, { method: "PATCH", body: JSON.stringify(data) })
        : apiFetch("/real-estate/properties", { method: "POST", body: JSON.stringify({ ...data, vendorId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["re-properties", vendorId] });
      toast.success(initial ? "Property updated" : "Property added");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit Property" : "Add Property"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. 3-Bedroom Apartment, Lekki" />
          </div>
          <div>
            <Label>Property Type *</Label>
            <Select value={form.propertyType} onValueChange={(v) => set("propertyType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Listing Type *</Label>
            <Select value={form.listingType} onValueChange={(v) => set("listingType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LISTING_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROPERTY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sale Price (₦)</Label>
            <Input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. 45000000" />
          </div>
          <div>
            <Label>Rent Price (₦)</Label>
            <Input value={form.rentPrice} onChange={(e) => set("rentPrice", e.target.value)} placeholder="e.g. 1500000" />
          </div>
          <div>
            <Label>Rent Period</Label>
            <Select value={form.rentPeriod} onValueChange={(v) => set("rentPeriod", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bedrooms</Label>
            <Input type="number" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} placeholder="e.g. 3" />
          </div>
          <div>
            <Label>Bathrooms</Label>
            <Input type="number" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} placeholder="e.g. 2" />
          </div>
          <div>
            <Label>Area</Label>
            <Input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. 120" />
          </div>
          <div>
            <Label>Area Unit</Label>
            <Select value={form.areaUnit} onValueChange={(v) => set("areaUnit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sqm">sqm</SelectItem><SelectItem value="sqft">sqft</SelectItem><SelectItem value="plots">plots</SelectItem><SelectItem value="hectares">hectares</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Lagos" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="e.g. Lagos State" />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="e.g. Nigeria" />
          </div>
          <div className="col-span-2">
            <Label>Features (comma-separated)</Label>
            <Input value={form.features} onChange={(e) => set("features", e.target.value)} placeholder="e.g. Swimming pool, Generator, Security, Parking" />
          </div>
          <div className="col-span-2">
            <Label>Image URLs (comma-separated)</Label>
            <Textarea value={form.images} onChange={(e) => set("images", e.target.value)} placeholder="https://... , https://..." rows={2} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the property..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.title}>
            {save.isPending ? "Saving..." : initial ? "Update" : "Add Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Client form ─────────────────────────────────────────────────────────────

function ClientDialog({
  open, onOpenChange, vendorId, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; vendorId: number;
  initial?: Record<string, unknown>; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: (initial?.name as string) ?? "",
    email: (initial?.email as string) ?? "",
    phone: (initial?.phone as string) ?? "",
    clientType: (initial?.clientType as string) ?? "buyer",
    budget: (initial?.budget as string) ?? "",
    preferredAreas: (initial?.preferredAreas as string) ?? "",
    notes: (initial?.notes as string) ?? "",
    status: (initial?.status as string) ?? "active",
  });
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: typeof form) =>
      initial
        ? apiFetch(`/real-estate/clients/${initial.id}`, { method: "PATCH", body: JSON.stringify(data) })
        : apiFetch("/real-estate/clients", { method: "POST", body: JSON.stringify({ ...data, vendorId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["re-clients", vendorId] });
      toast.success(initial ? "Client updated" : "Client added");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Client" : "Add Client"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div>
            <Label>Client Type</Label>
            <Select value={form.clientType} onValueChange={(v) => set("clientType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Budget (₦)</Label><Input value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 25000000" /></div>
          <div className="col-span-2"><Label>Preferred Areas</Label><Input value={form.preferredAreas} onChange={(e) => set("preferredAreas", e.target.value)} placeholder="e.g. Lekki, Victoria Island" /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.name}>
            {save.isPending ? "Saving..." : initial ? "Update" : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Viewing form ─────────────────────────────────────────────────────────────

function ViewingDialog({
  open, onOpenChange, vendorId, properties, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; vendorId: number;
  properties: Record<string, unknown>[]; initial?: Record<string, unknown>; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: String(initial?.propertyId ?? ""),
    clientName: (initial?.clientName as string) ?? "",
    clientEmail: (initial?.clientEmail as string) ?? "",
    clientPhone: (initial?.clientPhone as string) ?? "",
    scheduledAt: initial?.scheduledAt ? (initial.scheduledAt as string).slice(0, 16) : "",
    status: (initial?.status as string) ?? "scheduled",
    notes: (initial?.notes as string) ?? "",
  });
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = { ...data, propertyId: data.propertyId ? parseInt(data.propertyId) : null };
      return initial
        ? apiFetch(`/real-estate/viewings/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/real-estate/viewings", { method: "POST", body: JSON.stringify({ ...payload, vendorId }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["re-viewings", vendorId] });
      toast.success(initial ? "Viewing updated" : "Viewing scheduled");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Viewing" : "Schedule Viewing"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <Label>Property</Label>
            <Select value={form.propertyId} onValueChange={(v) => set("propertyId", v)}>
              <SelectTrigger><SelectValue placeholder="Select property (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {properties.map((p) => <SelectItem key={String(p.id)} value={String(p.id)}>{p.title as string}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Client Name *</Label><Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} /></div>
          <div><Label>Client Email</Label><Input value={form.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} /></div>
          <div><Label>Client Phone</Label><Input value={form.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} /></div>
          <div className="col-span-2"><Label>Scheduled At *</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} /></div>
          <div className="col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VIEWING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.clientName || !form.scheduledAt}>
            {save.isPending ? "Saving..." : initial ? "Update" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contract form ────────────────────────────────────────────────────────────

function ContractDialog({
  open, onOpenChange, vendorId, properties, clients, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; vendorId: number;
  properties: Record<string, unknown>[]; clients: Record<string, unknown>[];
  initial?: Record<string, unknown>; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: String(initial?.propertyId ?? ""),
    clientId: String(initial?.clientId ?? ""),
    contractType: (initial?.contractType as string) ?? "lease",
    documentName: (initial?.documentName as string) ?? "",
    documentUrl: (initial?.documentUrl as string) ?? "",
    status: (initial?.status as string) ?? "draft",
    validFrom: initial?.validFrom ? (initial.validFrom as string).slice(0, 10) : "",
    validUntil: initial?.validUntil ? (initial.validUntil as string).slice(0, 10) : "",
    notes: (initial?.notes as string) ?? "",
  });
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        propertyId: data.propertyId ? parseInt(data.propertyId) : null,
        clientId: data.clientId ? parseInt(data.clientId) : null,
      };
      return initial
        ? apiFetch(`/real-estate/contracts/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/real-estate/contracts", { method: "POST", body: JSON.stringify({ ...payload, vendorId }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["re-contracts", vendorId] });
      toast.success(initial ? "Contract updated" : "Contract added");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Contract" : "Add Contract"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <Label>Property</Label>
            <Select value={form.propertyId} onValueChange={(v) => set("propertyId", v)}>
              <SelectTrigger><SelectValue placeholder="Select property (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {properties.map((p) => <SelectItem key={String(p.id)} value={String(p.id)}>{p.title as string}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Client</Label>
            <Select value={form.clientId} onValueChange={(v) => set("clientId", v)}>
              <SelectTrigger><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {clients.map((c) => <SelectItem key={String(c.id)} value={String(c.id)}>{c.name as string}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Contract Type *</Label>
            <Select value={form.contractType} onValueChange={(v) => set("contractType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Document Name</Label><Input value={form.documentName} onChange={(e) => set("documentName", e.target.value)} placeholder="e.g. Lease Agreement - Lekki Apartment" /></div>
          <div className="col-span-2"><Label>Document URL</Label><Input value={form.documentUrl} onChange={(e) => set("documentUrl", e.target.value)} placeholder="https://drive.google.com/..." /></div>
          <div><Label>Valid From</Label><Input type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} /></div>
          <div><Label>Valid Until</Label><Input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending ? "Saving..." : initial ? "Update" : "Add Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Delete {label}?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RealEstatePage() {
  const { vendor: myVendor } = useCurrentVendor();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const [adminVendorId, setAdminVendorId] = useState<number | null>(null);
  const vendorId = myVendor?.id ?? adminVendorId;

  const { data: allVendors } = useQuery<Record<string, unknown>[]>({
    queryKey: ["vendors-list"],
    queryFn: () => apiFetch("/vendors"),
    enabled: isAdmin && !myVendor,
    retry: false,
  });

  const { data: properties = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["re-properties", vendorId],
    queryFn: () => apiFetch(`/real-estate/properties?vendorId=${vendorId}`),
    enabled: !!vendorId,
  });

  const { data: clients = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["re-clients", vendorId],
    queryFn: () => apiFetch(`/real-estate/clients?vendorId=${vendorId}`),
    enabled: !!vendorId,
  });

  const { data: viewings = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["re-viewings", vendorId],
    queryFn: () => apiFetch(`/real-estate/viewings?vendorId=${vendorId}`),
    enabled: !!vendorId,
  });

  const { data: contracts = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ["re-contracts", vendorId],
    queryFn: () => apiFetch(`/real-estate/contracts?vendorId=${vendorId}`),
    enabled: !!vendorId,
  });

  const { data: analytics } = useQuery<Record<string, unknown>>({
    queryKey: ["re-analytics", vendorId],
    queryFn: () => apiFetch(`/real-estate/analytics?vendorId=${vendorId}`),
    enabled: !!vendorId,
  });

  // Dialogs
  const [propDialog, setPropDialog] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [clientDialog, setClientDialog] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [viewingDialog, setViewingDialog] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [contractDialog, setContractDialog] = useState<{ open: boolean; item?: Record<string, unknown> }>({ open: false });
  const [delTarget, setDelTarget] = useState<{ type: string; id: number; label: string } | null>(null);

  const handleDelete = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiFetch(`/real-estate/${type}/${id}`, { method: "DELETE" }),
    onSuccess: (_, { type }) => {
      qc.invalidateQueries({ queryKey: [`re-${type}`, vendorId] });
      qc.invalidateQueries({ queryKey: ["re-analytics", vendorId] });
      toast.success("Deleted");
      setDelTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const available = useMemo(() => properties.filter((p) => p.status === "available").length, [properties]);
  const upcomingViewings = useMemo(() => viewings.filter((v) => v.status === "scheduled" && new Date(v.scheduledAt as string) > new Date()).length, [viewings]);

  if (!myVendor && isAdmin && !adminVendorId) {
    return (
      <Layout>
        <div className="p-8 max-w-md mx-auto mt-20">
          <h2 className="text-xl font-semibold mb-4">Select a vendor to manage</h2>
          <Select onValueChange={(v) => setAdminVendorId(parseInt(v))}>
            <SelectTrigger><SelectValue placeholder="Choose vendor..." /></SelectTrigger>
            <SelectContent>
              {(allVendors ?? []).map((v) => (
                <SelectItem key={String(v.id)} value={String(v.id)}>{v.name as string}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Layout>
    );
  }

  const publicUrl = vendorId ? `${window.location.origin}${import.meta.env.BASE_URL}properties/${vendorId}` : null;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Real Estate</h1>
              <p className="text-xs text-muted-foreground">Property listings, clients & viewings</p>
            </div>
          </div>
          {publicUrl && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Public Listings Page
              </Button>
            </a>
          )}
        </div>

        {/* Admin vendor picker */}
        {isAdmin && !myVendor && adminVendorId && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 flex items-center gap-3">
            <span className="text-sm text-amber-400">Viewing as admin:</span>
            <Select value={String(adminVendorId)} onValueChange={(v) => setAdminVendorId(parseInt(v))}>
              <SelectTrigger className="w-56 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(allVendors ?? []).map((v) => (
                  <SelectItem key={String(v.id)} value={String(v.id)}>{v.name as string}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Properties", value: properties.length, icon: Building2, color: "text-blue-400" },
            { label: "Available", value: available, icon: Home, color: "text-emerald-400" },
            { label: "Total Clients", value: clients.length, icon: Users, color: "text-purple-400" },
            { label: "Upcoming Viewings", value: upcomingViewings, icon: CalendarCheck, color: "text-amber-400" },
          ].map((s) => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="properties">
          <TabsList>
            <TabsTrigger value="properties" className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Properties</TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5"><Users className="w-3.5 h-3.5" />Clients</TabsTrigger>
            <TabsTrigger value="viewings" className="gap-1.5"><CalendarCheck className="w-3.5 h-3.5" />Viewings</TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Contracts</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Analytics</TabsTrigger>
          </TabsList>

          {/* ── Properties tab ── */}
          <TabsContent value="properties" className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{properties.length} listing{properties.length !== 1 ? "s" : ""}</p>
              <Button size="sm" className="gap-2" onClick={() => setPropDialog({ open: true })} disabled={!vendorId}>
                <Plus className="w-4 h-4" />Add Property
              </Button>
            </div>
            {properties.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No properties yet</p>
                <p className="text-sm">Add your first listing to get started</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Listing</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {properties.map((p) => (
                      <TableRow key={String(p.id)}>
                        <TableCell className="font-medium max-w-[180px] truncate">{p.title as string}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{p.propertyType as string}</Badge>
                        </TableCell>
                        <TableCell className="capitalize text-xs text-muted-foreground">{p.listingType as string}</TableCell>
                        <TableCell className="text-sm">
                          {p.price ? <div className="text-emerald-400">₦{fmt(p.price as string)}</div> : null}
                          {p.rentPrice ? <div className="text-blue-400 text-xs">₦{fmt(p.rentPrice as string)}/{p.rentPeriod as string}</div> : null}
                          {!p.price && !p.rentPrice ? <span className="text-muted-foreground">—</span> : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.bedrooms ? <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{p.bedrooms as number}</span> : null}
                          {p.area ? <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3" />{p.area as string}{p.areaUnit as string}</span> : null}
                        </TableCell>
                        <TableCell><StatusBadge status={p.status as string} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground"><span className="flex items-center gap-1"><Eye className="w-3 h-3" />{p.views as number}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPropDialog({ open: true, item: p })}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ type: "properties", id: p.id as number, label: p.title as string })}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Clients tab ── */}
          <TabsContent value="clients" className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
              <Button size="sm" className="gap-2" onClick={() => setClientDialog({ open: true })} disabled={!vendorId}>
                <Plus className="w-4 h-4" />Add Client
              </Button>
            </div>
            {clients.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No clients yet</p>
                <p className="text-sm">Track your buyers, sellers and tenants here</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Preferred Areas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => (
                      <TableRow key={String(c.id)}>
                        <TableCell className="font-medium">{c.name as string}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{c.clientType as string}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>{c.email as string}</div>
                          <div>{c.phone as string}</div>
                        </TableCell>
                        <TableCell className="text-sm">{c.budget ? `₦${fmt(c.budget as string)}` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{(c.preferredAreas as string) || "—"}</TableCell>
                        <TableCell><StatusBadge status={c.status as string} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setClientDialog({ open: true, item: c })}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ type: "clients", id: c.id as number, label: c.name as string })}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Viewings tab ── */}
          <TabsContent value="viewings" className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{viewings.length} viewing{viewings.length !== 1 ? "s" : ""}</p>
              <Button size="sm" className="gap-2" onClick={() => setViewingDialog({ open: true })} disabled={!vendorId}>
                <Plus className="w-4 h-4" />Schedule Viewing
              </Button>
            </div>
            {viewings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No viewings yet</p>
                <p className="text-sm">Schedule property viewings for your clients</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewings.map((v) => {
                      const prop = properties.find((p) => p.id === v.propertyId);
                      return (
                        <TableRow key={String(v.id)}>
                          <TableCell className="text-sm">{prop ? (prop.title as string) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="font-medium">{v.clientName as string}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div>{v.clientEmail as string}</div>
                            <div>{v.clientPhone as string}</div>
                          </TableCell>
                          <TableCell className="text-sm">{fmtDateTime(v.scheduledAt as string)}</TableCell>
                          <TableCell><StatusBadge status={v.status as string} /></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewingDialog({ open: true, item: v })}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ type: "viewings", id: v.id as number, label: `viewing for ${v.clientName}` })}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Contracts tab ── */}
          <TabsContent value="contracts" className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</p>
              <Button size="sm" className="gap-2" onClick={() => setContractDialog({ open: true })} disabled={!vendorId}>
                <Plus className="w-4 h-4" />Add Contract
              </Button>
            </div>
            {contracts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No contracts yet</p>
                <p className="text-sm">Track sale agreements, leases, and offer letters</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c) => {
                      const prop = properties.find((p) => p.id === c.propertyId);
                      const client = clients.find((cl) => cl.id === c.clientId);
                      return (
                        <TableRow key={String(c.id)}>
                          <TableCell className="text-sm">{prop ? (prop.title as string) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{client ? (client.name as string) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{(c.contractType as string).replace(/_/g, " ")}</Badge></TableCell>
                          <TableCell className="text-sm">
                            {c.documentUrl
                              ? <a href={c.documentUrl as string} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 hover:underline"><ExternalLink className="w-3 h-3" />{(c.documentName as string) || "Open"}</a>
                              : <span className="text-muted-foreground">{(c.documentName as string) || "—"}</span>}
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(c.validUntil as string)}</TableCell>
                          <TableCell><StatusBadge status={c.status as string} /></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setContractDialog({ open: true, item: c })}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDelTarget({ type: "contracts", id: c.id as number, label: (c.documentName as string) || "contract" })}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Analytics tab ── */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Views", value: analytics?.totalViews ?? 0, icon: Eye, color: "text-blue-400" },
                { label: "Total Inquiries", value: analytics?.totalInquiries ?? 0, icon: TrendingUp, color: "text-emerald-400" },
                { label: "Completed Viewings", value: analytics?.completedViewings ?? 0, icon: CalendarCheck, color: "text-purple-400" },
                { label: "Upcoming Viewings", value: analytics?.upcomingViewings ?? 0, icon: CalendarCheck, color: "text-amber-400" },
              ].map((s) => (
                <Card key={s.label} className="border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{s.value as number}</p>
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Properties by Status</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries((analytics?.byStatus as Record<string, number>) ?? {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <StatusBadge status={status} />
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Properties by Type</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries((analytics?.byType as Record<string, number>) ?? {}).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{type}</span>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {((analytics?.recentInquiries as Record<string, unknown>[]) ?? []).length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Inquiries</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((analytics?.recentInquiries as Record<string, unknown>[]) ?? []).map((inq) => (
                        <TableRow key={String(inq.id)}>
                          <TableCell className="font-medium">{inq.name as string}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div>{inq.email as string}</div>
                            <div>{inq.phone as string}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate text-muted-foreground">{(inq.message as string) || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(inq.createdAt as string)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {propDialog.open && vendorId && (
        <PropertyDialog open onOpenChange={(v) => !v && setPropDialog({ open: false })} vendorId={vendorId} initial={propDialog.item} onSaved={() => setPropDialog({ open: false })} />
      )}
      {clientDialog.open && vendorId && (
        <ClientDialog open onOpenChange={(v) => !v && setClientDialog({ open: false })} vendorId={vendorId} initial={clientDialog.item} onSaved={() => setClientDialog({ open: false })} />
      )}
      {viewingDialog.open && vendorId && (
        <ViewingDialog open onOpenChange={(v) => !v && setViewingDialog({ open: false })} vendorId={vendorId} properties={properties} initial={viewingDialog.item} onSaved={() => setViewingDialog({ open: false })} />
      )}
      {contractDialog.open && vendorId && (
        <ContractDialog open onOpenChange={(v) => !v && setContractDialog({ open: false })} vendorId={vendorId} properties={properties} clients={clients} initial={contractDialog.item} onSaved={() => setContractDialog({ open: false })} />
      )}
      {delTarget && (
        <DeleteConfirm
          label={delTarget.label}
          onConfirm={() => handleDelete.mutate({ type: delTarget.type, id: delTarget.id })}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </Layout>
  );
}
