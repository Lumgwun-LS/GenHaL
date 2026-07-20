import { useGetVendor, useListSocialAccounts, useListOrders, getGetVendorQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState, useEffect } from "react";
import VendorPaymentAccounts from "@/components/vendor-payment-accounts";
import UpgradePlanCard, { syncSubscriptionStatus } from "@/components/upgrade-plan-card";
import BillingHistoryCard from "@/components/billing-history-card";
import UsageSummaryCard from "@/components/usage-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Globe, Mail, Phone, MapPin, CreditCard, Cake, PhoneOff, Palette, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BrandTheme = {
  id: string;
  label: string;
  primary: string;
  accent: string;
  gradientFrom: string;
  gradientTo: string;
};

async function fetchBrandThemes(): Promise<BrandTheme[]> {
  const res = await fetch(`${BASE_URL}/api/public/brand-themes`);
  if (!res.ok) throw new Error("Failed to load brand themes");
  return res.json();
}

type GatewayAvailability = { provider: string; available: boolean; reason: string | null };

async function fetchPaymentAvailability(vendorId: number): Promise<GatewayAvailability[]> {
  const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-availability`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payment availability");
  const data = await res.json();
  return data.gateways ?? [];
}

/** Only ever render http(s) links — blocks javascript:/data: URLs stored on a vendor's website field. */
function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    // not a valid absolute URL
  }
  return null;
}

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
  const queryClient = useQueryClient();

  const { data: vendor, isLoading, refetch: refetchVendor } = useGetVendor(id, { query: { enabled: !!id, queryKey: getGetVendorQueryKey(id) } });
  const { data: socials } = useListSocialAccounts({ vendorId: id });
  const { data: orders } = useListOrders({ vendorId: id });
  const { data: brandThemes } = useQuery({ queryKey: ["brand-themes"], queryFn: fetchBrandThemes });
  const { data: paymentAvailability } = useQuery({
    queryKey: ["vendor-payment-availability", id],
    queryFn: () => fetchPaymentAvailability(id),
    enabled: !!id,
  });
  const unavailableByProvider = new Map((paymentAvailability ?? []).filter((g) => !g.available).map((g) => [g.provider, g.reason]));

  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [remitaEnabled, setRemitaEnabled] = useState(false);
  const [flutterwaveEnabled, setFlutterwaveEnabled] = useState(false);
  const [nombaEnabled, setNombaEnabled] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [voiceCallOptOut, setVoiceCallOptOut] = useState(false);
  const [announcementEmailOptOut, setAnnouncementEmailOptOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  // Handle Stripe Checkout return. The webhook that normally applies the new
  // tier can be dropped or delayed, so rather than trust the success_url
  // param at face value we call the sync endpoint to reconcile against
  // Stripe directly — most cases self-heal here without the vendor ever
  // noticing anything went wrong.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    const tier = params.get("tier");
    if (upgrade === "success" && tier) {
      // Remove params from URL without a full reload
      window.history.replaceState({}, "", window.location.pathname);
      void (async () => {
        try {
          const result = await syncSubscriptionStatus(id);
          if (result.synced) {
            toast.success(`🎉 You're now on the ${result.currentTier.charAt(0).toUpperCase() + result.currentTier.slice(1)} plan! Your payment accounts are now unlocked.`);
          } else if (result.currentTier === tier) {
            // Webhook had already applied it by the time we checked.
            toast.success(`🎉 You're now on the ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan! Your payment accounts are now unlocked.`);
          } else {
            toast.info("Payment received — your billing status is still being confirmed. Use \"Refresh billing status\" below if it doesn't update shortly.");
          }
        } catch {
          toast.info("Payment received — your billing status is still being confirmed. Use \"Refresh billing status\" below if it doesn't update shortly.");
        } finally {
          void queryClient.invalidateQueries({ queryKey: getGetVendorQueryKey(id) });
        }
      })();
    } else if (upgrade === "cancelled") {
      toast.info("Upgrade cancelled — no charge was made.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (vendor) {
      setStripeEnabled(vendor.stripeEnabled ?? false);
      setPaystackEnabled(vendor.paystackEnabled ?? false);
      setRemitaEnabled(vendor.remitaEnabled ?? false);
      setFlutterwaveEnabled(vendor.flutterwaveEnabled ?? false);
      setNombaEnabled(vendor.nombaEnabled ?? false);
      setDefaultCurrency(vendor.defaultCurrency ?? "USD");
      setDateOfBirth(vendor.dateOfBirth ?? "");
      setVoiceCallOptOut(vendor.voiceCallOptOut ?? false);
      setAnnouncementEmailOptOut(vendor.announcementEmailOptOut ?? false);
    }
  }, [vendor]);

  async function handleSaveDateOfBirth() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dateOfBirth: dateOfBirth || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error ?? "Failed to save date of birth");
        return;
      }
      toast.success("Date of birth saved");
    } catch {
      toast.error("Network error — could not save date of birth");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBrandTheme(themeId: string) {
    setSavingTheme(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ brandTheme: themeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error ?? "Failed to save brand theme");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetVendorQueryKey(id) });
      toast.success("Storefront theme updated");
    } catch {
      toast.error("Network error — could not save brand theme");
    } finally {
      setSavingTheme(false);
    }
  }

  async function handleSavePaymentSettings() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${id}/payment-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          stripeEnabled,
          paystackEnabled,
          remitaEnabled,
          flutterwaveEnabled,
          nombaEnabled,
          defaultCurrency,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error ?? "Failed to save payment settings");
        return;
      }
      toast.success("Payment settings saved");
      // Immediately invalidate the cached payment-availability result so the
      // Social Hub checkout health warning reflects the updated credentials
      // without waiting for the 60-second stale-time window to expire.
      void queryClient.invalidateQueries({ queryKey: ["vendor-payment-availability", id] });
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
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{vendor.name}</h1>
            <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>{vendor.status}</Badge>
          </div>
          <p className="text-muted-foreground">{vendor.industry}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`${BASE_URL}/store/${id}`} target="_blank" rel="noreferrer">
            View public storefront <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </a>
        </Button>
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
              {safeExternalUrl(vendor.website) && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <a href={safeExternalUrl(vendor.website)!} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
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
              <div className="pt-4 border-t mt-4 space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Cake className="w-4 h-4 text-muted-foreground" />
                  Date of Birth
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleSaveDateOfBirth} disabled={saving}>
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Used to send a birthday greeting automatically.</p>
              </div>
              <div className="pt-4 border-t mt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <PhoneOff className="w-4 h-4 text-muted-foreground" />
                      Opt out of birthday calls
                    </Label>
                    <p className="text-xs text-muted-foreground">When on, no AI voice call will be placed on your birthday.</p>
                  </div>
                  <Switch
                    checked={voiceCallOptOut}
                    onCheckedChange={async (val) => {
                      setVoiceCallOptOut(val);
                      await fetch(`${BASE_URL}/api/vendors/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ voiceCallOptOut: val }),
                      });
                      toast.success(val ? "Birthday calls disabled" : "Birthday calls enabled");
                    }}
                  />
                </div>
              </div>
              <div className="pt-4 border-t mt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      Opt out of announcement emails
                    </Label>
                    <p className="text-xs text-muted-foreground">When on, you won't receive an email for admin announcements. You'll still see them in-app.</p>
                  </div>
                  <Switch
                    checked={announcementEmailOptOut}
                    onCheckedChange={async (val) => {
                      setAnnouncementEmailOptOut(val);
                      const res = await fetch(`${BASE_URL}/api/vendors/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ announcementEmailOptOut: val }),
                      });
                      if (!res.ok) {
                        setAnnouncementEmailOptOut(!val);
                        toast.error("Failed to update announcement email preference");
                        return;
                      }
                      toast.success(val ? "Announcement emails disabled" : "Announcement emails enabled");
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Storefront Theme */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Storefront Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Pick a brand color theme for your public storefront page. Changes apply immediately.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {brandThemes?.map((theme) => {
                  const selected = (vendor.brandTheme ?? "violet") === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      disabled={savingTheme}
                      onClick={() => handleSaveBrandTheme(theme.id)}
                      className={`relative rounded-lg border-2 p-2 text-left transition-colors disabled:opacity-60 ${
                        selected ? "border-primary" : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <div
                        className="h-10 w-full rounded-md mb-2"
                        style={{ background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})` }}
                      />
                      <div className="text-xs font-medium">{theme.label}</div>
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
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
              <div className="space-y-1.5">
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
                {stripeEnabled && unavailableByProvider.has("stripe") && (
                  <p className="text-xs text-destructive">Not offered to customers yet: {unavailableByProvider.get("stripe")}</p>
                )}
              </div>

              <div className="space-y-1.5">
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
                {paystackEnabled && unavailableByProvider.has("paystack") && (
                  <p className="text-xs text-destructive">Not offered to customers yet: {unavailableByProvider.get("paystack")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="remita-toggle" className="text-sm font-medium">Remita</Label>
                    <p className="text-xs text-muted-foreground">Accept payments via Remita</p>
                  </div>
                  <Switch
                    id="remita-toggle"
                    checked={remitaEnabled}
                    onCheckedChange={setRemitaEnabled}
                  />
                </div>
                {remitaEnabled && unavailableByProvider.has("remita") && (
                  <p className="text-xs text-destructive">Not offered to customers yet: {unavailableByProvider.get("remita")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="flutterwave-toggle" className="text-sm font-medium">Flutterwave</Label>
                    <p className="text-xs text-muted-foreground">Accept payments via Flutterwave</p>
                  </div>
                  <Switch
                    id="flutterwave-toggle"
                    checked={flutterwaveEnabled}
                    onCheckedChange={setFlutterwaveEnabled}
                  />
                </div>
                {flutterwaveEnabled && unavailableByProvider.has("flutterwave") && (
                  <p className="text-xs text-destructive">Not offered to customers yet: {unavailableByProvider.get("flutterwave")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="nomba-toggle" className="text-sm font-medium">Nomba</Label>
                    <p className="text-xs text-muted-foreground">Accept payments via Nomba</p>
                  </div>
                  <Switch
                    id="nomba-toggle"
                    checked={nombaEnabled}
                    onCheckedChange={setNombaEnabled}
                  />
                </div>
                {nombaEnabled && unavailableByProvider.has("nomba") && (
                  <p className="text-xs text-destructive">Not offered to customers yet: {unavailableByProvider.get("nomba")}</p>
                )}
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

          <VendorPaymentAccounts vendorId={id} />

          {/* Self-service plan upgrade + billing management (invoices, payment method, cancel) */}
          <UpgradePlanCard
            vendorId={id}
            currentTier={vendor.subscriptionTier ?? "free"}
            subscriptionProvider={vendor.subscriptionProvider ?? null}
            onUpgradeInitiated={() => void refetchVendor()}
          />

          <UsageSummaryCard vendorId={id} />

          <BillingHistoryCard vendorId={id} />
        </div>
      </div>
    </div>
  );
}
