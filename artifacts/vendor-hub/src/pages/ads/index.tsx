import { useState, useRef, useMemo } from "react";
import {
  useListAdContacts,
  useCreateAdContact,
  useImportAdContacts,
  useUpdateAdContact,
  useDeleteAdContact,
  getListAdContactsQueryKey,
  useListAdCampaigns,
  useCreateAdCampaign,
  useUpdateAdCampaign,
  useDeleteAdCampaign,
  usePublishAdCampaign,
  getListAdCampaignsQueryKey,
  useListCampaignAnalyticsSnapshots,
  useSyncCampaignAnalyticsFromPlatform,
  getListCampaignAnalyticsSnapshotsQueryKey,
  useListAdEmailCampaigns,
  useCreateAdEmailCampaign,
  useUpdateAdEmailCampaign,
  useDeleteAdEmailCampaign,
  useSendAdEmailCampaign,
  getListAdEmailCampaignsQueryKey,
  useGenerateAiCaption,
  useGenerateAiImage,
  type AdCampaign,
  type AdContact,
  type AdEmailCampaign,
  type AdAnalyticsSnapshot,
  type AdContactImportResult,
  type AdPublishResult,
  type AdPublishResultStatus,
  type AdEmailSendResult,
  type AiGeneration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Megaphone, Users, BarChart3, Mail, Plus, Upload, Search, Trash2, Pencil,
  Send, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft,
  Sparkles, Image, Target, DollarSign, Eye, Play, Pause,
  ArrowUpRight, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

const VENDOR_ID = 1;

const AD_PLATFORMS = [
  "Facebook", "Instagram", "LinkedIn", "Google Ads", "YouTube", "TikTok", "X (Twitter)",
];

const AD_OBJECTIVES = [
  "awareness", "traffic", "engagement", "leads", "sales", "app_promotion", "video_views",
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:     { label: "Draft",     variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "outline" },
  active:    { label: "Active",    variant: "default" },
  paused:    { label: "Paused",    variant: "secondary" },
  ended:     { label: "Ended",     variant: "secondary" },
  failed:    { label: "Failed",    variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Extract image URL from AiGeneration.result (may be a JSON string or direct URL). */
function parseAiImageUrl(gen: AiGeneration): string {
  if (!gen.result) return "";
  try {
    const parsed = JSON.parse(gen.result);
    return parsed?.url ?? parsed?.imageUrl ?? gen.result;
  } catch {
    return gen.result;
  }
}

// ─── Client-side CSV parser ──────────────────────────────────────────────────

function parseCsvToContacts(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes("name") || firstLower.includes("email");
  const headers = hasHeader
    ? lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""))
    : ["name", "email", "phone"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
      const name = row["name"] || cols[0] || "";
      if (!name) return null;
      return {
        name,
        email: row["email"] || cols[1] || undefined,
        phone: row["phone"] || cols[2] || undefined,
      };
    })
    .filter(Boolean) as { name: string; email?: string; phone?: string }[];
}

// ════════════════════════════════════════════════════════════════════════════
// CONTACTS TAB
// ════════════════════════════════════════════════════════════════════════════

type ContactForm = { name: string; email: string; phone: string; tags: string };

function contactFormFromRow(c: AdContact): ContactForm {
  return {
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    tags: (c.tags ?? []).join(", "),
  };
}

function ContactDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: ContactForm;
  onSave: (f: ContactForm) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<ContactForm>(initial);
  // Reset when dialog opens
  useState(() => { setForm(initial); });
  const set = (k: keyof ContactForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1"><Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1"><Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+234 800 000 0000" />
          </div>
          <div className="space-y-1">
            <Label>Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
            <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="vip, lagos, prospect" />
          </div>
          <Button className="w-full" onClick={() => onSave(form)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactsTab() {
  const qc = useQueryClient();
  const { data: contacts = [], isLoading } = useListAdContacts();
  const createContact = useCreateAdContact();
  const updateContact = useUpdateAdContact();
  const importContacts = useImportAdContacts();
  const deleteContact = useDeleteAdContact();

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdContact | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const blank: ContactForm = { name: "", email: "", phone: "", tags: "" };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.platform ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdContactsQueryKey() });

  const formToInput = (f: ContactForm) => ({
    name: f.name.trim(),
    email: f.email.trim() || undefined,
    phone: f.phone.trim() || undefined,
    tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  });

  const handleAdd = async (f: ContactForm) => {
    if (!f.name.trim()) { toast.error("Name is required"); return; }
    try {
      await createContact.mutateAsync({ data: formToInput(f) });
      invalidate();
      toast.success("Contact added");
      setAddOpen(false);
    } catch { toast.error("Failed to add contact"); }
  };

  const handleEdit = async (f: ContactForm) => {
    if (!editTarget) return;
    if (!f.name.trim()) { toast.error("Name is required"); return; }
    try {
      await updateContact.mutateAsync({ id: editTarget.id, data: formToInput(f) });
      invalidate();
      toast.success("Contact updated");
      setEditTarget(null);
    } catch { toast.error("Failed to update contact"); }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvToContacts(text);
    if (rows.length === 0) { toast.error("No contacts found in file"); return; }
    try {
      const result: AdContactImportResult = await importContacts.mutateAsync({ data: rows });
      invalidate();
      toast.success(`Imported ${result.imported} contact${result.imported === 1 ? "" : "s"}`);
    } catch { toast.error("Import failed"); }
    e.target.value = "";
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteContact.mutateAsync({ id });
      invalidate();
      toast.success("Contact removed");
    } catch { toast.error("Failed to remove contact"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleCsvFile} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importContacts.isPending}>
            {importContacts.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            Import CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact</Button>
        </div>
      </div>

      <ContactDialog
        open={addOpen} onOpenChange={setAddOpen}
        title="Add Contact" initial={blank}
        onSave={handleAdd} saving={createContact.isPending}
      />
      {editTarget && (
        <ContactDialog
          open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          title="Edit Contact" initial={contactFormFromRow(editTarget)}
          onSave={handleEdit} saving={updateContact.isPending}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading contacts…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 gap-3">
            <Users className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? "No contacts match your search." : "No contacts yet. Import a CSV or add one manually."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tags</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c: AdContact) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.platform ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(c)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADS CREATOR WIZARD
// ════════════════════════════════════════════════════════════════════════════

type WizardData = {
  platform: string; objective: string; name: string;
  headline: string; body: string; cta: string; imageUrl: string;
  ageMin: string; ageMax: string; gender: string; interests: string;
  budgetAmount: string; budgetCurrency: string; startDate: string; endDate: string;
};

const WIZARD_STEPS = [
  { label: "Platform", icon: Target },
  { label: "Copy", icon: Sparkles },
  { label: "Creative", icon: Image },
  { label: "Audience", icon: Users },
  { label: "Budget", icon: DollarSign },
  { label: "Review", icon: Eye },
];

function AdsCreatorTab() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({
    platform: "", objective: "awareness", name: "",
    headline: "", body: "", cta: "Learn More", imageUrl: "",
    ageMin: "18", ageMax: "65", gender: "all", interests: "",
    budgetAmount: "", budgetCurrency: "USD", startDate: "", endDate: "",
  });

  const generateCaption = useGenerateAiCaption();
  const generateImage = useGenerateAiImage();
  const createCampaign = useCreateAdCampaign();
  const [aiLoading, setAiLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof WizardData) => (v: string) => setData((d) => ({ ...d, [k]: v }));

  const handleGenerateCopy = async () => {
    if (!data.platform || !data.name) { toast.error("Fill in campaign name and platform first"); return; }
    setAiLoading(true);
    try {
      const gen: AiGeneration = await generateCaption.mutateAsync({
        data: { vendorId: VENDOR_ID, topic: data.name, platform: data.platform, tone: "professional" },
      });
      const text = gen.result ?? "";
      const lines = text.split("\n").filter(Boolean);
      setData((d) => ({
        ...d,
        headline: lines[0]?.slice(0, 80) ?? data.name,
        body: lines.slice(1).join(" ").slice(0, 300) || text.slice(0, 300),
      }));
      toast.success("Copy generated");
    } catch { toast.error("Failed to generate copy"); }
    finally { setAiLoading(false); }
  };

  const handleGenerateImage = async () => {
    if (!data.name) { toast.error("Add a campaign name first"); return; }
    setAiLoading(true);
    try {
      const gen: AiGeneration = await generateImage.mutateAsync({
        data: {
          vendorId: VENDOR_ID,
          prompt: `Ad creative for: ${data.name} — ${data.headline || data.objective} campaign`,
          style: "marketing",
        },
      });
      const url = parseAiImageUrl(gen);
      if (url) { setData((d) => ({ ...d, imageUrl: url })); toast.success("Image generated"); }
      else toast.error("No image returned — try again");
    } catch { toast.error("Failed to generate image"); }
    finally { setAiLoading(false); }
  };

  const handleSave = async () => {
    if (!data.platform || !data.name) { toast.error("Platform and campaign name are required"); return; }
    setAiLoading(true);
    try {
      const audience = {
        ageMin: Number(data.ageMin) || undefined,
        ageMax: Number(data.ageMax) || undefined,
        gender: data.gender !== "all" ? data.gender : undefined,
        interests: data.interests
          ? data.interests.split(",").map((i) => i.trim()).filter(Boolean)
          : undefined,
      };
      await createCampaign.mutateAsync({
        data: {
          name: data.name,
          platform: data.platform,
          objective: data.objective,
          budgetAmount: data.budgetAmount ? Number(data.budgetAmount) : undefined,
          budgetCurrency: data.budgetCurrency,
          startDate: data.startDate || undefined,
          endDate: data.endDate || undefined,
          audienceJson: audience,
          headline: data.headline || undefined,
          body: data.body || undefined,
          cta: data.cta || undefined,
          imageUrl: data.imageUrl || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: getListAdCampaignsQueryKey() });
      toast.success("Campaign saved as draft");
      setDone(true);
    } catch { toast.error("Failed to save campaign"); }
    finally { setAiLoading(false); }
  };

  const reset = () => {
    setStep(0);
    setData({ platform: "", objective: "awareness", name: "", headline: "", body: "", cta: "Learn More", imageUrl: "", ageMin: "18", ageMax: "65", gender: "all", interests: "", budgetAmount: "", budgetCurrency: "USD", startDate: "", endDate: "" });
    setDone(false);
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-60 gap-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          <div className="text-center">
            <p className="font-semibold text-lg">Campaign Saved!</p>
            <p className="text-sm text-muted-foreground mt-1">Your campaign is saved as a draft. Go to Ads Manager to publish or edit it.</p>
          </div>
          <Button onClick={reset}><Plus className="w-4 h-4 mr-2" />Create Another</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {WIZARD_STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-center gap-1">
              <button
                type="button" onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step ? "bg-primary text-primary-foreground" :
                  i < step ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-3 h-3" /> {s.label}
              </button>
              {i < WIZARD_STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? "bg-primary/40" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input placeholder="e.g. Summer Sale — Facebook" value={data.name} onChange={(e) => set("name")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Platform *</Label>
                <div className="flex flex-wrap gap-2">
                  {AD_PLATFORMS.map((p) => (
                    <button key={p} type="button" onClick={() => set("platform")(p)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${data.platform === p ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"}`}
                    >{p}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Objective</Label>
                <Select value={data.objective} onValueChange={set("objective")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AD_OBJECTIVES.map((o) => (
                      <SelectItem key={o} value={o}>{o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ad Copy</Label>
                <Button variant="outline" size="sm" onClick={handleGenerateCopy} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate with AI
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input value={data.headline} onChange={(e) => set("headline")(e.target.value)} placeholder="Short, attention-grabbing headline" maxLength={80} />
                <p className="text-xs text-muted-foreground text-right">{data.headline.length}/80</p>
              </div>
              <div className="space-y-2">
                <Label>Body Text</Label>
                <Textarea value={data.body} onChange={(e) => set("body")(e.target.value)} placeholder="Main ad copy…" rows={4} maxLength={300} />
                <p className="text-xs text-muted-foreground text-right">{data.body.length}/300</p>
              </div>
              <div className="space-y-2">
                <Label>Call to Action</Label>
                <Select value={data.cta} onValueChange={set("cta")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Learn More", "Shop Now", "Sign Up", "Get Offer", "Book Now", "Contact Us", "Watch Now", "Download"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ad Image</Label>
                <Button variant="outline" size="sm" onClick={handleGenerateImage} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate with AI
                </Button>
              </div>
              {data.imageUrl ? (
                <div className="relative">
                  <img src={data.imageUrl} alt="Ad creative" className="rounded-lg w-full max-h-72 object-cover" />
                  <Button variant="secondary" size="sm" className="absolute top-2 right-2" onClick={() => set("imageUrl")("")}>
                    <X className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Image className="w-8 h-8 opacity-40" />
                  <p className="text-sm">Generate an image with AI or paste a URL below</p>
                </div>
              )}
              <div className="space-y-1">
                <Label>Or paste image URL</Label>
                <Input value={data.imageUrl} onChange={(e) => set("imageUrl")(e.target.value)} placeholder="https://…" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Min Age</Label><Input type="number" min={13} max={65} value={data.ageMin} onChange={(e) => set("ageMin")(e.target.value)} /></div>
                <div className="space-y-1"><Label>Max Age</Label><Input type="number" min={13} max={65} value={data.ageMax} onChange={(e) => set("ageMax")(e.target.value)} /></div>
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={data.gender} onValueChange={set("gender")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All genders</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Interests <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                <Textarea value={data.interests} onChange={(e) => set("interests")(e.target.value)} placeholder="e.g. fashion, food, technology, fitness" rows={3} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Daily Budget</Label>
                  <Input type="number" min={0} step={0.01} value={data.budgetAmount} onChange={(e) => set("budgetAmount")(e.target.value)} placeholder="50.00" />
                </div>
                <div className="space-y-1"><Label>Currency</Label>
                  <Select value={data.budgetCurrency} onValueChange={set("budgetCurrency")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USD", "NGN", "GBP", "EUR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={data.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
                <div className="space-y-1"><Label>End Date</Label><Input type="date" value={data.endDate} onChange={(e) => set("endDate")(e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Review your campaign</h3>
              <div className="rounded-lg border divide-y text-sm">
                {[
                  ["Campaign Name", data.name || "—"],
                  ["Platform", data.platform || "—"],
                  ["Objective", data.objective],
                  ["Headline", data.headline || "—"],
                  ["CTA", data.cta],
                  ["Budget", data.budgetAmount ? `${data.budgetCurrency} ${data.budgetAmount}/day` : "Not set"],
                  ["Dates", data.startDate ? `${data.startDate} → ${data.endDate || "open"}` : "Not set"],
                  ["Audience", `${data.ageMin}–${data.ageMax} yrs, ${data.gender}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex px-4 py-2.5 gap-4">
                    <span className="text-muted-foreground w-32 shrink-0">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
              {data.imageUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Ad Creative</p>
                  <img src={data.imageUrl} alt="preview" className="rounded-lg max-h-40 object-cover" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {step < WIZARD_STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && (!data.platform || !data.name)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={aiLoading || createCampaign.isPending}>
            {(aiLoading || createCampaign.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save as Draft
          </Button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADS MANAGER TAB
// ════════════════════════════════════════════════════════════════════════════

type CampaignEditForm = {
  name: string; objective: string; status: string;
  budgetAmount: string; budgetCurrency: string; startDate: string; endDate: string;
  ageMin: string; ageMax: string; gender: string; interests: string;
};

function campaignEditFormFromRow(c: AdCampaign): CampaignEditForm {
  const audience = (c.audienceJson ?? {}) as Record<string, unknown>;
  return {
    name: c.name,
    objective: c.objective,
    status: c.status,
    budgetAmount: c.budgetAmount ? String(c.budgetAmount) : "",
    budgetCurrency: c.budgetCurrency ?? "USD",
    startDate: c.startDate ? c.startDate.slice(0, 10) : "",
    endDate: c.endDate ? c.endDate.slice(0, 10) : "",
    ageMin: String((audience["ageMin"] as number) ?? 18),
    ageMax: String((audience["ageMax"] as number) ?? 65),
    gender: (audience["gender"] as string) ?? "all",
    interests: Array.isArray(audience["interests"])
      ? (audience["interests"] as string[]).join(", ")
      : "",
  };
}

function EditCampaignDialog({
  campaign,
  onClose,
}: { campaign: AdCampaign; onClose: () => void }) {
  const qc = useQueryClient();
  const updateCampaign = useUpdateAdCampaign();
  const [form, setForm] = useState<CampaignEditForm>(() => campaignEditFormFromRow(campaign));
  const set = (k: keyof CampaignEditForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    try {
      await updateCampaign.mutateAsync({
        id: campaign.id,
        data: {
          name: form.name.trim(),
          objective: form.objective,
          status: form.status,
          budgetAmount: form.budgetAmount ? Number(form.budgetAmount) : undefined,
          budgetCurrency: form.budgetCurrency,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          audienceJson: {
            ageMin: Number(form.ageMin) || undefined,
            ageMax: Number(form.ageMax) || undefined,
            gender: form.gender !== "all" ? form.gender : undefined,
            interests: form.interests
              ? form.interests.split(",").map((i) => i.trim()).filter(Boolean)
              : undefined,
          },
        },
      });
      qc.invalidateQueries({ queryKey: getListAdCampaignsQueryKey() });
      toast.success("Campaign updated");
      onClose();
    } catch { toast.error("Failed to update campaign"); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Campaign — {campaign.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Campaign Name *</Label>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Objective</Label>
              <Select value={form.objective} onValueChange={set("objective")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AD_OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft", "scheduled", "active", "paused", "ended"].map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Budget (daily)</Label>
              <Input type="number" min={0} step={0.01} value={form.budgetAmount} onChange={(e) => set("budgetAmount")(e.target.value)} placeholder="50.00" />
            </div>
            <div className="space-y-1"><Label>Currency</Label>
              <Select value={form.budgetCurrency} onValueChange={set("budgetCurrency")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "NGN", "GBP", "EUR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
            <div className="space-y-1"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => set("endDate")(e.target.value)} /></div>
          </div>
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Audience</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Min Age</Label><Input type="number" min={13} max={65} value={form.ageMin} onChange={(e) => set("ageMin")(e.target.value)} /></div>
              <div className="space-y-1"><Label>Max Age</Label><Input type="number" min={13} max={65} value={form.ageMax} onChange={(e) => set("ageMax")(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Gender</Label>
              <Select value={form.gender} onValueChange={set("gender")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All genders</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Interests <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={form.interests} onChange={(e) => set("interests")(e.target.value)} placeholder="fashion, food, technology" />
            </div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={updateCampaign.isPending}>
            {updateCampaign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdsManagerTab() {
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useListAdCampaigns();
  const deleteCampaign = useDeleteAdCampaign();
  const publishCampaign = usePublishAdCampaign();
  const updateCampaign = useUpdateAdCampaign();
  const [editTarget, setEditTarget] = useState<AdCampaign | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdCampaignsQueryKey() });

  const handlePublish = async (id: number) => {
    try {
      const result: AdPublishResult = await publishCampaign.mutateAsync({ id });
      invalidate();
      if (result.status === ("not_connected" as typeof AdPublishResultStatus[keyof typeof AdPublishResultStatus])) {
        toast.warning("Campaign queued — connect platform credentials in Social Hub to activate");
      } else {
        toast.success(result.message ?? "Campaign published");
      }
    } catch { toast.error("Failed to publish campaign"); }
  };

  const handleTogglePause = async (c: AdCampaign) => {
    const newStatus = c.status === "paused" ? "active" : "paused";
    try {
      await updateCampaign.mutateAsync({ id: c.id, data: { status: newStatus } });
      invalidate();
      toast.success(newStatus === "paused" ? "Campaign paused" : "Campaign resumed");
    } catch { toast.error("Failed to update campaign"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCampaign.mutateAsync({ id });
      invalidate();
      toast.success("Campaign deleted");
    } catch { toast.error("Failed to delete campaign"); }
  };

  return (
    <div className="space-y-4">
      {editTarget && (
        <EditCampaignDialog campaign={editTarget} onClose={() => setEditTarget(null)} />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 gap-3">
            <Megaphone className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No campaigns yet. Use the Creator tab to build one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Campaign</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Objective</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Budget</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Dates</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c: AdCampaign) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    {c.lastPublishError && (
                      <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {c.lastPublishError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.platform}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{c.objective.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.budgetAmount ? `${c.budgetCurrency} ${Number(c.budgetAmount).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.startDate ? `${c.startDate.slice(0, 10)}${c.endDate ? ` → ${c.endDate.slice(0, 10)}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {c.status === "draft" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handlePublish(c.id)}>
                          <Play className="w-3 h-3 mr-1" /> Publish
                        </Button>
                      )}
                      {(c.status === "active" || c.status === "paused") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleTogglePause(c)}>
                          {c.status === "active"
                            ? <><Pause className="w-3 h-3 mr-1" /> Pause</>
                            : <><Play className="w-3 h-3 mr-1" /> Resume</>}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(c)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Platform credentials not yet connected</p>
            <p className="text-muted-foreground mt-0.5">
              To run live ads, connect your ad account credentials in{" "}
              <a href="/social" className="underline hover:text-foreground">Social Hub</a>.
              Campaigns saved as drafts will activate once credentials are linked.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ════════════════════════════════════════════════════════════════════════════

function AnalyticsTab() {
  const { data: campaigns = [] } = useListAdCampaigns();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const activeCampaignId = selectedId ?? campaigns[0]?.id ?? null;

  const { data: snapshots = [], isLoading: snapshotsLoading, refetch } =
    useListCampaignAnalyticsSnapshots(activeCampaignId!, {
      query: {
        enabled: activeCampaignId !== null,
        queryKey: getListCampaignAnalyticsSnapshotsQueryKey(activeCampaignId!),
      },
    });

  const { refetch: syncRefetch, isFetching: syncing } = useSyncCampaignAnalyticsFromPlatform(
    activeCampaignId!,
    { query: { enabled: false, queryKey: ["sync-analytics", activeCampaignId] } },
  );

  const handleSync = async () => {
    const syncResult = await syncRefetch();
    await refetch();
    const result = syncResult.data as AdAnalyticsSnapshot[] | undefined;
    toast.success(result?.length ? `Synced ${result.length} snapshot(s)` : "Analytics up to date");
  };

  const totals = useMemo(() =>
    snapshots.reduce(
      (acc, s: AdAnalyticsSnapshot) => ({
        impressions: acc.impressions + (s.impressions ?? 0),
        clicks: acc.clicks + (s.clicks ?? 0),
        spend: acc.spend + Number(s.spend ?? 0),
        conversions: acc.conversions + (s.conversions ?? 0),
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    ),
    [snapshots],
  );

  const avgCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00";

  const chartData = useMemo(() =>
    [...snapshots]
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .map((s: AdAnalyticsSnapshot) => ({
        date: s.date ? format(new Date(s.date), "MMM d") : "—",
        impressions: s.impressions ?? 0,
        clicks: s.clicks ?? 0,
        spend: Number(s.spend ?? 0),
      })),
    [snapshots],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select
          value={String(activeCampaignId ?? "")}
          onValueChange={(v) => setSelectedId(Number(v))}
          disabled={campaigns.length === 0}
        >
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Select a campaign…" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c: AdCampaign) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.platform})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={!activeCampaignId || syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Sync from Platform
        </Button>
      </div>

      {!activeCampaignId ? (
        <Card><CardContent className="flex items-center justify-center h-40 text-muted-foreground text-sm">Create a campaign first to see analytics.</CardContent></Card>
      ) : snapshotsLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading analytics…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Impressions", value: totals.impressions.toLocaleString(), icon: Eye, color: "text-blue-500" },
              { label: "Clicks", value: totals.clicks.toLocaleString(), icon: ArrowUpRight, color: "text-emerald-500" },
              { label: "CTR", value: `${avgCtr}%`, icon: Target, color: "text-purple-500" },
              { label: "Spend", value: `$${totals.spend.toFixed(2)}`, icon: DollarSign, color: "text-amber-500" },
              { label: "Conversions", value: totals.conversions.toLocaleString(), icon: CheckCircle2, color: "text-emerald-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className={`h-4 w-4 ${color}`} />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
              </Card>
            ))}
          </div>

          {chartData.length > 0 ? (
            <>
              <Card>
                <CardHeader><CardTitle className="text-sm">Impressions &amp; Clicks over time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="impressions" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} name="Impressions" />
                      <Line type="monotone" dataKey="clicks" stroke="hsl(142 72% 45%)" strokeWidth={2} dot={false} name="Clicks" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {chartData.some((d) => d.spend > 0) && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Daily Spend</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Spend"]} />
                        <Bar dataKey="spend" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} name="Spend" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-40 gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No analytics data yet. Click "Sync from Platform" once your campaign is live.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL CAMPAIGNS TAB
// ════════════════════════════════════════════════════════════════════════════

type EmailForm = { subject: string; bodyHtml: string; fromName: string; tagFilter: string };

function emailFormFromRow(c: AdEmailCampaign): EmailForm {
  const filter = (c.contactFilterJson ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(filter["tags"]) ? (filter["tags"] as string[]).join(", ") : "";
  return { subject: c.subject, bodyHtml: c.bodyHtml, fromName: c.fromName, tagFilter: tags };
}

function EmailCampaignFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: EmailForm;
  onSave: (f: EmailForm) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<EmailForm>(initial);
  const set = (k: keyof EmailForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const insertTag = (tag: string) => {
    setForm((f) => ({ ...f, bodyHtml: f.bodyHtml + tag }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>From Name *</Label>
            <Input value={form.fromName} onChange={(e) => set("fromName")(e.target.value)} placeholder="Your business name" />
          </div>
          <div className="space-y-1"><Label>Subject Line *</Label>
            <Input value={form.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="Exclusive offer just for you…" />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <div className="flex gap-1 border rounded-t-md p-1 bg-muted/50">
              {[
                { label: "B", snippet: "<b>bold text</b>" },
                { label: "I", snippet: "<i>italic text</i>" },
                { label: "H2", snippet: "<h2>Heading</h2>" },
                { label: "Link", snippet: '<a href="https://…">link text</a>' },
                { label: "P", snippet: "<p>Paragraph…</p>" },
              ].map(({ label, snippet }) => (
                <button key={label} type="button" className="px-2 py-0.5 text-xs rounded hover:bg-muted font-mono" onClick={() => insertTag(snippet)}>
                  {label}
                </button>
              ))}
            </div>
            <Textarea
              value={form.bodyHtml}
              onChange={(e) => set("bodyHtml")(e.target.value)}
              placeholder="<p>Hello,</p><p>Check out our latest deals…</p>"
              rows={8}
              className="font-mono text-xs rounded-t-none border-t-0"
            />
          </div>
          <div className="space-y-1">
            <Label>Filter by Tags <span className="text-muted-foreground text-xs">(blank = all contacts)</span></Label>
            <Input value={form.tagFilter} onChange={(e) => set("tagFilter")(e.target.value)} placeholder="vip, lagos" />
          </div>
          <Button className="w-full" onClick={() => onSave(form)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formToEmailInput(f: EmailForm) {
  return {
    subject: f.subject,
    bodyHtml: f.bodyHtml,
    fromName: f.fromName,
    contactFilterJson: f.tagFilter
      ? { tags: f.tagFilter.split(",").map((t) => t.trim()).filter(Boolean) }
      : undefined,
  };
}

function EmailCampaignsTab() {
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useListAdEmailCampaigns();
  const createCampaign = useCreateAdEmailCampaign();
  const updateCampaign = useUpdateAdEmailCampaign();
  const deleteCampaign = useDeleteAdEmailCampaign();
  const sendCampaign = useSendAdEmailCampaign();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdEmailCampaign | null>(null);
  const [sending, setSending] = useState<number | null>(null);

  const blank: EmailForm = { subject: "", bodyHtml: "", fromName: "", tagFilter: "" };
  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdEmailCampaignsQueryKey() });

  const handleCreate = async (f: EmailForm) => {
    if (!f.subject || !f.bodyHtml || !f.fromName) { toast.error("Subject, from name, and body are required"); return; }
    try {
      await createCampaign.mutateAsync({ data: formToEmailInput(f) });
      invalidate();
      toast.success("Email campaign created");
      setCreateOpen(false);
    } catch { toast.error("Failed to create campaign"); }
  };

  const handleEdit = async (f: EmailForm) => {
    if (!editTarget) return;
    if (!f.subject || !f.bodyHtml || !f.fromName) { toast.error("Subject, from name, and body are required"); return; }
    try {
      await updateCampaign.mutateAsync({ id: editTarget.id, data: formToEmailInput(f) });
      invalidate();
      toast.success("Campaign updated");
      setEditTarget(null);
    } catch { toast.error("Failed to update campaign"); }
  };

  const handleSend = async (id: number) => {
    setSending(id);
    try {
      const result: AdEmailSendResult = await sendCampaign.mutateAsync({ id });
      invalidate();
      if (result.status === "sent") {
        toast.success(`Sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"}`);
      } else {
        toast.error(`Send failed — ${result.failed} error(s). Check your SMTP settings.`);
      }
    } catch { toast.error("Failed to send campaign"); }
    finally { setSending(null); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCampaign.mutateAsync({ id });
      invalidate();
      toast.success("Campaign deleted");
    } catch { toast.error("Failed to delete campaign"); }
  };

  const emailStatusColor: Record<string, string> = {
    draft: "text-muted-foreground",
    sent: "text-emerald-500",
    failed: "text-destructive",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> New Campaign</Button>
      </div>

      <EmailCampaignFormDialog
        open={createOpen} onOpenChange={setCreateOpen}
        title="Create Campaign" initial={blank}
        onSave={handleCreate} saving={createCampaign.isPending}
      />
      {editTarget && (
        <EmailCampaignFormDialog
          open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          title="Edit Campaign" initial={emailFormFromRow(editTarget)}
          onSave={handleEdit} saving={updateCampaign.isPending}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center h-40 gap-3">
          <Mail className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No email campaigns yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: AdEmailCampaign) => (
            <Card key={c.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{c.subject}</p>
                      <span className={`text-xs font-medium capitalize ${emailStatusColor[c.status] ?? "text-muted-foreground"}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">From: {c.fromName}</p>
                    {c.status === "sent" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sent to {c.sentCount ?? 0} recipient{(c.sentCount ?? 0) === 1 ? "" : "s"}
                        {c.sentAt ? ` · ${format(new Date(c.sentAt), "MMM d, h:mm a")}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.status !== "sent" && (
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleSend(c.id)} disabled={sending === c.id}>
                        {sending === c.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                        Send
                      </Button>
                    )}
                    {c.status !== "sent" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(c)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function AdsPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-primary" /> Ads Suite
        </h1>
        <p className="text-muted-foreground mt-1">
          Create, manage, and track ad campaigns across Facebook, Instagram, LinkedIn, Google Ads, YouTube, TikTok, and X.
        </p>
      </div>

      <Tabs defaultValue="creator">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="contacts" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Contacts
          </TabsTrigger>
          <TabsTrigger value="creator" className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Creator
          </TabsTrigger>
          <TabsTrigger value="manager" className="flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5" /> Manager
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-6"><ContactsTab /></TabsContent>
        <TabsContent value="creator" className="mt-6"><AdsCreatorTab /></TabsContent>
        <TabsContent value="manager" className="mt-6"><AdsManagerTab /></TabsContent>
        <TabsContent value="analytics" className="mt-6"><AnalyticsTab /></TabsContent>
        <TabsContent value="email" className="mt-6"><EmailCampaignsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
