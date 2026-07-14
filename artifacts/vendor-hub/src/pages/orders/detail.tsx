import { useGetOrder, getGetOrderQueryKey, useUpdateOrder, useListBranches, useListWorkers, getListBranchesQueryKey, getListWorkersQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, MapPin, Printer } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

  if (isLoading) return <div className="p-8">Loading order...</div>;
  if (!order) return <div className="p-8">Order not found</div>;

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateOrder.mutateAsync({
        id,
        data: { status }
      });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      toast.success(`Order marked as ${status}`);
    } catch (e) {
      toast.error("Failed to update order");
    }
  };

  const handleAssign = async (field: "branchId" | "workerId", value: string) => {
    try {
      await updateOrder.mutateAsync({
        id,
        data: { [field]: value !== "none" ? Number(value) : null },
      });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      toast.success("Order updated");
    } catch {
      toast.error("Failed to update order");
    }
  };

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
              <CardTitle>Fulfillment</CardTitle>
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