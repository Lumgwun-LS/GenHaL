import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInventorySummary,
  useListInventoryTransactions,
  useGetInventoryAnalytics,
  useGetInventoryAlertSettings,
  useUpdateInventoryAlertSettings,
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useDeletePurchaseOrder,
  useEmailPurchaseOrder,
  useListProducts,
  getListPurchaseOrdersQueryKey,
  type PurchaseOrderInput,
  type PurchaseOrderUpdate,
  type EmailPurchaseOrderInput,
  type StockAlertSettingsUpdate,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, Plus, PackageOpen, TrendingUp, TrendingDown,
  AlertTriangle, ShoppingCart, Mail, Trash2, FileText, Settings, ChevronDown,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────
function stockBadge(pct: number | null) {
  if (pct === null) return null;
  if (pct <= 20) return <Badge variant="destructive">Critical {pct}%</Badge>;
  if (pct <= 40) return <Badge className="bg-orange-500 text-white">Low {pct}%</Badge>;
  if (pct <= 60) return <Badge className="bg-amber-400 text-black">Warning {pct}%</Badge>;
  return <Badge variant="secondary">{pct}%</Badge>;
}

function statusBadge(status: string) {
  const map: Record<string, string> = { draft: "secondary", sent: "default", received: "outline", cancelled: "destructive" };
  return <Badge variant={(map[status] ?? "secondary") as "default" | "secondary" | "outline" | "destructive"}>{status}</Badge>;
}

