import { useGetVendor, useListSocialAccounts, useListOrders, getGetVendorQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Globe, Mail, Phone, MapPin, CreditCard } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "ZAR", label: "ZAR — South African Rand" },
];

export default function VendorDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");

  const { data: vendor, isLoading } = useGetVendor(id, { query: { enabled: !!id, queryKey: getGetVendorQueryKey(id) } });
  const { data: socials } = useListSocialAccounts({ vendorId: id });
  const { data: orders } = useListOrders({ vendorId: id });

  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setStripeEnabled(vendor.stripeEnabled ?? false);
      setPaystackEnabled(vendor.paystackEnabled ?? false);
      setDefaultCurrency(vendor.defaultCurrency ?? "USD");
    }
  }, [vendor]);

  async function handleSavePaymentSettings() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${id}/payment-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stripeEnabled, paystackEnabled, defaultCurrency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error ?? "Failed to save payment settings");
        return;
      }
      toast.success("Payment settings saved");
    } catch {
      toast.error("Network error — could not save payment settings");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="md:col-span-1 space-y-8">
          <Card>
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

          {/* Payment Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Payment Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="stripe-toggle" className="text-sm font-medium">Stripe</Label>
                  <p className="text-xs text-muted-foreground">Accept card payments via Stripe</p>
                </div>
                <Switch
                  id="stripe-toggle"
                  checked={stripeEnabled}
                  onCheckedChange={setStripeEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="paystack-toggle" className="text-sm font-medium">Paystack</Label>
                  <p className="text-xs text-muted-foreground">Accept payments via Paystack</p>
                </div>
                <Switch
                  id="paystack-toggle"
                  checked={paystackEnabled}
                  onCheckedChange={setPaystackEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Default Currency</Label>
                <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleSavePaymentSettings}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Payment Settings"}
              </Button>
            </CardContent>
          </Card>
        </div>

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
