import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, MapPin, BedDouble, Bath, Maximize2, Eye,
  Phone, Mail, ChevronRight, Home, Briefcase, TreeDeciduous
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: string | null | undefined) {
  if (!n) return null;
  const num = parseFloat(n);
  return isNaN(num) ? n : num.toLocaleString();
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  residential: Home,
  commercial: Briefcase,
  land: TreeDeciduous,
  shortlet: Building2,
};

const LISTING_BADGE_COLORS: Record<string, string> = {
  sale: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  rent: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  both: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

interface Property {
  id: number;
  title: string;
  description?: string;
  propertyType: string;
  listingType: string;
  price?: string;
  rentPrice?: string;
  rentPeriod?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: string;
  areaUnit?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  features?: string[];
  images?: string[];
  views: number;
}

// ─── Inquiry dialog ───────────────────────────────────────────────────────────

function InquireDialog({
  property, vendorId, onClose,
}: {
  property: Property; vendorId: number; onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = useMutation({
    mutationFn: () =>
      fetch("/api/real-estate/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.id, vendorId, ...form }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
      }),
    onSuccess: () => {
      toast.success("Enquiry sent! The agent will contact you shortly.");
      onClose();
    },
    onError: () => toast.error("Failed to send enquiry. Please try again."),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enquire about this property</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{property.title}</p>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Your Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234..." /></div>
          <div><Label>Message</Label><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="I'm interested in this property..." rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.name}>
            {submit.isPending ? "Sending..." : "Send Enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Property detail dialog ───────────────────────────────────────────────────

function PropertyDetail({
  property, vendorId, onClose,
}: {
  property: Property; vendorId: number; onClose: () => void;
}) {
  const [showInquire, setShowInquire] = useState(false);
  const images = property.images?.filter(Boolean) ?? [];

  // Increment view count on open
  useState(() => {
    fetch(`/api/real-estate/properties/${property.id}/view`, { method: "POST" }).catch(() => {});
  });

  return (
    <>
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg">{property.title}</DialogTitle>
                {(property.city || property.state) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {[property.address, property.city, property.state, property.country].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border shrink-0 ${LISTING_BADGE_COLORS[property.listingType] ?? ""}`}>
                For {property.listingType}
              </span>
            </div>
          </DialogHeader>

          {/* Images */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-lg overflow-hidden">
              {images.slice(0, 4).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={property.title}
                  className={`w-full object-cover rounded-lg ${i === 0 && images.length > 1 ? "row-span-2 h-48" : "h-24"}`}
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              ))}
            </div>
          )}

          {/* Price */}
          <div className="flex flex-wrap gap-4">
            {property.price && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                <p className="text-xs text-emerald-400 font-medium">Sale Price</p>
                <p className="text-xl font-bold text-emerald-400">₦{fmt(property.price)}</p>
              </div>
            )}
            {property.rentPrice && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-400 font-medium">Rent</p>
                <p className="text-xl font-bold text-blue-400">₦{fmt(property.rentPrice)}<span className="text-sm font-normal">/{property.rentPeriod}</span></p>
              </div>
            )}
          </div>

          {/* Key details */}
          <div className="grid grid-cols-3 gap-3">
            {property.bedrooms && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <BedDouble className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{property.bedrooms}</p>
                <p className="text-[11px] text-muted-foreground">Bedrooms</p>
              </div>
            )}
            {property.bathrooms && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Bath className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{property.bathrooms}</p>
                <p className="text-[11px] text-muted-foreground">Bathrooms</p>
              </div>
            )}
            {property.area && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <Maximize2 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{property.area}</p>
                <p className="text-[11px] text-muted-foreground">{property.areaUnit}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Description</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.description}</p>
            </div>
          )}

          {/* Features */}
          {property.features && property.features.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Features</h4>
              <div className="flex flex-wrap gap-2">
                {property.features.map((f) => (
                  <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => setShowInquire(true)} className="gap-2">
              <Mail className="w-4 h-4" />Enquire Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showInquire && (
        <InquireDialog property={property} vendorId={vendorId} onClose={() => setShowInquire(false)} />
      )}
    </>
  );
}

// ─── Main public page ─────────────────────────────────────────────────────────

export default function PublicPropertyListings() {
  const [, params] = useRoute("/properties/:vendorId");
  const vendorId = params?.vendorId ? parseInt(params.vendorId) : null;

  const [filter, setFilter] = useState({ type: "", listing: "", search: "" });
  const [selected, setSelected] = useState<Property | null>(null);
  const [inquireTarget, setInquireTarget] = useState<Property | null>(null);

  const { data, isLoading, isError } = useQuery<{ vendor: Record<string, unknown>; properties: Property[] }>({
    queryKey: ["public-properties", vendorId],
    queryFn: () => fetch(`/api/real-estate/public/${vendorId}`).then((r) => r.json()),
    enabled: !!vendorId,
  });

  const allProperties = data?.properties ?? [];
  const filtered = allProperties.filter((p) => {
    if (filter.type && p.propertyType !== filter.type) return false;
    if (filter.listing && p.listingType !== filter.listing && !(p.listingType === "both")) return false;
    if (filter.search && !p.title.toLowerCase().includes(filter.search.toLowerCase()) && !`${p.city} ${p.state}`.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading listings…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Listings not found</p>
        </div>
      </div>
    );
  }

  const vendor = data.vendor;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-background border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 mb-4">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{vendor.name as string}</h1>
          <p className="text-muted-foreground mt-2">Browse our available properties</p>
          <p className="text-sm text-muted-foreground mt-1">{allProperties.length} propert{allProperties.length !== 1 ? "ies" : "y"} available</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search by title or location..."
            value={filter.search}
            onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
            className="max-w-xs"
          />
          <Select value={filter.type} onValueChange={(v) => setFilter((p) => ({ ...p, type: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="residential">Residential</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="land">Land</SelectItem>
              <SelectItem value="shortlet">Short-let</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter.listing} onValueChange={(v) => setFilter((p) => ({ ...p, listing: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-36"><SelectValue placeholder="For sale/rent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All listings</SelectItem>
              <SelectItem value="sale">For Sale</SelectItem>
              <SelectItem value="rent">For Rent</SelectItem>
            </SelectContent>
          </Select>
          {(filter.type || filter.listing || filter.search) && (
            <Button variant="ghost" size="sm" onClick={() => setFilter({ type: "", listing: "", search: "" })}>Clear filters</Button>
          )}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No properties found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((prop) => {
              const TypeIcon = TYPE_ICONS[prop.propertyType] ?? Building2;
              const images = prop.images?.filter(Boolean) ?? [];
              return (
                <div
                  key={prop.id}
                  className="group bg-card border border-border/50 rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => setSelected(prop)}
                >
                  {/* Image */}
                  <div className="relative h-48 bg-muted overflow-hidden">
                    {images[0] ? (
                      <img
                        src={images[0]}
                        alt={prop.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement!.classList.add("flex", "items-center", "justify-center");
                        }}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <TypeIcon className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border backdrop-blur-sm ${LISTING_BADGE_COLORS[prop.listingType] ?? ""}`}>
                        For {prop.listingType}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-black/60 text-white backdrop-blur-sm">
                        <Eye className="w-3 h-3" />{prop.views}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">{prop.title}</h3>
                      {(prop.city || prop.state) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[prop.city, prop.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {prop.bedrooms && <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{prop.bedrooms} bed</span>}
                      {prop.bathrooms && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{prop.bathrooms} bath</span>}
                      {prop.area && <span className="flex items-center gap-1"><Maximize2 className="w-3.5 h-3.5" />{prop.area} {prop.areaUnit}</span>}
                      <span className="ml-auto capitalize flex items-center gap-1"><TypeIcon className="w-3 h-3" />{prop.propertyType}</span>
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-between">
                      <div>
                        {prop.price && <p className="text-base font-bold text-emerald-400">₦{fmt(prop.price)}</p>}
                        {prop.rentPrice && <p className="text-sm font-semibold text-blue-400">₦{fmt(prop.rentPrice)}<span className="font-normal text-xs">/{prop.rentPeriod}</span></p>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); setInquireTarget(prop); }}
                      >
                        Enquire <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {selected && vendorId && (
        <PropertyDetail property={selected} vendorId={vendorId} onClose={() => setSelected(null)} />
      )}
      {inquireTarget && vendorId && (
        <InquireDialog property={inquireTarget} vendorId={vendorId} onClose={() => setInquireTarget(null)} />
      )}
    </div>
  );
}
