import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Globe, Eye, EyeOff, Save, Upload, RefreshCw, Trash2, Plus, GripVertical,
  Smartphone, Monitor, ExternalLink, Copy, CheckCircle, Palette, LayoutTemplate,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from "lucide-react";
import { SiteRenderer, type SiteSection, type SiteData } from "@/components/site-renderer";
import {
  useGetWebsite,
  usePutWebsite,
  usePostWebsitePublish,
  usePostWebsiteUnpublish,
  usePostWebsiteUploadLogo,
  usePostWebsiteUploadImage,
  getGetWebsiteQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Banner",
  about: "About Us",
  products: "Products / Services",
  gallery: "Gallery",
  testimonials: "Testimonials",
  contact: "Contact Info",
  social: "Social Links",
  whatsapp_cta: "WhatsApp Button",
};

const SECTION_ICONS: Record<string, string> = {
  hero: "🌟", about: "👤", products: "🛍️", gallery: "🖼️",
  testimonials: "💬", contact: "📍", social: "🔗", whatsapp_cta: "💬",
};

const THEME_COLORS = [
  "#7F50FF", "#1D4ED8", "#DC2626", "#16A34A", "#D97706",
  "#DB2777", "#0891B2", "#7C3AED", "#374151", "#18181B",
];

function TemplateCard({ id, name, description, palette, selected, onSelect }: {
  id: string; name: string; description: string;
  palette: Record<string, string>; selected: boolean; onSelect: () => void;
}) {
  return (
    <div onClick={onSelect} className="cursor-pointer transition-all" style={{
      border: `2px solid ${selected ? palette.primary : "transparent"}`,
      borderRadius: 12, overflow: "hidden", background: "#fff",
      boxShadow: selected ? `0 0 0 3px ${palette.primary}33` : "0 1px 6px rgba(0,0,0,.08)",
    }}>
      <div style={{ height: 80, background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.secondary} 100%)`, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexWrap: "wrap", gap: 4, padding: 10, opacity: .5 }}>
          {[palette.bg, palette.accent, palette.text].map((c, i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c }} />
          ))}
        </div>
        {selected && <div style={{ position: "absolute", top: 8, right: 8, background: palette.primary, borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckCircle className="w-4 h-4 text-white" /></div>}
      </div>
      <div style={{ padding: "0.75rem 1rem" }}>
        <div className="font-semibold text-sm">{name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
    </div>
  );
}

function SectionEditor({ section, onChange, onUploadImage }: {
  section: SiteSection;
  onChange: (updated: SiteSection) => void;
  onUploadImage: (sectionId: string, file: File, field: string) => Promise<string>;
}) {
  const setField = (key: string, value: unknown) =>
    onChange({ ...section, content: { ...section.content, [key]: value } });
  const c = section.content;

  const uploadBtn = (field: string, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        {typeof c[field] === "string" && c[field] && (
          <img src={c[field] as string} alt="" className="h-10 w-16 object-cover rounded border" />
        )}
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await onUploadImage(section.id, file, field);
            if (url) setField(field, url);
          }} />
          <span className="inline-flex items-center gap-1.5 text-sm border rounded px-3 py-1.5 hover:bg-muted">
            <ImageIcon className="w-3.5 h-3.5" /> Upload
          </span>
        </label>
        {typeof c[field] === "string" && c[field] && (
          <Button variant="ghost" size="sm" onClick={() => setField(field, "")}><Trash2 className="w-3.5 h-3.5" /></Button>
        )}
      </div>
    </div>
  );

  if (section.type === "hero") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Headline</Label><Input value={(c.headline as string) ?? ""} onChange={e => setField("headline", e.target.value)} placeholder="Welcome to our store" /></div>
      <div className="space-y-1.5"><Label>Sub-headline</Label><Input value={(c.subheadline as string) ?? ""} onChange={e => setField("subheadline", e.target.value)} placeholder="Discover quality products" /></div>
      <div className="space-y-1.5"><Label>Button Text</Label><Input value={(c.ctaText as string) ?? ""} onChange={e => setField("ctaText", e.target.value)} placeholder="Shop Now" /></div>
      <div className="space-y-1.5"><Label>Button Link</Label><Input value={(c.ctaUrl as string) ?? ""} onChange={e => setField("ctaUrl", e.target.value)} placeholder="https://... or #contact" /></div>
      {uploadBtn("backgroundImage", "Background Image")}
      {typeof c.backgroundImage === "string" && c.backgroundImage && (
        <div className="space-y-1.5">
          <Label>Overlay Darkness (0–1)</Label>
          <Input type="number" min="0" max="1" step="0.1" value={(c.overlayOpacity as string) ?? "0.4"} onChange={e => setField("overlayOpacity", e.target.value)} />
        </div>
      )}
    </div>
  );

  if (section.type === "about") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Section Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Content</Label><Textarea rows={5} value={(c.body as string) ?? ""} onChange={e => setField("body", e.target.value)} placeholder="Tell your story…" /></div>
      {uploadBtn("image", "Image (optional)")}
    </div>
  );

  if (section.type === "products") {
    const items: Array<Record<string, string>> = (() => {
      try { return JSON.parse((c.items as string) ?? "[]"); } catch { return []; }
    })();
    const setItems = (updated: typeof items) => setField("items", JSON.stringify(updated));
    return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Section Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Subtitle</Label><Input value={(c.subtitle as string) ?? ""} onChange={e => setField("subtitle", e.target.value)} /></div>
        <div className="space-y-2">
          <Label>Items (up to 6)</Label>
          {items.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex justify-between items-center"><span className="text-sm font-medium">Item {idx + 1}</span><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5" /></Button></div>
              <Input placeholder="Name" value={item.name ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))} />
              <Input placeholder="Description" value={item.description ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} />
              <Input placeholder="Price (e.g. ₦5,000)" value={item.price ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, price: e.target.value } : it))} />
              <div className="flex gap-2 items-center">
                {item.image && <img src={item.image} alt="" className="h-10 w-16 object-cover rounded border" />}
                <label className="cursor-pointer"><input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const url = await onUploadImage(section.id, file, `item-${idx}-image`);
                  if (url) setItems(items.map((it, i) => i === idx ? { ...it, image: url } : it));
                }} /><span className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-muted"><ImageIcon className="w-3 h-3" /> Image</span></label>
                {item.image && <Button variant="ghost" size="sm" onClick={() => setItems(items.map((it, i) => i === idx ? { ...it, image: "" } : it))}><Trash2 className="w-3 h-3" /></Button>}
              </div>
            </div>
          ))}
          {items.length < 6 && (
            <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: "New Item", description: "", price: "", image: "" }])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (section.type === "gallery") {
    const images: Array<{ url: string }> = (() => {
      try { return JSON.parse((c.images as string) ?? "[]"); } catch { return []; }
    })();
    const setImages = (updated: typeof images) => setField("images", JSON.stringify(updated));
    return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Section Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
        <div>
          <Label className="mb-2 block">Images (up to 8)</Label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img.url} alt="" className="w-full aspect-square object-cover rounded border" />
                <button onClick={() => setImages(images.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          {images.length < 8 && (
            <label className="cursor-pointer"><input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, 8 - images.length);
              for (const file of files) {
                const url = await onUploadImage(section.id, file, `gallery-${Date.now()}`);
                if (url) setImages(prev => [...prev, { url }]);
              }
            }} /><span className="inline-flex items-center gap-1.5 text-sm border rounded px-3 py-1.5 hover:bg-muted cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add Images</span></label>
          )}
        </div>
      </div>
    );
  }

  if (section.type === "testimonials") {
    const items: Array<Record<string, string>> = (() => {
      try { return JSON.parse((c.items as string) ?? "[]"); } catch { return []; }
    })();
    const setItems = (u: typeof items) => setField("items", JSON.stringify(u));
    return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Section Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
        <div className="space-y-2">
          <Label>Testimonials (up to 4)</Label>
          {items.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex justify-between"><span className="text-sm font-medium">Review {idx + 1}</span><Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5" /></Button></div>
              <Input placeholder="Customer name" value={item.name ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))} />
              <Input placeholder="Role / title (optional)" value={item.role ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, role: e.target.value } : it))} />
              <Textarea rows={2} placeholder="Their review…" value={item.text ?? ""} onChange={e => setItems(items.map((it, i) => i === idx ? { ...it, text: e.target.value } : it))} />
            </div>
          ))}
          {items.length < 4 && <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: "", role: "", text: "", avatar: "" }])}><Plus className="w-3.5 h-3.5 mr-1" /> Add Testimonial</Button>}
        </div>
      </div>
    );
  }

  if (section.type === "contact") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Section Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={(c.email as string) ?? ""} onChange={e => setField("email", e.target.value)} placeholder="hello@yourbusiness.com" /></div>
      <div className="space-y-1.5"><Label>Phone</Label><Input value={(c.phone as string) ?? ""} onChange={e => setField("phone", e.target.value)} placeholder="+234 800 000 0000" /></div>
      <div className="space-y-1.5"><Label>Address</Label><Input value={(c.address as string) ?? ""} onChange={e => setField("address", e.target.value)} placeholder="123 Main St, Lagos" /></div>
    </div>
  );

  if (section.type === "social") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Title</Label><Input value={(c.title as string) ?? ""} onChange={e => setField("title", e.target.value)} /></div>
      {["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube"].map(key => (
        <div key={key} className="space-y-1.5">
          <Label className="capitalize">{key === "twitter" ? "X/Twitter" : key}</Label>
          <Input value={(c[key] as string) ?? ""} onChange={e => setField(key, e.target.value)} placeholder={key === "facebook" ? "username or full URL" : "@handle or URL"} />
        </div>
      ))}
    </div>
  );

  if (section.type === "whatsapp_cta") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>WhatsApp Number</Label><Input value={(c.number as string) ?? ""} onChange={e => setField("number", e.target.value)} placeholder="2348012345678 (with country code)" /></div>
      <div className="space-y-1.5"><Label>Pre-filled Message</Label><Textarea rows={2} value={(c.message as string) ?? ""} onChange={e => setField("message", e.target.value)} placeholder="Hi! I'd like to know more about your products." /></div>
      <div className="space-y-1.5"><Label>Button Text</Label><Input value={(c.buttonText as string) ?? ""} onChange={e => setField("buttonText", e.target.value)} placeholder="Chat on WhatsApp" /></div>
    </div>
  );

  return <p className="text-muted-foreground text-sm">No editable fields for this section.</p>;
}

export default function WebsitePage() {
  const qc = useQueryClient();
  const { data: websiteData, isLoading } = useGetWebsite();
  const saveMutation = usePutWebsite();
  const publishMutation = usePostWebsitePublish();
  const unpublishMutation = usePostWebsiteUnpublish();
  const uploadLogoMutation = usePostWebsiteUploadLogo();
  const uploadImageMutation = usePostWebsiteUploadImage();

  const [sections, setSections] = useState<SiteSection[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [metaDesc, setMetaDesc] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(true);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("sections");

  const site = websiteData as unknown as Record<string, unknown> | undefined;
  const effectiveSections: SiteSection[] = (sections ?? (site?.sectionsJson as SiteSection[]) ?? []);
  const effectiveTemplate = templateId ?? (site?.templateId as string) ?? "modern-shop";
  const effectiveTheme = themeColor ?? (site?.themeColor as string) ?? "#7F50FF";
  const effectiveTitle = pageTitle ?? (site?.pageTitle as string) ?? "";
  const effectiveMeta = metaDesc ?? (site?.metaDescription as string) ?? "";
  const effectiveLogo = logoUrl ?? (site?.logoUrl as string) ?? "";

  const templates = (site?.availableTemplates as Array<Record<string, unknown>>) ?? [];
  const currentTemplate = templates.find(t => t.id === effectiveTemplate);

  const previewData: SiteData = {
    pageTitle: effectiveTitle,
    logoUrl: effectiveLogo || null,
    themeColor: effectiveTheme,
    templateId: effectiveTemplate,
    sections: effectiveSections,
    template: currentTemplate ? {
      palette: currentTemplate.palette as SiteData["template"]["palette"],
      primaryFont: "Inter, sans-serif",
      name: currentTemplate.name as string,
    } : undefined,
  };

  const isDirty = sections !== null || templateId !== null || themeColor !== null ||
    pageTitle !== null || metaDesc !== null || logoUrl !== null;

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ data: {
        sections: effectiveSections,
        templateId: effectiveTemplate,
        themeColor: effectiveTheme,
        pageTitle: effectiveTitle,
        metaDescription: effectiveMeta,
        logoUrl: effectiveLogo || undefined,
      } as Parameters<typeof saveMutation.mutateAsync>[0]["data"] });
      qc.invalidateQueries({ queryKey: getGetWebsiteQueryKey() });
      setSections(null); setTemplateId(null); setThemeColor(null);
      setPageTitle(null); setMetaDesc(null); setLogoUrl(null);
      toast.success("Draft saved");
    } catch { toast.error("Failed to save"); }
  };

  const handlePublish = async () => {
    if (isDirty) await handleSave();
    try {
      await publishMutation.mutateAsync(undefined as void);
      qc.invalidateQueries({ queryKey: getGetWebsiteQueryKey() });
      toast.success("Site published! 🎉");
    } catch { toast.error("Failed to publish"); }
  };

  const handleUnpublish = async () => {
    try {
      await unpublishMutation.mutateAsync(undefined as void);
      qc.invalidateQueries({ queryKey: getGetWebsiteQueryKey() });
      toast.success("Site unpublished");
    } catch { toast.error("Failed to unpublish"); }
  };

  const handleUploadImage = useCallback(async (sectionId: string, file: File, field: string): Promise<string> => {
    try {
      const result = await uploadImageMutation.mutateAsync({ data: {
        fileName: file.name,
        contentType: file.type,
        sectionId,
      } as Parameters<typeof uploadImageMutation.mutateAsync>[0]["data"] });
      const { uploadUrl, imageUrl } = result as unknown as { uploadUrl: string; imageUrl: string };
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      return imageUrl;
    } catch { toast.error("Image upload failed"); return ""; }
  }, [uploadImageMutation]);

  const handleUploadLogo = async (file: File) => {
    try {
      const result = await uploadLogoMutation.mutateAsync({ data: {
        fileName: file.name,
        contentType: file.type,
      } as Parameters<typeof uploadLogoMutation.mutateAsync>[0]["data"] });
      const { uploadUrl, logoUrl: newLogoUrl } = result as unknown as { uploadUrl: string; logoUrl: string };
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setLogoUrl(newLogoUrl);
      toast.success("Logo uploaded");
    } catch { toast.error("Logo upload failed"); }
  };

  const moveSection = (id: string, dir: "up" | "down") => {
    const secs = [...effectiveSections];
    const i = secs.findIndex(s => s.id === id);
    if (i < 0) return;
    const swap = dir === "up" ? i - 1 : i + 1;
    if (swap < 0 || swap >= secs.length) return;
    [secs[i], secs[swap]] = [secs[swap], secs[i]];
    setSections(secs);
  };

  const toggleSection = (id: string) => {
    setSections(effectiveSections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const updateSection = (updated: SiteSection) => {
    setSections(effectiveSections.map(s => s.id === updated.id ? updated : s));
  };

  const publicUrl = site ? `${window.location.origin}${BASE_URL}/site/${site.slug as string}` : "";
  const isPublished = site?.published as boolean;

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeSection = effectiveSections.find(s => s.id === activeSectionId);

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center h-96">
      <div className="text-center text-muted-foreground"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-40" /><p>Loading your website…</p></div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: "calc(100vh - 64px)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold leading-tight">My Website</h1>
            {isPublished
              ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Published</span>
              : <span className="text-xs text-muted-foreground">Draft — not yet public</span>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}
          {isPublished && (
            <Button variant="outline" size="sm" onClick={copyUrl}>
              {copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? "Copied!" : "Copy URL"}
            </Button>
          )}
          {isPublished && (
            <Button variant="outline" size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> View Live</a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-3.5 h-3.5 mr-1" />{saveMutation.isPending ? "Saving…" : "Save Draft"}
          </Button>
          {isPublished
            ? <Button variant="destructive" size="sm" onClick={handleUnpublish} disabled={unpublishMutation.isPending}>
                <EyeOff className="w-3.5 h-3.5 mr-1" />Unpublish
              </Button>
            : <Button size="sm" onClick={handlePublish} disabled={publishMutation.isPending}>
                <Globe className="w-3.5 h-3.5 mr-1" />{publishMutation.isPending ? "Publishing…" : "Publish"}
              </Button>
          }
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-80 shrink-0 border-r flex flex-col min-h-0 bg-muted/20">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col h-full">
            <TabsList className="mx-3 mt-3 shrink-0">
              <TabsTrigger value="sections" className="flex-1">Sections</TabsTrigger>
              <TabsTrigger value="design" className="flex-1">Design</TabsTrigger>
              <TabsTrigger value="seo" className="flex-1">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="sections" className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 m-0">
              {effectiveSections.map((section, idx) => (
                <div key={section.id}>
                  <div
                    className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${activeSectionId === section.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50"}`}
                    onClick={() => setActiveSectionId(activeSectionId === section.id ? null : section.id)}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-base">{SECTION_ICONS[section.type] ?? "📄"}</span>
                    <span className="flex-1 text-sm font-medium truncate">{SECTION_LABELS[section.type] ?? section.type}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={section.enabled} onCheckedChange={() => toggleSection(section.id)} onClick={e => e.stopPropagation()} className="scale-75" />
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); moveSection(section.id, "up"); }} disabled={idx === 0}><ChevronUp className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); moveSection(section.id, "down"); }} disabled={idx === effectiveSections.length - 1}><ChevronDown className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  {activeSectionId === section.id && (
                    <div className="border border-t-0 rounded-b-lg p-3 bg-background">
                      <SectionEditor section={section} onChange={updateSection} onUploadImage={handleUploadImage} />
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="design" className="flex-1 overflow-y-auto px-3 py-3 m-0 space-y-5">
              <div>
                <Label className="mb-2 block font-semibold">Template</Label>
                <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => setTemplatePickerOpen(true)}>
                  <span className="flex items-center gap-2"><LayoutTemplate className="w-3.5 h-3.5" />{currentTemplate?.name as string ?? "Modern Shop"}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div>
                <Label className="mb-2 block font-semibold">Brand Color</Label>
                <div className="flex flex-wrap gap-2">
                  {THEME_COLORS.map(c => (
                    <button key={c} onClick={() => setThemeColor(c)} title={c}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: effectiveTheme === c ? "3px solid white" : "2px solid transparent", boxShadow: effectiveTheme === c ? `0 0 0 3px ${c}` : "none", cursor: "pointer" }}
                    />
                  ))}
                  <input type="color" value={effectiveTheme} onChange={e => setThemeColor(e.target.value)}
                    title="Custom color" style={{ width: 28, height: 28, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "none" }}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block font-semibold">Logo</Label>
                <div className="flex gap-2 items-center">
                  {effectiveLogo && <img src={effectiveLogo} alt="Logo" className="h-12 object-contain rounded border bg-muted p-1" />}
                  <label className="cursor-pointer flex-1">
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); }} />
                    <span className="inline-flex w-full items-center justify-center gap-1.5 text-sm border rounded px-3 py-2 hover:bg-muted">
                      <Upload className="w-3.5 h-3.5" /> {effectiveLogo ? "Replace Logo" : "Upload Logo"}
                    </span>
                  </label>
                  {effectiveLogo && <Button variant="ghost" size="sm" onClick={() => setLogoUrl("")}><Trash2 className="w-3.5 h-3.5" /></Button>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="seo" className="flex-1 overflow-y-auto px-3 py-3 m-0 space-y-4">
              <div className="space-y-1.5">
                <Label>Page Title</Label>
                <Input value={effectiveTitle} onChange={e => setPageTitle(e.target.value)} placeholder="My Business Name" />
                <p className="text-xs text-muted-foreground">Shown in browser tabs and search results</p>
              </div>
              <div className="space-y-1.5">
                <Label>Meta Description</Label>
                <Textarea rows={3} value={effectiveMeta} onChange={e => setMetaDesc(e.target.value)} placeholder="A short description of your business for search engines" />
                <p className="text-xs text-muted-foreground">{effectiveMeta.length}/160 characters</p>
              </div>
              {site && (
                <div className="space-y-1.5">
                  <Label>Your Website URL</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={publicUrl} className="text-xs font-mono" />
                    <Button variant="outline" size="sm" onClick={copyUrl}>{copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this link with customers</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
            <span className="text-sm font-medium text-muted-foreground mr-2">Preview</span>
            <Button size="sm" variant={previewMode === "desktop" ? "default" : "outline"} onClick={() => setPreviewMode("desktop")} className="h-7 px-2.5">
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant={previewMode === "mobile" ? "default" : "outline"} onClick={() => setPreviewMode("mobile")} className="h-7 px-2.5">
              <Smartphone className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-6">
            <div style={{
              width: previewMode === "mobile" ? 390 : "100%",
              maxWidth: previewMode === "desktop" ? "none" : 390,
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,.12)",
              transform: previewMode === "desktop" ? undefined : undefined,
            }}>
              <SiteRenderer data={previewData} />
            </div>
          </div>
        </div>
      </div>

      {/* Template picker dialog */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Choose a Template</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {templates.map(t => (
              <TemplateCard
                key={t.id as string}
                id={t.id as string}
                name={t.name as string}
                description={t.description as string}
                palette={t.palette as Record<string, string>}
                selected={effectiveTemplate === t.id}
                onSelect={() => {
                  setTemplateId(t.id as string);
                  setTemplatePickerOpen(false);
                }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
