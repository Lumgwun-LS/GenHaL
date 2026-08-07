/**
 * Public product detail page — no login required.
 * Shareable URL: /product/:vendorId/:productId
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Loader2, ShoppingCart, Share2, Check, ChevronLeft, ChevronRight, PlayCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type MediaItem = { id: number; type: string; url: string; isPrimary: boolean; caption?: string | null };
type ProductDetail = {
  vendor: { id: number; name: string; businessType?: string | null };
  product: {
    id: number; name: string; description?: string | null; price: number; costPrice?: number | null;
    stockQuantity: number; category: string; unit?: string | null; imageUrl?: string | null;
    variations: { name: string; options: string[] }[]; status: string;
  };
  media: MediaItem[];
  shopUrl: string | null;
};

export default function ProductPublicPage() {
  const params = useParams<{ vendorId: string; productId: string }>();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaIdx, setMediaIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/api/public/products/${params.vendorId}/${params.productId}`)
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? "Not found"); }))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [params.vendorId, params.productId]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center space-y-3">
        <div className="text-5xl">🔍</div>
        <h2 className="text-xl font-bold">Product Not Found</h2>
        <p className="text-muted-foreground text-sm">{error ?? "This product is no longer available."}</p>
      </div>
    </div>
  );

  const { vendor, product, media, shopUrl } = data;

  // Build ordered media list: primary first
  const orderedMedia = [...media].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  const allMedia: { type: string; url: string }[] = orderedMedia.length > 0
    ? orderedMedia
    : product.imageUrl ? [{ type: "image", url: product.imageUrl }] : [];

  const currentMedia = allMedia[mediaIdx];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between max-w-4xl mx-auto">
        <div className="text-sm font-semibold text-slate-800">{vendor.name}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share"}
          </Button>
          {shopUrl && (
            <a href={shopUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700">
                <ShoppingCart className="w-3.5 h-3.5" />
                Visit Shop
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Media column */}
          <div className="space-y-3">
            {/* Main media viewer */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-200 aspect-square">
              {currentMedia ? (
                currentMedia.type === "video" ? (
                  <video
                    src={currentMedia.url}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                  />
                ) : (
                  <img src={currentMedia.url} alt={product.name} className="w-full h-full object-contain bg-white" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-6xl">📦</div>
              )}
              {allMedia.length > 1 && (
                <>
                  <button
                    onClick={() => setMediaIdx(i => (i - 1 + allMedia.length) % allMedia.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setMediaIdx(i => (i + 1) % allMedia.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allMedia.map((_, i) => (
                      <button key={i} onClick={() => setMediaIdx(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === mediaIdx ? "bg-white w-4" : "bg-white/50"}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {allMedia.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {allMedia.map((m, i) => (
                  <button key={i} onClick={() => setMediaIdx(i)}
                    className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === mediaIdx ? "border-violet-600" : "border-transparent"}`}>
                    {m.type === "video" ? (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                        <PlayCircle className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info column */}
          <div className="space-y-5">
            <div>
              <Badge variant="secondary" className="mb-2">{product.category}</Badge>
              <h1 className="text-2xl md:text-3xl font-bold">{product.name}</h1>
              <div className="mt-2 text-3xl font-bold text-violet-700">
                ${product.price.toFixed(2)}
                <span className="text-base text-slate-400 font-normal ml-2">/ {product.unit ?? "unit"}</span>
              </div>
            </div>

            {product.description && (
              <p className="text-slate-600 leading-relaxed">{product.description}</p>
            )}

            {/* Stock */}
            <div className={`text-sm font-medium rounded-lg px-3 py-2 inline-block ${
              product.stockQuantity === 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}>
              {product.stockQuantity === 0 ? "Out of stock" : `In stock — ${product.stockQuantity} ${product.unit ?? "units"} available`}
            </div>

            {/* Variations */}
            {product.variations?.map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="text-sm font-semibold">{group.name}</div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map(opt => (
                    <button key={opt} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-violet-50 hover:border-violet-400 transition-colors">
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* CTA */}
            <div className="space-y-3 pt-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-base py-6">
                    <ShoppingCart className="w-5 h-5" />
                    Buy from {vendor.name}'s Shop
                  </Button>
                </a>
              ) : (
                <p className="text-sm text-slate-500 text-center">Contact {vendor.name} to purchase this product.</p>
              )}
              <Button variant="outline" className="w-full gap-2" onClick={copyLink}>
                {copied ? <><Check className="w-4 h-4 text-green-600" /> Copied!</> : <><Share2 className="w-4 h-4" /> Copy Share Link</>}
              </Button>
            </div>

            {/* Vendor info */}
            <div className="border rounded-xl p-4 bg-slate-50 text-sm text-slate-600">
              <div className="font-semibold text-slate-800 mb-1">{vendor.name}</div>
              {vendor.businessType && <div className="text-xs text-slate-500">{vendor.businessType}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
