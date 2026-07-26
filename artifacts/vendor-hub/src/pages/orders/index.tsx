import { useListOrders, useGetOrdersSummary, useCreateOrder, useListVendors, useListBranches, useListWorkers, useListProducts, getListBranchesQueryKey, getListWorkersQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import { DateRangeFilterControl, BranchWorkerFilterControl } from "@/components/finance-filters";

const STATUSES = ["pending", "completed", "cancelled"];

export default function Orders() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;

  const qc = useQueryClient();
  const createOrder = useCreateOrder();
  const { data: products } = useListProducts({ vendorId: vendorId as number });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // New Order dialog state
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderItems, setOrderItems] = useState([{ productId: "", quantity: "1", unitPrice: "" }]);

  function resetNewOrder() {
    setCustomerName(""); setCustomerEmail(""); setOrderNotes("");
    setOrderItems([{ productId: "", quantity: "1", unitPrice: "" }]);
  }

  async function handleCreateOrder() {
    if (!vendorId || !customerName) return;
    if (!customerEmail) { toast.error("Customer email is required"); return; }
    const validItems = orderItems.filter(i => i.productId && i.productId !== "" && i.quantity && i.unitPrice);
    if (validItems.length === 0) { toast.error("Add at least one item with a product, quantity, and price"); return; }
    const items = validItems.map(i => ({
      productId: Number(i.productId),
      quantity: Number(i.quantity),
      unitPrice: parseFloat(i.unitPrice),
    }));
    try {
      await createOrder.mutateAsync({
        data: {
          vendorId,
          customerName,
          customerEmail,
          ...(orderNotes ? { notes: orderNotes } : {}),
          items: items as any,
        },
      });
      toast.success("Order created");
      setNewOrderOpen(false);
      resetNewOrder();
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey({}) });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create order");
    }
  }
  const [branchFilter, setBranchFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const dateFilter = useDateRangeFilter();

  const branchListParams = { vendorId: vendorId as number };
  const { data: branches } = useListBranches(branchListParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListBranchesQueryKey(branchListParams) },
  });
  const workerListParams = { vendorId: vendorId as number };
  const { data: workers } = useListWorkers(workerListParams, {
    query: { enabled: Boolean(vendorId), queryKey: getListWorkersQueryKey(workerListParams) },
  });

  const { data: orders, isLoading } = useListOrders({
    search,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(branchFilter !== "all" ? { branchId: Number(branchFilter) } : {}),
    ...(workerFilter !== "all" ? { workerId: Number(workerFilter) } : {}),
    ...(dateFilter.from ? { from: dateFilter.from } : {}),
    ...(dateFilter.to ? { to: dateFilter.to } : {}),
  });
  const { data: summary } = useGetOrdersSummary();

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  function branchName(id: number | null | undefined) {
    if (!id) return "—";
    return branches?.find((b) => b.id === id)?.name ?? "—";
  }
  function workerName(id: number | null | undefined) {
    if (!id) return "—";
    return workers?.find((w) => w.id === id)?.name ?? "—";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">View and manage sales orders.</p>
        </div>
        <Button onClick={() => setNewOrderOpen(true)} disabled={!vendorId}>
          <Plus className="w-4 h-4 mr-2" /> New Order
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{summary?.totalOrders || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-primary">${(summary?.totalRevenue || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-amber-500">{summary?.pendingOrders || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-emerald-500">{summary?.completedOrders || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5 relative">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Customer or order ID..."
                className="pl-9 w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <BranchWorkerFilterControl
            branches={branches} workers={workers}
            branchId={branchFilter} onBranchChange={setBranchFilter}
            workerId={workerFilter} onWorkerChange={setWorkerFilter}
          />
          <DateRangeFilterControl
            preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
            customFrom={dateFilter.customFrom} onCustomFromChange={dateFilter.setCustomFrom}
            customTo={dateFilter.customTo} onCustomToChange={dateFilter.setCustomTo}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">Loading orders...</TableCell>
              </TableRow>
            ) : orders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">No orders found.</TableCell>
              </TableRow>
            ) : (
              orders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium font-mono text-xs">#{order.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{order.customerName}</div>
                    <div className="text-xs text-muted-foreground">{order.customerEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(order.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{branchName(order.branchId)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{workerName(order.workerId)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                    {order.status === 'cancelled' && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {order.paymentStatus === 'cancelled'
                          ? 'Customer cancelled'
                          : order.paymentStatus === 'paid'
                          ? 'Cancelled after payment'
                          : order.paymentStatus === 'refunded'
                          ? 'Cancelled & refunded'
                          : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ${order.totalAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/orders/${order.id}`}><ExternalLink className="w-4 h-4" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* New Order Dialog */}
      <Dialog open={newOrderOpen} onOpenChange={v => { if (!v) resetNewOrder(); setNewOrderOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Customer Name *</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Fatima Bello" /></div>
              <div className="space-y-1.5"><Label>Customer Email *</Label><Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="e.g. customer@email.com" /></div>
            </div>

            <div className="space-y-2">
              <Label>Order Items *</Label>
              {orderItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={item.productId || ""} onValueChange={v => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, productId: v, unitPrice: String(products?.find(p => p.id === Number(v))?.price ?? it.unitPrice) } : it))}>
                    <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Select product *" /></SelectTrigger>
                    <SelectContent>
                      {products?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qty" className="w-16" value={item.quantity} onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))} />
                  <Input type="number" step="0.01" placeholder="Price" className="w-24" value={item.unitPrice} onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it))} />
                  <Button variant="ghost" size="icon" onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))} disabled={orderItems.length <= 1}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOrderItems(prev => [...prev, { productId: "", quantity: "1", unitPrice: "" }])}>+ Add Item</Button>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={2} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder} disabled={createOrder.isPending || !customerName || !customerEmail}>
              {createOrder.isPending ? "Creating…" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
