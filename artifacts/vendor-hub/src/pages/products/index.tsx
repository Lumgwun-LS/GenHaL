import { useListProducts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function Products() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useListProducts({ search });

  const lowStockCount = products?.filter(p => p.stockQuantity <= (p.lowStockThreshold || 10)).length || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your unified product catalog.</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {lowStockCount > 0 && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <span className="font-bold">{lowStockCount} products</span> are running low on stock. Check inventory immediately.
          </div>
        </div>
      )}

      <Card>
        <div className="p-4 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
          <Input 
            placeholder="Search SKU or name..." 
            className="pl-9 max-w-sm" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading products...</TableCell>
              </TableRow>
            ) : products?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">No products found.</TableCell>
              </TableRow>
            ) : (
              products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{product.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">${product.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.stockQuantity <= (product.lowStockThreshold || 10) ? "destructive" : "outline"}>
                      {product.stockQuantity} {product.unit || 'units'}
                    </Badge>
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