import { useGetVendor, useListSocialAccounts, useListOrders, getGetVendorQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Building2, Globe, Mail, Phone, MapPin } from "lucide-react";

export default function VendorDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  
  const { data: vendor, isLoading } = useGetVendor(id, { query: { enabled: !!id, queryKey: getGetVendorQueryKey(id) } });
  const { data: socials } = useListSocialAccounts({ vendorId: id });
  const { data: orders } = useListOrders({ vendorId: id });

  if (isLoading) return <div className="p-8">Loading vendor profile...</div>;
  if (!vendor) return <div className="p-8">Vendor not found</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/vendors"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{vendor.name}</h1>
            <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>{vendor.status}</Badge>
          </div>
          <p className="text-muted-foreground">{vendor.industry}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{vendor.email}</span>
            </div>
            {vendor.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{vendor.phone}</span>
              </div>
            )}
            {vendor.website && (
              <div className="flex items-center gap-3 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <a href={vendor.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {vendor.website}
                </a>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{vendor.address}</span>
              </div>
            )}
            {vendor.description && (
              <div className="pt-4 border-t mt-4 text-sm text-muted-foreground">
                {vendor.description}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Connected Social Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {socials?.length ? (
                <div className="grid grid-cols-2 gap-4">
                  {socials.map(s => (
                    <div key={s.id} className="p-4 border rounded-lg flex items-center justify-between">
                      <div>
                        <div className="font-medium capitalize">{s.platform}</div>
                        <div className="text-sm text-muted-foreground">@{s.accountName}</div>
                      </div>
                      {s.followersCount != null && (
                        <div className="text-sm font-semibold">{s.followersCount.toLocaleString()} followers</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No connected accounts.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders?.slice(0, 5).map(o => (
                  <TableRow key={o.id}>
                    <TableCell>#{o.id}</TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                    <TableCell className="text-right font-medium">${o.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {!orders?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No orders found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}