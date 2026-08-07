import { useGetOrder, getGetOrderQueryKey, useUpdateOrder, useListBranches, useListWorkers, getListBranchesQueryKey, getListWorkersQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mail, Phone, MapPin, Printer, Truck, CheckCircle, Copy, ExternalLink, Package, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const DELIVERY_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "disputed", label: "Disputed" },
];

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  out_for_delivery: "bg-purple-100 text-purple-700",
  delivered: "bg-emerald-100 text-emerald-700",
  confirmed: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-700",
};

export default function OrderDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const { data: order, isLoading } = useGetOrder(id, { query: { enabled: !!id, queryKey: getGetOrderQueryKey(id) } });
  const updateOrder = useUpdateOrder();
  const queryClient = useQueryClient();

  const branchListParams = { vendorId: order?.vendorId as number };
  const { data: branches } = useListBranches(branchListParams, {
    query: { enabled: Boolean(order?.vendorId), queryKey: getListBranchesQueryKey(branchListParams) },
  });
  const workerListParams = { vendorId: order?.vendorId as number };
  const { data: workers } = useListWorkers(workerListParams, {
    query: { enabled: Boolean(order?.vendorId), queryKey: getListWorkersQueryKey(workerListParams) },
  });

  // Delivery tracking state
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);

  if (isLoading) return <div className="p-8">Loading order...</div>;
  if (!order) return <div className="p-8">Order not found</div>;

  // Extend order type with new fulfillment fields
  const ext = order as typeof order & {
    deliveryStatus?: string;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    customerConfirmedAt?: string | null;
    refundNote?: string | null;
    receiptToken?: string | null;
  };

  const currentDelivery = deliveryStatus || ext.deliveryStatus || "pending";
  const statusColor = DELIVERY_STATUS_COLORS[currentDelivery] ?? "bg-gray-100 text-gray-700";

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateOrder.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      toast.success(`Order marked as ${status}`);
    } catch (e) {
      toast.error("Failed to update order");
    }
  };

  const handleAssign = async (field: "branchId" | "workerId", value: string) => {
    try {
      await updateOrder.mutateAsync({ id, data: { [field]: value !== "none" ? Number(value) : null } });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      toast.success("Order updated");
    } catch {
      toast.error("Failed to update order");
    }
  };

  async function handleSaveDelivery() {
    if (!currentDelivery) return;
    setDeliverySaving(true);
    try {
      const body: Record<string, unknown> = { deliveryStatus: currentDelivery };
      if (trackingNumber || ext.trackingNumber) body.trackingNumber = trackingNumber || ext.trackingNumber || "";
      if (trackingUrl || ext.trackingUrl) body.trackingUrl = trackingUrl || ext.trackingUrl || "";
      if (refundNote || ext.refundNote) body.refundNote = refundNote || ext.refundNote || "";

      const r = await fetch(`${BASE_URL}/api/orders/${id}/delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error ?? "Update failed"); return; }
      toast.success("Delivery status updated — customer has been notified by email");
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
    } catch {
      toast.error("Network error");
    } finally {
      setDeliverySaving(false);
    }
  }

  function copyReceiptLink() {
    if (!ext.receiptToken) { toast.error("Save delivery status first to generate the receipt link"); return; }
    const origin = window.location.origin;
    navigator.clipboard.writeText(`${origin}/confirm-receipt/${ext.receiptToken}`);
    toast.success("Receipt confirmation link copied to clipboard");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/orders"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Order #{order.id}</h1>
              <Badge variant="outline" className="uppercase text-xs">{order.status}</Badge>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
                📦 {DELIVERY_STATUSES.find(s => s.value === currentDelivery)?.label ?? ext.deliveryStatus ?? "Pending"}
              </span>
            </div>
            <p className="text-muted-foreground">{format(new Date(order.createdAt), 'MMMM do, yyyy h:mm a')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon"><Printer className="w-4 h-4" /></Button>
          {order.status !== 'completed' && (
            <Button onClick={() => handleUpdateStatus('completed')} className="bg-emerald-600 hover:bg-emerald-700">Mark Completed</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items?.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-right">${item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-bold">${item.totalPrice.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-6 border-t flex justify-end">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${order.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax & Shipping</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-3 border-t">
                  <span>Total</span>
                  <span className="text-primary">${order.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Delivery Tracking Card ─────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Delivery & Fulfillment Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer confirmed */}
              {ext.customerConfirmedAt && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-medium">Customer confirmed receipt</div>
                    <div className="text-xs">{format(new Date(ext.customerConfirmedAt), "PPP p")}</div>
                  </div>
                </div>
              )}

              {/* Disputed */}
              {ext.deliveryStatus === "disputed" && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <div className="font-medium">Dispute raised — customer hasn't confirmed receipt</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery Status</Label>
                  <Select
                    value={deliveryStatus || ext.deliveryStatus || "pending"}
                    onValueChange={setDeliveryStatus}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DELIVERY_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tracking Number</Label>
                  <Input
                    placeholder="e.g. DHL-12345"
                    defaultValue={ext.trackingNumber ?? ""}
                    onChange={e => setTrackingNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tracking URL (optional)</Label>
                <Input
                  placeholder="https://track.dhl.com/..."
                  defaultValue={ext.trackingUrl ?? ""}
                  onChange={e => setTrackingUrl(e.target.value)}
                />
              </div>

              {(currentDelivery === "delivered" || currentDelivery === "disputed") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Note to Customer (for refunds / disputes)</Label>
                  <Textarea
                    placeholder="Explain the refund or dispute resolution..."
                    defaultValue={ext.refundNote ?? ""}
                    onChange={e => setRefundNote(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveDelivery} disabled={deliverySaving} className="flex-1">
                  {deliverySaving ? "Saving..." : "Save & Notify Customer"}
                </Button>
                <Button variant="outline" onClick={copyReceiptLink} className="gap-2">
                  <Copy className="w-3.5 h-3.5" />
                  Copy Receipt Link
                </Button>
              </div>

              {/* Timeline */}
              {(ext.shippedAt || ext.deliveredAt || ext.customerConfirmedAt) && (
                <div className="border-t pt-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timeline</div>
                  <div className="space-y-2 text-sm">
                    {ext.shippedAt && (
                      <div className="flex items-center gap-3">
                        <Package className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-muted-foreground">Shipped</span>
                        <span className="ml-auto font-medium">{format(new Date(ext.shippedAt), "PP p")}</span>
                      </div>
                    )}
                    {ext.deliveredAt && (
                      <div className="flex items-center gap-3">
                        <Truck className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-muted-foreground">Delivered</span>
                        <span className="ml-auto font-medium">{format(new Date(ext.deliveredAt), "PP p")}</span>
                      </div>
                    )}
                    {ext.customerConfirmedAt && (
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-muted-foreground">Customer confirmed</span>
                        <span className="ml-auto font-medium">{format(new Date(ext.customerConfirmedAt), "PP p")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="font-medium text-base">{order.customerName}</div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{order.customerEmail}</span>
              </div>
              {order.customerPhone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{order.customerPhone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="leading-relaxed whitespace-pre-wrap">
                  {order.shippingAddress || "No shipping address provided."}
                </span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Branch</Label>
                <Select value={order.branchId ? String(order.branchId) : "none"} onValueChange={(v) => handleAssign("branchId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Worker</Label>
                <Select value={order.workerId ? String(order.workerId) : "none"} onValueChange={(v) => handleAssign("workerId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {workers?.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-sm">Order Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {order.notes}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
