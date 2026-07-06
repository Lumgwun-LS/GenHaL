import { useListOrders, useGetOrdersSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Orders() {
  const [search, setSearch] = useState("");
  const { data: orders, isLoading } = useListOrders({ search });
  const { data: summary } = useGetOrdersSummary();

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">View and manage sales orders.</p>
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
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input 
            placeholder="Search customer or order ID..." 
            className="pl-9 max-w-sm" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading orders...</TableCell>
              </TableRow>
            ) : orders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">No orders found.</TableCell>
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
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
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
    </div>
  );
}