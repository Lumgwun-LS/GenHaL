import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceField, useVoiceCommand } from "@/contexts/voice-context";
import {
  useListProducts,
  useCreateProduct,
  useGenerateAiImage,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, AlertTriangle, Download, Upload, Pencil, Package,
  X, ChevronRight, ImageIcon, Sparkles, Loader2, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { ImageEditorDialog } from "@/components/image-editor-dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CATEGORIES = ["General", "Electronics", "Clothing", "Food & Beverage", "Health & Beauty", "Home & Garden", "Sports", "Automotive", "Books", "Toys", "Other"];
const UNITS = ["units", "kg", "g", "litres", "ml", "pieces", "pairs", "boxes", "bags", "cartons"];

type VariationGroup = { name: string; optionsRaw: string };

type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  price: number;
  costPrice?: number | null;
  stockQuantity: number;
  lowStockThreshold?: number;
  maxStock?: number | null;
  unit?: string;
  description?: string | null;
  variationsJson?: string | null;
  imageUrl?: string | null;
  status?: string;
};

export default function Products() {
  const { vendor: myVendor } = useCurrentVendor();
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const listParams = { search, ...(vendorId ? { vendorId } : {}) };
  const { data: products, isLoading } = useListProducts(listParams);
  const createProduct = useCreateProduct();
  const generateAiImage = useGenerateAiImage();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Edit product state
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editVars, setEditVars] = useState<VariationGroup[]>([]);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [inventoryLogs, setInventoryLogs] = useState<Array<{ id: number; type: string; quantity: number; note?: string; createdAt: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Image management state
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiForm, setShowAiForm] = useState(false);

  // Add product form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("units");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [description, setDescription] = useState("");

  // Voice field registrations
  useVoiceField("product-name", "product name", setName);
  useVoiceField("product-sku", "sku", setSku);
  useVoiceField("product-price", "price", setPrice);
  useVoiceField("product-cost-price", "cost price", setCostPrice);
  useVoiceField("product-stock", "stock quantity", setStock);
  useVoiceField("product-description", "description", setDescription);
  useVoiceCommand("new product", () => setAddOpen(true));

  const lowStockCount = products?.filter(p => p.stockQuantity <= (p.lowStockThreshold || 10)).length || 0;

  function resetForm() {
    setName(""); setSku(""); setCategory("General"); setPrice(""); setCostPrice("");
    setStock(""); setUnit("units"); setLowStockThreshold("10"); setDescription("");
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListProductsQueryKey(listParams) });
  }

  function openEdit(p: Product) {
    setEditProduct({ ...p });
    setEditImageUrl(p.imageUrl ?? null);
    setShowAiForm(false);
    setAiPrompt(p.name ?? "");
    // Parse variations from JSON
    let parsed: VariationGroup[] = [];
    try {
      const arr = JSON.parse(p.variationsJson ?? "[]");
      if (Array.isArray(arr)) {
        parsed = arr.map((v: { name: string; options: string[] }) => ({
          name: v.name ?? "",
          optionsRaw: Array.isArray(v.options) ? v.options.join(", ") : "",
        }));
      }
    } catch {}
    setEditVars(parsed);
    setInventoryLogs([]);
    loadInventoryLogs(p.id);
  }

  async function loadInventoryLogs(productId: number) {
    setLogsLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/inventory-transactions?productId=${productId}&limit=20`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setInventoryLogs(d.transactions ?? d ?? []);
      }
    } catch {}
    setLogsLoading(false);
  }

  async function handleGenerateAiImage() {
    if (!vendorId || !aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const result = await generateAiImage.mutateAsync({
        data: { vendorId, prompt: aiPrompt.trim() },
      });
      if (result.status === "failed") {
        toast.error(result.result ?? "Image generation failed");
        return;
      }
      const url = result.result ?? null;
      if (url) {
        setEditImageUrl(url);
        setShowAiForm(false);
        toast.success("AI image generated and applied to this product");
      }
    } catch {
      toast.error("Image generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  async function saveEdit() {
    if (!editProduct) return;
    setEditSaving(true);
    try {
      // 1. Save basic fields + imageUrl
      const r = await fetch(`${BASE_URL}/api/products/${editProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editProduct.name,
          category: editProduct.category,
          price: editProduct.price,
          stockQuantity: editProduct.stockQuantity,
          unit: editProduct.unit,
          lowStockThreshold: editProduct.lowStockThreshold,
          ...(editProduct.description ? { description: editProduct.description } : {}),
          ...(editImageUrl !== undefined ? { imageUrl: editImageUrl ?? undefined } : {}),
        }),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error ?? "Save failed"); return; }

      // 2. Save variations
      const variations = editVars
        .filter(v => v.name.trim())
        .map(v => ({
          name: v.name.trim(),
          options: v.optionsRaw.split(",").map(s => s.trim()).filter(Boolean),
        }));
      await fetch(`${BASE_URL}/api/products/${editProduct.id}/variations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variations: variations.length ? variations : null }),
      });

      toast.success("Product saved");
      setEditProduct(null);
      invalidate();
    } catch { toast.error("Network error"); }
    finally { setEditSaving(false); }
  }

  async function handleCreate() {
    if (!vendorId || !name || !price || !stock) return;
    try {
      await createProduct.mutateAsync({
        data: {
          vendorId,
          name,
          sku: sku || `SKU-${Date.now()}`,
          category: category || "General",
          price: parseFloat(price),
          costPrice: costPrice ? parseFloat(costPrice) : undefined,
          stockQuantity: parseInt(stock, 10),
          unit: unit || "units",
          lowStockThreshold: parseInt(lowStockThreshold, 10) || 10,
          ...(description ? { description } : {}),
        },
      });
      toast.success("Product added");
      setAddOpen(false);
      resetForm();
      invalidate();
    } catch (e: unknown) {
      toast.error((e as { message?: string }).message ?? "Failed to add product");
    }
  }

  async function handleExport() {
    if (!vendorId) return;
    const params = new URLSearchParams({ vendorId: String(vendorId) });
    try {
      const res = await fetch(`${BASE_URL}/api/products/export?${params}`, { credentials: "include" });
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  }

  /** Stock health percentage (0–100) relative to low-stock threshold × 3 as a "full" baseline. */
  function stockPct(p: Product) {
    const full = (p.lowStockThreshold || 10) * 3;
    return Math.min(100, Math.round((p.stockQuantity / full) * 100));
  }

  function stockColor(p: Product) {
    if (p.stockQuantity === 0) return "#ef4444";
    if (p.stockQuantity <= (p.lowStockThreshold || 10)) return "#f59e0b";
    return "#10b981";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your unified product catalog.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={!vendorId}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!vendorId}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} disabled={!vendorId}>
            <Plus className="w-4 h-4 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      {lowStockCount > 0 && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <div><span className="font-bold">{lowStockCount} product{lowStockCount !== 1 ? "s" : ""}</span> {lowStockCount === 1 ? "is" : "are"} running low on stock. Click a row to manage inventory.</div>
        </div>
      )}

      <Card>
        <div className="p-4 border-b flex gap-2 items-center relative">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input placeholder="Search SKU or name…" className="pl-9 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right w-40">Stock</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading products…</TableCell></TableRow>
            ) : products?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">No products found.</TableCell></TableRow>
            ) : (
              products?.map(product => {
                const p = product as Product;
                const pct = stockPct(p);
                const color = stockColor(p);
                const isLow = p.stockQuantity <= (p.lowStockThreshold || 10);
                const hasVars = Boolean(p.variationsJson);
                return (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEdit(p)}>
                    {/* Image thumbnail */}
                    <TableCell>
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {hasVars && (
                        <div className="text-xs text-muted-foreground mt-0.5">Has variations</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                    <TableCell className="text-right font-medium">${p.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={isLow ? (p.stockQuantity === 0 ? "destructive" : "outline") : "outline"}
                               className={!isLow ? "border-emerald-300 text-emerald-700 bg-emerald-50" : ""}>
                          {p.stockQuantity} {p.unit || "units"}
                        </Badge>
                        <div style={{ width: 80, height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width .4s" }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Edit Product Dialog ─────────────────────────────────────────── */}
      <Dialog open={Boolean(editProduct)} onOpenChange={v => { if (!v) setEditProduct(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              {editProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {editProduct && (
            <Tabs defaultValue="basic">
              <TabsList className="w-full">
                <TabsTrigger value="basic" className="flex-1">Basic</TabsTrigger>
                <TabsTrigger value="image" className="flex-1">
                  <ImageIcon className="w-3.5 h-3.5 mr-1.5" />Image
                </TabsTrigger>
                <TabsTrigger value="variations" className="flex-1">Variations</TabsTrigger>
                <TabsTrigger value="inventory" className="flex-1">Inventory</TabsTrigger>
              </TabsList>

              {/* ── Basic tab ─────────────────────────────────────────── */}
              <TabsContent value="basic" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={editProduct.name} onChange={e => setEditProduct(p => p ? { ...p, name: e.target.value } : p)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={editProduct.category} onValueChange={v => setEditProduct(p => p ? { ...p, category: v } : p)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Select value={editProduct.unit ?? "units"} onValueChange={v => setEditProduct(p => p ? { ...p, unit: v } : p)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price</Label>
                    <Input type="number" step="0.01" value={editProduct.price} onChange={e => setEditProduct(p => p ? { ...p, price: parseFloat(e.target.value) || 0 } : p)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stock Quantity</Label>
                    <Input type="number" value={editProduct.stockQuantity} onChange={e => setEditProduct(p => p ? { ...p, stockQuantity: parseInt(e.target.value, 10) || 0 } : p)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Low Stock Alert Threshold</Label>
                  <Input type="number" value={editProduct.lowStockThreshold ?? 10}
                    onChange={e => setEditProduct(p => p ? { ...p, lowStockThreshold: parseInt(e.target.value, 10) || 10 } : p)} />
                </div>
                {/* Stock health bar */}
                <div className="rounded-xl border p-3 bg-muted/30 space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Stock Health</span>
                    <span style={{ color: stockColor(editProduct) }}>{editProduct.stockQuantity} {editProduct.unit ?? "units"}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#e5e7eb", overflow: "hidden" }}>
                    <div style={{ width: `${stockPct(editProduct)}%`, height: "100%", borderRadius: 4, background: stockColor(editProduct), transition: "width .4s" }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editProduct.stockQuantity === 0
                      ? "⚠️ Out of stock — products are hidden from the live shop."
                      : editProduct.stockQuantity <= (editProduct.lowStockThreshold ?? 10)
                      ? `🔶 Low stock — alert threshold is ${editProduct.lowStockThreshold ?? 10} units.`
                      : "✅ Sufficient stock."}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input value={editProduct.description ?? ""} onChange={e => setEditProduct(p => p ? { ...p, description: e.target.value } : p)} />
                </div>
              </TabsContent>

              {/* ── Image tab ─────────────────────────────────────────── */}
              <TabsContent value="image" className="pt-2 space-y-4">
                {/* Current image preview */}
                <div className="relative rounded-xl overflow-hidden border bg-muted/30 aspect-video flex items-center justify-center">
                  {editImageUrl ? (
                    <>
                      <img src={editImageUrl} alt={editProduct.name} className="w-full h-full object-contain" />
                      <button
                        onClick={() => setEditImageUrl(null)}
                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground py-8">
                      <ImageIcon className="w-12 h-12 opacity-20" />
                      <p className="text-sm">No product image yet</p>
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => setMediaPickerOpen(true)}
                  >
                    <Upload className="w-4 h-4" />
                    Pick from Library
                  </Button>
                  {editImageUrl && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => setImageEditorOpen(true)}
                    >
                      <Wand2 className="w-4 h-4" />
                      Refine in Editor
                    </Button>
                  )}
                  <Button
                    variant={showAiForm ? "default" : "outline"}
                    className="flex-1 gap-2"
                    onClick={() => setShowAiForm(v => !v)}
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate with AI
                  </Button>
                </div>

                {/* AI generation form */}
                {showAiForm && (
                  <div className="rounded-xl border p-4 space-y-3 bg-primary/5">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Sparkles className="w-4 h-4" />
                      AI Image Generator
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Describe what you want the product image to look like. Be specific about style, background, lighting, and context.
                    </p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Image description / prompt</Label>
                      <Textarea
                        rows={3}
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder={`e.g. "${editProduct.name} on a clean white background, professional product photography, soft studio lighting, high resolution"`}
                        className="text-sm resize-none"
                      />
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={handleGenerateAiImage}
                      disabled={aiGenerating || !aiPrompt.trim()}
                    >
                      {aiGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> Generate Image</>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Generated images are saved to your{" "}
                      <a href={`${BASE_URL}/ai-studio`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        Media Library
                      </a>{" "}
                      and can be refined further in the Design Studio.
                    </p>
                  </div>
                )}

                {editImageUrl && (
                  <div className="text-xs text-muted-foreground text-center">
                    Image will be saved with the product when you click <strong>Save Changes</strong>.
                  </div>
                )}
              </TabsContent>

              {/* ── Variations tab ────────────────────────────────────── */}
              <TabsContent value="variations" className="pt-2 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add variation groups like <strong>Size</strong> or <strong>Color</strong>. Customers pick one option per group before adding to cart.
                </p>
                <div className="space-y-3">
                  {editVars.map((v, i) => (
                    <div key={i} className="rounded-xl border p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Group name (e.g. Size, Color)</Label>
                          <Input
                            value={v.name}
                            placeholder="Size"
                            onChange={e => setEditVars(prev => prev.map((g, j) => j === i ? { ...g, name: e.target.value } : g))}
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="mt-5 shrink-0"
                          onClick={() => setEditVars(prev => prev.filter((_, j) => j !== i))}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Options (comma-separated)</Label>
                        <Input
                          value={v.optionsRaw}
                          placeholder="S, M, L, XL"
                          onChange={e => setEditVars(prev => prev.map((g, j) => j === i ? { ...g, optionsRaw: e.target.value } : g))}
                        />
                        {v.optionsRaw && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {v.optionsRaw.split(",").map(s => s.trim()).filter(Boolean).map(opt => (
                              <span key={opt} className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5 font-medium">{opt}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full gap-2"
                  onClick={() => setEditVars(prev => [...prev, { name: "", optionsRaw: "" }])}>
                  <Plus className="w-4 h-4" /> Add Variation Group
                </Button>
                {editVars.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">No variations yet. Click above to add Size, Color, etc.</p>
                )}
              </TabsContent>

              {/* ── Inventory tab ─────────────────────────────────────── */}
              <TabsContent value="inventory" className="pt-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Recent Inventory Transactions</p>
                  </div>
                  {logsLoading ? (
                    <p className="text-center text-sm text-muted-foreground py-6">Loading…</p>
                  ) : inventoryLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No inventory transactions yet.</p>
                      <p className="text-xs mt-1">Purchases and stock adjustments will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {inventoryLogs.map(log => (
                        <div key={log.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                          <div>
                            <span className={`font-medium ${log.type === "sale" || log.type === "adjustment_out" ? "text-red-600" : "text-emerald-600"}`}>
                              {log.type === "sale" ? "Sale" : log.type === "purchase" ? "Restock" : log.type === "adjustment_in" ? "Adj +" : log.type === "adjustment_out" ? "Adj −" : log.type}
                            </span>
                            {log.note && <span className="text-muted-foreground ml-2 text-xs">{log.note}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${log.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {log.quantity > 0 ? "+" : ""}{log.quantity}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editProduct}>
              {editSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Media Picker ───────────────────────────────────────────────── */}
      <MediaPickerDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        typeFilter="image"
        title="Choose Product Image"
        onSelect={(url) => {
          setEditImageUrl(url);
          setMediaPickerOpen(false);
          toast.success("Image selected — click Save Changes to apply it.");
        }}
      />

      {/* ── Image Editor ───────────────────────────────────────────────── */}
      {editImageUrl && (
        <ImageEditorDialog
          open={imageEditorOpen}
          onClose={() => setImageEditorOpen(false)}
          imageUrl={editImageUrl}
          onSave={(newUrl) => {
            setEditImageUrl(newUrl);
            setImageEditorOpen(false);
            toast.success("Refined image saved — click Save Changes to apply it.");
          }}
        />
      )}

      {/* ── Add Product Dialog ──────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); setAddOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add a Product</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreate(); }}>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Basmati Rice 5kg" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} placeholder="Auto-generated if blank" /></div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Price *</Label><Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
                <div className="space-y-1.5"><Label>Cost Price</Label><Input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="Optional" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Stock Qty *</Label><Input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" /></div>
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Low Stock Alert</Label><Input type="number" value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createProduct.isPending || !name || !price || !stock}>
                {createProduct.isPending ? "Saving…" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV Import */}
      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        importUrl="/api/products/import"
        entityName="Products"
        columns={["Name", "SKU", "Category", "Price", "Cost Price", "Stock Quantity", "Unit", "Low Stock Threshold", "Status", "Description"]}
        requiredColumns={["Name", "Price", "Stock Quantity"]}
        onSuccess={() => invalidate()}
      />
    </div>
  );
}
