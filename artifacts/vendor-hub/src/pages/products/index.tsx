import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceField, useVoiceCommand } from "@/contexts/voice-context";
import {
  useListProducts,
  useCreateProduct,
  useListVendors,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, AlertTriangle, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/csv-import-dialog";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CATEGORIES = ["General", "Electronics", "Clothing", "Food & Beverage", "Health & Beauty", "Home & Garden", "Sports", "Automotive", "Books", "Toys", "Other"];
const UNITS = ["units", "kg", "g", "litres", "ml", "pieces", "pairs", "boxes", "bags", "cartons"];

export default function Products() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find(v => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const listParams = { search, ...(vendorId ? { vendorId } : {}) };
  const { data: products, isLoading } = useListProducts(listParams);
  const createProduct = useCreateProduct();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("units");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [description, setDescription] = useState("");

  // Voice field registrations (smart fill by label)
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
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add product");
    }
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
          <div><span className="font-bold">{lowStockCount} products</span> are running low on stock.</div>
        </div>
      )}

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input placeholder="Search SKU or name..." className="pl-9 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading products...</TableCell></TableRow>
            ) : products?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No products found.</TableCell></TableRow>
            ) : (
              products?.map(product => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell><Badge variant="secondary">{product.category}</Badge></TableCell>
                  <TableCell className="text-right font-medium">${product.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.stockQuantity <= (product.lowStockThreshold || 10) ? "destructive" : "outline"}>
                      {product.stockQuantity} {product.unit || "units"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Product Dialog */}
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