// ── Print-friendly PO View ────────────────────────────────────────────────────
function PrintablePO({ order, items, vendorName, onClose }: {
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  vendorName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-white z-[200] overflow-auto p-8 print:p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">PURCHASE ORDER</h1>
            <p className="text-muted-foreground text-lg">{order.orderNumber as string}</p>
          </div>
          <div className="text-right">
            <div className="font-semibold text-lg">{vendorName}</div>
            <div className="text-muted-foreground">{format(new Date(order.createdAt as string), "MMMM d, yyyy")}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">From</div>
            <div className="font-semibold">{vendorName}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">To (Supplier)</div>
            <div className="font-semibold">{order.supplierName as string}</div>
            {order.supplierAddress && <div className="text-sm text-muted-foreground">{order.supplierAddress as string}</div>}
            {order.supplierEmail && <div className="text-sm text-muted-foreground">{order.supplierEmail as string}</div>}
            {order.supplierPhone && <div className="text-sm text-muted-foreground">{order.supplierPhone as string}</div>}
          </div>
        </div>

        {order.notes && (
          <div className="mb-6 p-3 bg-muted rounded text-sm">{order.notes as string}</div>
        )}

        <table className="w-full border-collapse mb-8">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Unit Price</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b">
                <td className="py-2">{item.description as string}</td>
                <td className="py-2 text-right">{item.quantity as number}</td>
                <td className="py-2 text-right">{(order.currency as string)} {(item.unitPrice as number).toFixed(2)}</td>
                <td className="py-2 text-right">{(order.currency as string)} {(item.totalPrice as number).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right font-medium">Subtotal</td>
              <td className="py-2 text-right">{order.currency as string} {(order.subtotal as number).toFixed(2)}</td>
            </tr>
            {(order.taxAmount as number) > 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-right">Tax</td>
                <td className="py-2 text-right">{order.currency as string} {(order.taxAmount as number).toFixed(2)}</td>
              </tr>
            )}
            <tr className="border-t-2">
              <td colSpan={3} className="py-3 text-right font-bold text-lg">TOTAL</td>
              <td className="py-3 text-right font-bold text-lg">{order.currency as string} {(order.totalAmount as number).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="flex gap-3 print:hidden">
          <Button onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Inventory() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");

  // PO creation state
  const [poOpen, setPoOpen] = useState(false);
  const [poSupplierName, setPoSupplierName] = useState("");
  const [poSupplierEmail, setPoSupplierEmail] = useState("");
  const [poSupplierPhone, setPoSupplierPhone] = useState("");
  const [poSupplierAddress, setPoSupplierAddress] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poCurrency, setPoCurrency] = useState("USD");
  const [poTaxRate, setPoTaxRate] = useState("0");
  const [poItems, setPoItems] = useState([{ productId: "", description: "", quantity: "1", unitPrice: "" }]);

  // PO detail / email state
  const [viewPo, setViewPo] = useState<Record<string, unknown> | null>(null);
  const [emailPoOpen, setEmailPoOpen] = useState(false);
  const [emailPoId, setEmailPoId] = useState<number | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [printPo, setPrintPo] = useState<{ order: Record<string, unknown>; items: Array<Record<string, unknown>> } | null>(null);

  // Queries
  const { data: summary } = useGetInventorySummary();
  const { data: transactions, isLoading: txLoading } = useListInventoryTransactions();
  const { data: analytics, isLoading: analyticsLoading } = useGetInventoryAnalytics();
  const { data: alertSettings } = useGetInventoryAlertSettings();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const { data: products } = useListProducts({ vendorId: undefined as unknown as number });

  // Mutations
  const createPo = useCreatePurchaseOrder();
  const updatePo = useUpdatePurchaseOrder();
  const deletePo = useDeletePurchaseOrder();
  const emailPo = useEmailPurchaseOrder();
  const updateAlerts = useUpdateInventoryAlertSettings();

  // Chart data
  const chartData = useMemo(() => {
    if (!analytics?.products) return [];
    const sorted = [...analytics.products].sort((a, b) => (b[`${period}Units`] as number) - (a[`${period}Units`] as number)).slice(0, 12);
    return sorted.map(p => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, units: p[`${period}Units` as "dailyUnits" | "weeklyUnits" | "monthlyUnits"] }));
  }, [analytics, period]);

  // PO total preview
  const poSubtotal = poItems.reduce((s, i) => s + Number(i.quantity || 0) * parseFloat(i.unitPrice || "0"), 0);
  const poTax = poSubtotal * (parseFloat(poTaxRate || "0") / 100);
  const poTotal = poSubtotal + poTax;

  function resetPo() {
    setPoSupplierName(""); setPoSupplierEmail(""); setPoSupplierPhone(""); setPoSupplierAddress("");
    setPoNotes(""); setPoCurrency("USD"); setPoTaxRate("0");
    setPoItems([{ productId: "", description: "", quantity: "1", unitPrice: "" }]);
  }

  async function handleCreatePo() {
    if (!poSupplierName) { toast.error("Supplier name is required"); return; }
    const validItems = poItems.filter(i => i.description && i.quantity && i.unitPrice);
    if (validItems.length === 0) { toast.error("Add at least one item"); return; }
    try {
      await createPo.mutateAsync({ data: {
        supplierName: poSupplierName,
        ...(poSupplierEmail ? { supplierEmail: poSupplierEmail } : {}),
        ...(poSupplierPhone ? { supplierPhone: poSupplierPhone } : {}),
        ...(poSupplierAddress ? { supplierAddress: poSupplierAddress } : {}),
        ...(poNotes ? { notes: poNotes } : {}),
        currency: poCurrency,
        taxRate: parseFloat(poTaxRate) || 0,
        items: validItems.map(i => ({
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          ...(i.productId ? { productId: Number(i.productId) } : {}),
        })),
      } as PurchaseOrderInput });
      toast.success("Purchase order created");
      setPoOpen(false);
      resetPo();
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create PO");
    }
  }

  async function handleEmailPo() {
    if (!emailPoId) return;
    try {
      await emailPo.mutateAsync({ id: emailPoId, data: { email: emailTo } as EmailPurchaseOrderInput });
      toast.success("Purchase order emailed to supplier");
      setEmailPoOpen(false);
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (e: unknown) {
      toast.error("Failed to send email");
    }
  }

  async function handleToggleAlert(key: "alert60Enabled" | "alert40Enabled" | "alert20Enabled", value: boolean) {
    try {
      await updateAlerts.mutateAsync({ data: { [key]: value } as StockAlertSettingsUpdate });
    } catch {
      toast.error("Failed to update alert settings");
    }
  }

  const vendorName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Vendor";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 w-full">
      {printPo && (
        <PrintablePO
          order={printPo.order}
          items={printPo.items}
          vendorName={vendorName}
          onClose={() => setPrintPo(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Analytics, stock alerts &amp; purchase orders.</p>
        </div>
        <Button onClick={() => setPoOpen(true)}>
          <ShoppingCart className="w-4 h-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">${(summary?.totalValue || 0).toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{summary?.totalProducts || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-amber-500">{summary?.lowStockCount || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-destructive">{summary?.outOfStockCount || 0}</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1" />Alerts</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Stock Levels</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Reorder Point</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyticsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading…</TableCell></TableRow>
                ) : !analytics?.products?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><PackageOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />No products found.</TableCell></TableRow>
                ) : analytics.products.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.sku}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-right font-mono">{p.stockQuantity}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.lowStockThreshold}</TableCell>
                    <TableCell>{stockBadge(p.stockPercent ?? null)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Analytics tab ─────────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Sales Velocity</CardTitle>
              <div className="flex gap-1">
                {(["daily", "weekly", "monthly"] as const).map(p => (
                  <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize">{p}</Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Loading analytics…</div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>No sales movement recorded yet.</p></div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="units" name="Units sold" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Fast Movers</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!analytics?.fastMovers?.length ? (
                  <p className="text-sm text-muted-foreground">No movement data yet.</p>
                ) : analytics.fastMovers.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                      <span className="font-medium text-sm">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{p.monthlyUnits} <span className="text-muted-foreground font-normal">/ 30d</span></div>
                      <div className="text-xs text-muted-foreground">{p.weeklyUnits}/wk · {p.dailyUnits}/day</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-amber-500" />Slow Movers (0 sales / 30d)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!analytics?.slowMovers?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">All products are moving! 🎉</p>
                ) : analytics.slowMovers.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.category} · {p.stockQuantity} in stock</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-muted-foreground">${(p.stockQuantity * p.price).toFixed(0)} idle</div>
                      {p.stockPercent !== null && stockBadge(p.stockPercent)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Purchase Orders tab ───────────────────────────────────────────── */}
        <TabsContent value="purchase-orders" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Purchase Orders</CardTitle>
              <Button size="sm" onClick={() => setPoOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />New PO
              </Button>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!purchaseOrders?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />No purchase orders yet.</TableCell></TableRow>
                ) : (purchaseOrders as unknown as Array<Record<string, unknown>>).map(po => (
                  <TableRow key={po.id as number}>
                    <TableCell className="font-mono text-sm">{po.orderNumber as string}</TableCell>
                    <TableCell>{po.supplierName as string}</TableCell>
                    <TableCell>{statusBadge(po.status as string)}</TableCell>
                    <TableCell className="text-right font-semibold">{po.currency as string} {(po.totalAmount as number).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{format(new Date(po.createdAt as string), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" title="Print / Save PDF" onClick={() => {
                          // Load detail and open print view
                          fetch(`${BASE_URL}/api/purchase-orders/${po.id as number}`, { credentials: "include" })
                            .then(r => r.json())
                            .then(detail => setPrintPo({ order: detail, items: detail.items }));
                        }}><FileText className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Email to supplier" onClick={() => {
                          setEmailPoId(po.id as number);
                          setEmailTo((po.supplierEmail as string) ?? "");
                          setEmailPoOpen(true);
                        }}><Mail className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" title="Mark received" onClick={async () => {
                          await updatePo.mutateAsync({ id: po.id as number, data: { status: "received" } as PurchaseOrderUpdate });
                          qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
                          toast.success("Marked as received");
                        }} disabled={po.status === "received"}><ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" /></Button>
                        <Button size="sm" variant="ghost" title="Delete" onClick={async () => {
                          if (!confirm("Delete this purchase order?")) return;
                          await deletePo.mutateAsync({ id: po.id as number });
                          qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
                          toast.success("Deleted");
                        }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Transactions tab ──────────────────────────────────────────────── */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading…</TableCell></TableRow>
                ) : !transactions?.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground"><PackageOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />No transactions recorded.</TableCell></TableRow>
                ) : transactions.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.type === "in" ? <ArrowDownRight className="w-4 h-4 text-emerald-500" /> : t.type === "out" ? <ArrowUpRight className="w-4 h-4 text-destructive" /> : <PackageOpen className="w-4 h-4 text-amber-500" />}
                        <span className="font-medium capitalize">{t.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>Prod #{t.productId}</TableCell>
                    <TableCell><span className={t.type === "in" ? "text-emerald-500 font-bold" : t.type === "out" ? "text-destructive font-bold" : "font-bold"}>{t.type === "in" ? "+" : t.type === "out" ? "-" : ""}{t.quantity}</span></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.reference || "-"}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy h:mm a")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Alert Settings tab ────────────────────────────────────────────── */}
        <TabsContent value="settings">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Stock Alert Preferences</CardTitle>
              <p className="text-sm text-muted-foreground">Choose which stock-level thresholds trigger in-app and push notifications.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />Warning — stock at 60% of max</div>
                  <div className="text-sm text-muted-foreground">Early notice to plan restocking</div>
                </div>
                <Switch
                  checked={alertSettings?.alert60Enabled ?? true}
                  onCheckedChange={(v) => handleToggleAlert("alert60Enabled", v)}
                  disabled={updateAlerts.isPending}
                />
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" />Low — stock at 40% of max</div>
                  <div className="text-sm text-muted-foreground">Act now to avoid stockouts</div>
                </div>
                <Switch
                  checked={alertSettings?.alert40Enabled ?? true}
                  onCheckedChange={(v) => handleToggleAlert("alert40Enabled", v)}
                  disabled={updateAlerts.isPending}
                />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />Critical — stock at 20% of max</div>
                  <div className="text-sm text-muted-foreground">Urgent — nearly out of stock</div>
                </div>
                <Switch
                  checked={alertSettings?.alert20Enabled ?? true}
                  onCheckedChange={(v) => handleToggleAlert("alert20Enabled", v)}
                  disabled={updateAlerts.isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Alerts fire once per threshold crossing. Stock must recover above 70% before the cycle resets. Set a product's "Max Stock" value to enable percentage-based alerts for it.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Create PO Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={poOpen} onOpenChange={v => { if (!v) { resetPo(); } setPoOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Supplier Name *</Label><Input value={poSupplierName} onChange={e => setPoSupplierName(e.target.value)} placeholder="e.g. ABC Suppliers Ltd." /></div>
              <div className="space-y-1.5"><Label>Supplier Email</Label><Input type="email" value={poSupplierEmail} onChange={e => setPoSupplierEmail(e.target.value)} placeholder="orders@supplier.com" /></div>
              <div className="space-y-1.5"><Label>Supplier Phone</Label><Input value={poSupplierPhone} onChange={e => setPoSupplierPhone(e.target.value)} placeholder="+234..." /></div>
              <div className="space-y-1.5 col-span-2"><Label>Supplier Address</Label><Input value={poSupplierAddress} onChange={e => setPoSupplierAddress(e.target.value)} placeholder="Optional" /></div>
            </div>

            <div className="space-y-2">
              <Label>Items *</Label>
              {poItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Select value={item.productId || ""} onValueChange={v => {
                      const prod = (products as unknown as Array<Record<string, unknown>>)?.find(p => String(p.id) === v);
                      setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, productId: v, description: prod ? String(prod.name) : it.description, unitPrice: prod ? String(prod.costPrice ?? prod.price) : it.unitPrice } : it));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Product (optional)" /></SelectTrigger>
                      <SelectContent>
                        {(products as unknown as Array<Record<string, unknown>>)?.map(p => <SelectItem key={String(p.id)} value={String(p.id)}>{String(p.name)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input placeholder="Description *" value={item.description} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" placeholder="Unit price" value={item.unitPrice} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it))} />
                  </div>
                  <div className="col-span-1">
                    <Button variant="ghost" size="icon" onClick={() => setPoItems(prev => prev.filter((_, i) => i !== idx))} disabled={poItems.length <= 1}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPoItems(prev => [...prev, { productId: "", description: "", quantity: "1", unitPrice: "" }])}>+ Add Item</Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Currency</Label>
                <Select value={poCurrency} onValueChange={setPoCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "NGN", "GBP", "EUR", "GHS", "KES", "ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Tax Rate (%)</Label><Input type="number" min="0" max="100" step="0.1" value={poTaxRate} onChange={e => setPoTaxRate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Total</Label><div className="h-9 px-3 py-2 rounded-md border bg-muted text-sm font-semibold">{poCurrency} {poTotal.toFixed(2)}</div></div>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={poNotes} onChange={e => setPoNotes(e.target.value)} rows={2} placeholder="Optional notes for this order…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePo} disabled={createPo.isPending || !poSupplierName}>
              {createPo.isPending ? "Creating…" : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email PO Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={emailPoOpen} onOpenChange={setEmailPoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Email Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Recipient Email</Label><Input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="supplier@email.com" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailPoOpen(false)}>Cancel</Button>
            <Button onClick={handleEmailPo} disabled={emailPo.isPending || !emailTo}>
              {emailPo.isPending ? "Sending…" : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
