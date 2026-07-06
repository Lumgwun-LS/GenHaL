import { useGetInventorySummary, useListInventoryTransactions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownRight, ArrowUpRight, Plus, PackageOpen } from "lucide-react";
import { format } from "date-fns";

export default function Inventory() {
  const { data: summary } = useGetInventorySummary();
  const { data: transactions, isLoading } = useListInventoryTransactions();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Track movements and warehouse stock.</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Record Transaction
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">${(summary?.totalValue || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{summary?.totalProducts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-amber-500">{summary?.lowStockCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-destructive">{summary?.outOfStockCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading history...</TableCell>
              </TableRow>
            ) : transactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <PackageOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No inventory transactions recorded.
                </TableCell>
              </TableRow>
            ) : (
              transactions?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.type === 'in' ? (
                        <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                      ) : t.type === 'out' ? (
                        <ArrowUpRight className="w-4 h-4 text-destructive" />
                      ) : (
                        <PackageOpen className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-medium capitalize">{t.type}</span>
                    </div>
                  </TableCell>
                  <TableCell>Prod #{t.productId}</TableCell>
                  <TableCell>
                    <span className={t.type === 'in' ? 'text-emerald-500 font-bold' : t.type === 'out' ? 'text-destructive font-bold' : 'font-bold'}>
                      {t.type === 'in' ? '+' : t.type === 'out' ? '-' : ''}{t.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.reference || '-'}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {format(new Date(t.createdAt), 'MMM d, yyyy h:mm a')}
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