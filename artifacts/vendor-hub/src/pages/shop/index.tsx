import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Store, Check, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type ShopProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  unit: string | null;
  inStock: boolean;
};

type PaymentProvider = "stripe" | "paystack" | "remita" | "flutterwave" | "nomba";

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  paystack: "Paystack",
  stripe: "Card (Stripe)",
  flutterwave: "Flutterwave",
  nomba: "Nomba",
  remita: "Remita",
};

type ShopLink = {
  linkMode: "interest" | "checkout";
  vendor: {
    id: number;
    name: string;
    logoUrl: string | null;
    brandTheme: string;
    defaultCurrency: string;
    availableProviders: PaymentProvider[];
  };
  products: ShopProduct[];
};

async function fetchLink(token: string): Promise<ShopLink> {
  const res = await fetch(`${BASE_URL}/api/public/post-links/${token}`);
  if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "error");
  return res.json();
}

export default function ShopLinkPage() {
  const { token = "" } = useParams();
  const { data: link, isLoading, error } = useQuery({
    queryKey: ["post-link", token],
    queryFn: () => fetchLink(token),
    enabled: !!token,
    retry: false,
  });

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (error || !link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 text-center px-4">
        <Store className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This link isn't available anymore</h1>
        <p className="text-muted-foreground text-sm">Ask the vendor to share an updated post.</p>
      </div>
    );
  }

  const qty = (id: number) => quantities[id] ?? 1;
  const setQty = (id: number, value: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(1, value) }));

  const selectedForCheckout = link.products.filter((p) => p.inStock);

  const submitInterest = async () => {
    if (!name || (!email && !phone)) {
      toast.error("Please enter your name and an email or phone number");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/public/post-links/${token}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined, message: message || undefined }),
      });
      if (!res.ok) throw new Error("failed");
      setDone(true);
    } catch {
      toast.error("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const providers = link.vendor.availableProviders;
  const activeProvider = selectedProvider && providers.includes(selectedProvider) ? selectedProvider : providers[0];

  const submitCheckout = async () => {
    if (!name || !email) {
      toast.error("Please enter your name and email");
      return;
    }
    if (!activeProvider) {
      toast.error("This vendor has no payment method configured yet.");
      return;
    }
    const items = link.products
      .filter((p) => (quantities[p.id] ?? 0) > 0 && p.inStock)
      .map((p) => ({ productId: p.id, quantity: qty(p.id) }));
    if (items.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/public/post-links/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone || undefined,
          items,
          provider: activeProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong — please try again.");
      setSubmitting(false);
    }
  };

  const total = selectedForCheckout.reduce((sum, p) => sum + (quantities[p.id] ? p.price * qty(p.id) : 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          {link.vendor.logoUrl ? (
            <img src={link.vendor.logoUrl} alt={link.vendor.name} className="w-12 h-12 rounded-xl object-cover border" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">
              {link.vendor.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold">{link.vendor.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Shop this post
            </div>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center text-center gap-3 py-16">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold">Thanks, {name}!</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              {link.vendor.name} will reach out to you shortly about your interest.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3">
              {link.products.map((p) => (
                <div key={p.id} className="flex items-center gap-4 rounded-lg border p-3">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-md object-cover border shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>}
                    <div className="text-sm font-semibold mt-1">
                      ${p.price.toFixed(2)}{p.unit ? ` / ${p.unit}` : ""}
                      {!p.inStock && <span className="ml-2 text-xs text-destructive font-normal">Out of stock</span>}
                    </div>
                  </div>
                  {link.linkMode === "checkout" && p.inStock && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQty(p.id, qty(p.id) - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-5 text-center text-sm">{quantities[p.id] ?? 0}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQty(p.id, (quantities[p.id] ?? 0) + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {link.linkMode === "interest" && (
                <Textarea placeholder="Anything you'd like to add? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
              )}

              {link.linkMode === "checkout" && total > 0 && (
                <div className="flex justify-between text-sm font-medium pt-1">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              )}

              {link.linkMode === "checkout" && providers.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-xs font-medium text-muted-foreground">Pay with</div>
                  <div className="flex flex-wrap gap-2">
                    {providers.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelectedProvider(p)}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          activeProvider === p
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-input text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {PROVIDER_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {link.linkMode === "checkout" && providers.length === 0 && (
                <p className="text-sm text-destructive">This vendor has no payment method configured yet.</p>
              )}

              <Button
                className="w-full"
                disabled={submitting || (link.linkMode === "checkout" && providers.length === 0)}
                onClick={link.linkMode === "checkout" ? submitCheckout : submitInterest}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : link.linkMode === "checkout" ? (
                  "Continue to payment"
                ) : (
                  "I'm interested"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
