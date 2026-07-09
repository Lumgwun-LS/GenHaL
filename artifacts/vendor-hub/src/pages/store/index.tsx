import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Globe, Store } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BrandTheme = {
  id: string;
  label: string;
  primary: string;
  accent: string;
  gradientFrom: string;
  gradientTo: string;
};

type PublicVendor = {
  id: number;
  name: string;
  industry: string;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  brandTheme: string;
};

async function fetchPublicVendor(id: string): Promise<PublicVendor> {
  const res = await fetch(`${BASE_URL}/api/public/vendors/${id}`);
  if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "error");
  return res.json();
}

async function fetchBrandThemes(): Promise<BrandTheme[]> {
  const res = await fetch(`${BASE_URL}/api/public/brand-themes`);
  if (!res.ok) throw new Error("Failed to load brand themes");
  return res.json();
}

/** Only ever render http(s) links — blocks javascript:/data: URLs stored on a vendor's website field. */
function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    // not a valid absolute URL
  }
  return null;
}

export default function VendorStorefront() {
  const params = useParams();
  const id = params.id ?? "";

  const { data: vendor, isLoading, error } = useQuery({
    queryKey: ["public-vendor", id],
    queryFn: () => fetchPublicVendor(id),
    enabled: !!id,
    retry: false,
  });
  const { data: themes } = useQuery({ queryKey: ["brand-themes"], queryFn: fetchBrandThemes });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading storefront…</div>;
  }

  if (error || !vendor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 text-center px-4">
        <Store className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Storefront not found</h1>
        <p className="text-muted-foreground text-sm">This vendor isn't available right now.</p>
      </div>
    );
  }

  const theme = themes?.find((t) => t.id === vendor.brandTheme) ?? themes?.[0];
  const gradientFrom = theme?.gradientFrom ?? "#7F50FF";
  const gradientTo = theme?.gradientTo ?? "#2D1B69";
  const primary = theme?.primary ?? "#7F50FF";
  const accent = theme?.accent ?? "#FF7F50";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="relative overflow-hidden px-6 py-20 sm:py-28"
        style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        <div className="max-w-3xl mx-auto text-center text-white">
          {vendor.logoUrl ? (
            <img
              src={vendor.logoUrl}
              alt={`${vendor.name} logo`}
              className="w-20 h-20 rounded-2xl mx-auto mb-6 object-cover bg-white/10 border border-white/20"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl font-bold bg-white/10 border border-white/20"
              style={{ color: accent }}
            >
              {vendor.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div
            className="inline-block text-xs font-medium uppercase tracking-wide px-3 py-1 rounded-full mb-4 bg-white/10 border border-white/20"
            style={{ color: accent }}
          >
            {vendor.industry}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">{vendor.name}</h1>
          {vendor.description && (
            <p className="text-lg text-white/80 max-w-xl mx-auto">{vendor.description}</p>
          )}
          {(() => {
            const websiteUrl = safeExternalUrl(vendor.website);
            return websiteUrl ? (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-lg font-medium text-white transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: primary }}
              >
                <Globe className="w-4 h-4" />
                Visit Website
              </a>
            ) : null;
          })()}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
        Powered by Awajimaa Connect Suite
      </div>
    </div>
  );
}
