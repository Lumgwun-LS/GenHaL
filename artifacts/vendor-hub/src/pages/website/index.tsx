import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Globe, Eye, EyeOff, Save, Upload, RefreshCw, Trash2, Plus, GripVertical,
  Smartphone, Monitor, ExternalLink, Copy, CheckCircle, Palette, LayoutTemplate,
  ChevronDown, ChevronUp, Image as ImageIcon, Wand2, Sparkles, Loader2, X, FolderOpen,
} from "lucide-react";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
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
  testimonials: "💬", contact: "📍", social: "🔗", whatsapp_cta: "📲",
};

// Expanded colour palette — grouped by family
const THEME_PALETTE = [
  { label: "Violet",    color: "#7F50FF" },
  { label: "Purple",    color: "#9F5FE0" },
  { label: "Deep Pur",  color: "#7C3AED" },
  { label: "Lavender",  color: "#A855F7" },
  { label: "Indigo",    color: "#1D4ED8" },
  { label: "Blue",      color: "#2563EB" },
  { label: "Sky",       color: "#0891B2" },
  { label: "Cyan",      color: "#0284C7" },
  { label: "Teal",      color: "#0D9488" },
  { label: "Emerald",   color: "#059669" },
  { label: "Green",     color: "#16A34A" },
  { label: "Forest",    color: "#15803D" },
  { label: "Rose",      color: "#E11D48" },
  { label: "Red",       color: "#DC2626" },
  { label: "Pink",      color: "#DB2777" },
  { label: "Coral",     color: "#F43F5E" },
  { label: "Orange",    color: "#EA580C" },
  { label: "Amber",     color: "#D97706" },
  { label: "Slate",     color: "#1E293B" },
  { label: "Neutral",   color: "#374151" },
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

function SectionEditor({ section, onChange, onUploadImage, onPickFromLibrary }: {
  section: SiteSection;
  onChange: (updated: SiteSection) => void;
  onUploadImage: (sectionId: string, file: File, field: string) => Promise<string>;
  onPickFromLibrary?: (sectionId: string, field: string) => void;
}) {
  const setField = (key: string, value: unknown) =>
    onChange({ ...section, content: { ...section.content, [key]: value } });
  const c = section.content;

  const uploadBtn = (field: string, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center flex-wrap">
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
        {onPickFromLibrary && (
          <button
            type="button"
            onClick={() => onPickFromLibrary(section.id, field)}
            className="inline-flex items-center gap-1.5 text-sm border rounded px-3 py-1.5 hover:bg-muted"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Library
          </button>
        )}
        {typeof c[field] === "string" && c[field] && (
          <Button variant="ghost" size="sm" onClick={() => setField(field, "")}><Trash2 className="w-3.5 h-3.5" /></Button>
        )}
      </div>
    </div>
  );

  if (section.type === "hero") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Headline</Label><Input value={(c.headline as string) ?? ""} onChange={e => setField("headline", e.target.value)} placeholder="Welcome to our store" /></div>
      <div className="space-y-1.5">
        <Label>Tagline / Sub-headline</Label>
        <Input value={(c.subheadline as string) ?? ""} onChange={e => setField("subheadline", e.target.value)} placeholder="Your catchy one-liner…" />
        <p className="text-xs text-muted-foreground">Shown as a badge above your headline. Set it in the Design tab for AI suggestions.</p>
      </div>
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
                if (url) setImages([...images, { url }]);
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

  // Core site state
  const [sections, setSections] = useState<SiteSection[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [metaDesc, setMetaDesc] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("sections");

  // Media library picker state
  const [pickerTarget, setPickerTarget] = useState<{ sectionId: string; field: string } | null>(null);

  const handlePickFromLibrary = (sectionId: string, field: string) => {
    setPickerTarget({ sectionId, field });
  };

  const handleLibrarySelect = (url: string) => {
    if (!pickerTarget) return;
    const { sectionId, field } = pickerTarget;
    const base: SiteSection[] = sections ?? (site?.sectionsJson as SiteSection[]) ?? [];
    setSections(base.map(s =>
      s.id === sectionId ? { ...s, content: { ...s.content, [field]: url } } : s
    ));
    setPickerTarget(null);
  };

  // AI logo generation state
  const [aiLogoOpen, setAiLogoOpen] = useState(false);
  const [aiLogoDesc, setAiLogoDesc] = useState("");
  const [aiLogoGenerating, setAiLogoGenerating] = useState(false);
  const [aiLogoResult, setAiLogoResult] = useState<string | null>(null);

  // AI tagline generation state
  const [taglineSuggestions, setTaglineSuggestions] = useState<string[]>([]);
  const [taglinesLoading, setTaglinesLoading] = useState(false);
  const [taglineDesc, setTaglineDesc] = useState("");

  const site = websiteData as unknown as Record<string, unknown> | undefined;
  const effectiveSections: SiteSection[] = (sections ?? (site?.sectionsJson as SiteSection[]) ?? []);
  const effectiveTemplate = templateId ?? (site?.templateId as string) ?? "modern-shop";
  const effectiveTheme = themeColor ?? (site?.themeColor as string) ?? "#7F50FF";
  const effectiveTitle = pageTitle ?? (site?.pageTitle as string) ?? "";
  const effectiveMeta = metaDesc ?? (site?.metaDescription as string) ?? "";
  const effectiveLogo = logoUrl ?? (site?.logoUrl as string) ?? "";

  const templates = (site?.availableTemplates as Array<Record<string, unknown>>) ?? [];
  const currentTemplate = templates.find(t => t.id === effectiveTemplate);

  // Hero section helpers (for tagline shortcut in Design tab)
  const heroSection = effectiveSections.find(s => s.type === "hero");
  const currentTagline = (heroSection?.content?.subheadline as string) ?? "";

  const updateHeroTagline = (value: string) => {
    setSections(effectiveSections.map(s =>
      s.type === "hero" ? { ...s, content: { ...s.content, subheadline: value } } : s
    ));
  };

  const previewData: SiteData = {
    pageTitle: effectiveTitle,
    logoUrl: effectiveLogo || null,
    themeColor: effectiveTheme,
    templateId: effectiveTemplate,
    sections: effectiveSections,
    template: currentTemplate ? {
      palette: currentTemplate.palette as SiteData["template"] extends { palette: infer P } ? P : never,
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

  // AI logo generation
  const handleGenerateLogo = async () => {
    if (!effectiveTitle && !aiLogoDesc) {
      toast.error("Enter your business name or a description first");
      return;
    }
    setAiLogoGenerating(true);
    setAiLogoResult(null);
    try {
      const r = await fetch(`${BASE_URL}/api/website/generate-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: effectiveTitle || "My Business", description: aiLogoDesc }),
      });
      if (!r.ok) throw new Error("Generation failed");
      const data = await r.json() as { logoUrl: string };
      setAiLogoResult(data.logoUrl);
    } catch {
      toast.error("Logo generation failed. Please try again.");
    } finally {
      setAiLogoGenerating(false);
    }
  };

  const applyAiLogo = () => {
    if (aiLogoResult) {
      setLogoUrl(aiLogoResult);
      setAiLogoOpen(false);
      setAiLogoResult(null);
      toast.success("Logo applied! Save to keep it.");
    }
  };

  // AI tagline generation
  const handleGenerateTaglines = async () => {
    if (!effectiveTitle) {
      toast.error("Add your business name in the SEO tab (Page Title) first");
      return;
    }
    setTaglinesLoading(true);
    setTaglineSuggestions([]);
    try {
      const r = await fetch(`${BASE_URL}/api/website/generate-taglines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: effectiveTitle, description: taglineDesc }),
      });
      if (!r.ok) throw new Error("Generation failed");
      const data = await r.json() as { taglines: string[] };
      setTaglineSuggestions(data.taglines ?? []);
    } catch {
      toast.error("Tagline generation failed. Please try again.");
    } finally {
      setTaglinesLoading(false);
    }
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

  // Use the new /awajimaaai/ URL format
  const publicUrl = site
    ? `${window.location.origin}${BASE_URL}/awajimaaai/${site.slug as string}`
    : "";
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
      {/* ── Top bar ── */}
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
        {/* ── Left sidebar ── */}
        <div className="w-80 shrink-0 border-r flex flex-col min-h-0 bg-muted/20">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col h-full">
            <TabsList className="mx-3 mt-3 shrink-0">
              <TabsTrigger value="sections" className="flex-1">Sections</TabsTrigger>
              <TabsTrigger value="design" className="flex-1">Design</TabsTrigger>
              <TabsTrigger value="seo" className="flex-1">SEO</TabsTrigger>
            </TabsList>

            {/* ── Sections tab ── */}
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
                      <SectionEditor section={section} onChange={updateSection} onUploadImage={handleUploadImage} onPickFromLibrary={handlePickFromLibrary} />
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* ── Design tab ── */}
            <TabsContent value="design" className="flex-1 overflow-y-auto px-3 py-3 m-0 space-y-5">

              {/* Template */}
              <div>
                <Label className="mb-2 block font-semibold">Template</Label>
                <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => setTemplatePickerOpen(true)}>
                  <span className="flex items-center gap-2"><LayoutTemplate className="w-3.5 h-3.5" />{currentTemplate?.name as string ?? "Modern Shop"}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Brand Colour */}
              <div>
                <Label className="mb-2 block font-semibold">Brand Colour</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {THEME_PALETTE.map(({ color, label }) => (
                    <button
                      key={color}
                      onClick={() => setThemeColor(color)}
                      title={label}
                      style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: color,
                        border: effectiveTheme === color ? "3px solid white" : "2px solid transparent",
                        boxShadow: effectiveTheme === color ? `0 0 0 3px ${color}, 0 2px 8px ${color}66` : "0 1px 4px rgba(0,0,0,.2)",
                        cursor: "pointer", flexShrink: 0,
                        transition: "transform .15s, box-shadow .15s",
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={effectiveTheme}
                    onChange={e => setThemeColor(e.target.value)}
                    title="Custom colour"
                    style={{ width: 30, height: 30, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "none" }}
                  />
                  <span className="text-xs text-muted-foreground">Custom</span>
                  <span className="text-xs font-mono text-muted-foreground ml-auto">{effectiveTheme}</span>
                </div>
                {/* Live colour preview */}
                <div className="mt-2 rounded-lg overflow-hidden" style={{ height: 40, background: `linear-gradient(135deg, ${effectiveTheme}, ${effectiveTheme}99)`, border: `1px solid ${effectiveTheme}44` }}>
                  <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 0.9rem", gap: "0.6rem" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
                    <span style={{ color: "#fff", fontSize: "0.7rem", fontWeight: 700 }}>Preview</span>
                    <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: "0.65rem", fontWeight: 700 }}>BUTTON</div>
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div>
                <Label className="mb-2 block font-semibold">Logo</Label>
                {effectiveLogo && (
                  <div className="mb-2 flex items-center gap-2">
                    <img src={effectiveLogo} alt="Logo" className="h-14 object-contain rounded border bg-muted p-1.5" />
                    <Button variant="ghost" size="sm" onClick={() => setLogoUrl("")}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="cursor-pointer flex-1">
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); }} />
                    <span className="inline-flex w-full items-center justify-center gap-1.5 text-sm border rounded px-3 py-2 hover:bg-muted">
                      <Upload className="w-3.5 h-3.5" /> Upload Logo
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 whitespace-nowrap"
                    onClick={() => { setAiLogoResult(null); setAiLogoOpen(true); }}
                  >
                    <Wand2 className="w-3.5 h-3.5" /> AI Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Upload your own or let AI create one from your business name.</p>
              </div>

              {/* Tagline */}
              <div>
                <Label className="mb-2 block font-semibold">Tagline</Label>
                <p className="text-xs text-muted-foreground mb-2">Shown as a highlighted badge in your hero section.</p>
                <div className="flex gap-2">
                  <Input
                    value={currentTagline}
                    onChange={e => updateHeroTagline(e.target.value)}
                    placeholder="Your catchy one-liner…"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={handleGenerateTaglines}
                    disabled={taglinesLoading}
                  >
                    {taglinesLoading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    Ideas
                  </Button>
                </div>
                {!effectiveTitle && (
                  <p className="text-xs text-amber-500 mt-1">Set your business name in the SEO tab to unlock AI taglines.</p>
                )}
                {/* AI suggestions */}
                {taglineSuggestions.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">AI Suggestions — click to use:</p>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setTaglineSuggestions([])}><X className="w-3 h-3" /></Button>
                    </div>
                    {taglineSuggestions.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => { updateHeroTagline(t); setTaglineSuggestions([]); }}
                        className="w-full text-left text-sm px-3 py-2 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        ✦ {t}
                      </button>
                    ))}
                    {/* Optional description for better suggestions */}
                    <div className="pt-1">
                      <Input
                        value={taglineDesc}
                        onChange={e => setTaglineDesc(e.target.value)}
                        placeholder="Describe your business for better suggestions…"
                        className="text-xs"
                      />
                      <Button variant="link" size="sm" className="text-xs h-6 px-0 mt-0.5" onClick={handleGenerateTaglines} disabled={taglinesLoading}>
                        {taglinesLoading ? "Generating…" : "Regenerate ↻"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── SEO tab ── */}
            <TabsContent value="seo" className="flex-1 overflow-y-auto px-3 py-3 m-0 space-y-4">
              <div className="space-y-1.5">
                <Label>Business / Page Title</Label>
                <Input value={effectiveTitle} onChange={e => setPageTitle(e.target.value)} placeholder="My Business Name" />
                <p className="text-xs text-muted-foreground">Shown in browser tabs and search results. Also used for AI logo & tagline generation.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Meta Description</Label>
                <Textarea rows={3} value={effectiveMeta} onChange={e => setMetaDesc(e.target.value)} placeholder="A short description for search engines" />
                <p className="text-xs text-muted-foreground">{effectiveMeta.length}/160 characters</p>
              </div>
              {site && (
                <div className="space-y-1.5">
                  <Label>Shareable Website Link</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={publicUrl} className="text-xs font-mono" />
                    <Button variant="outline" size="sm" onClick={copyUrl}>{copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this link with your customers. Old <code>/site/</code> links still work.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Preview pane ── */}
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
            }}>
              <SiteRenderer data={previewData} immediateReveal />
            </div>
          </div>
        </div>
      </div>

      {/* ── Template picker dialog ── */}
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
                onSelect={() => { setTemplateId(t.id as string); setTemplatePickerOpen(false); }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Logo Generation dialog ── */}
      <Dialog open={aiLogoOpen} onOpenChange={setAiLogoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> AI Logo Generator
            </DialogTitle>
            <DialogDescription>
              Describe your business and our AI will create a professional logo for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Business name</Label>
              <Input value={effectiveTitle || ""} readOnly className="font-medium" placeholder="Set in the SEO tab" />
            </div>
            <div className="space-y-1.5">
              <Label>Business description <span className="text-muted-foreground font-normal">(optional but recommended)</span></Label>
              <Textarea
                rows={3}
                value={aiLogoDesc}
                onChange={e => setAiLogoDesc(e.target.value)}
                placeholder="e.g. A modern fashion boutique selling African print clothing in Lagos…"
              />
            </div>
            <Button
              className="w-full gap-2"
              onClick={handleGenerateLogo}
              disabled={aiLogoGenerating || !effectiveTitle}
            >
              {aiLogoGenerating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating… (10–20 sec)</>
                : <><Sparkles className="w-4 h-4" /> Generate Logo</>}
            </Button>
            {!effectiveTitle && (
              <p className="text-xs text-amber-500 text-center">Add your business name in the SEO tab first.</p>
            )}
            {aiLogoResult && (
              <Card className="p-4 space-y-3">
                <img src={aiLogoResult} alt="AI generated logo" className="w-32 h-32 object-contain mx-auto rounded-xl border bg-white p-2" />
                <div className="flex gap-2">
                  <Button className="flex-1 gap-1.5" onClick={applyAiLogo}>
                    <CheckCircle className="w-4 h-4" /> Use This Logo
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerateLogo} disabled={aiLogoGenerating}>
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Library Picker — opened when user clicks "Library" on any image field */}
      <MediaPickerDialog
        open={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        onSelect={handleLibrarySelect}
        typeFilter="image"
        title="Choose Image from Library"
      />
    </div>
  );
}
