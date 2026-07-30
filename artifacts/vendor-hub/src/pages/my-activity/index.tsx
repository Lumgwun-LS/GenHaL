/**
 * My Activity — cross-vendor customer portal.
 *
 * A customer enters their email address and sees all their orders and blog
 * comments across every vendor on the Awajimaa / Awa Biz Suite platform.
 * Each item links directly to the relevant store or blog post.
 */

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import {
  ShoppingBag, MessageSquare, Search, Loader2,
  CheckCircle2, Clock, XCircle, Package, ExternalLink,
  Store, ChevronRight, AlertCircle, Mail, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";

// ── types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface CustomerOrder {
  id: number;
  vendorName: string;
  vendorLogoUrl: string | null;
  status: string;
  paymentStatus: string;
  currency: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  storeUrl: string | null;
  items: OrderItem[];
}

interface CustomerComment {
  id: number;
  body: string;
  createdAt: string;
  postTitle: string;
  postStatus: string;
  vendorName: string;
  vendorLogoUrl: string | null;
  postUrl: string | null;
}

interface ActivityData {
  email: string;
  orders: CustomerOrder[];
  comments: CustomerComment[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function orderStatusBadge(status: string, paymentStatus: string) {
  if (paymentStatus === "paid")
    return <Badge className="bg-green-500/15 text-green-700 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>;
  if (status === "cancelled")
    return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
  if (paymentStatus === "failed")
    return <Badge className="bg-red-500/10 text-red-600 border-red-300"><XCircle className="w-3 h-3 mr-1" />Payment failed</Badge>;
  return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── component ────────────────────────────────────────────────────────────────

export default function MyActivityPage() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load if ?email= is in the URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get("email");
    if (urlEmail) {
      setEmail(urlEmail);
      setSubmittedEmail(urlEmail);
      fetchActivity(urlEmail);
    }
  }, []);

  async function fetchActivity(emailToLoad: string) {
    if (!emailToLoad.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `${BASE_URL}api/public/my-activity?email=${encodeURIComponent(emailToLoad.trim())}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to load activity");
        return;
      }
      const json = await res.json();
      setData(json);
      // Update URL without re-navigating
      const url = new URL(window.location.href);
      url.searchParams.set("email", emailToLoad.trim());
      window.history.replaceState({}, "", url.toString());
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmittedEmail(email);
    fetchActivity(email);
  }

  const pendingOrders = data?.orders.filter((o: CustomerOrder) => o.status === "pending" && o.paymentStatus !== "paid") ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">My Activity</h1>
            <p className="text-sm text-muted-foreground">View your orders and blog comments across all vendors</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* ── Email lookup form ── */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onInput={(e: any) => setEmail(e.currentTarget.value)}
                  required
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={loading || !email.trim()}>
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Search className="w-4 h-4" />
                }
                <span className="ml-2 hidden sm:inline">Look up</span>
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              Enter the email address you used when placing orders or leaving blog comments.
            </p>
          </CardContent>
        </Card>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border bg-destructive/5 border-destructive/20 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Results ── */}
        {data && !loading && (
          <>
            {/* Pending orders banner */}
            {pendingOrders.length > 0 && (
              <div className="rounded-lg border bg-amber-500/10 border-amber-500/20 px-4 py-3 flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {pendingOrders.length === 1
                      ? "You have 1 pending order"
                      : `You have ${pendingOrders.length} pending orders`}
                  </p>
                  <p className="text-xs text-amber-700">Complete payment to confirm your order.</p>
                </div>
              </div>
            )}

            {data.orders.length === 0 && data.comments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  <Package className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">No activity found for <strong>{data.email}</strong></p>
                  <p className="text-xs text-muted-foreground">Try the email address you used when shopping or commenting.</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="orders">
                <TabsList className="grid grid-cols-2 w-full max-w-xs">
                  <TabsTrigger value="orders" className="gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Orders
                    {data.orders.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">{data.orders.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Comments
                    {data.comments.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">{data.comments.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* ── Orders Tab ── */}
                <TabsContent value="orders" className="mt-4 space-y-3">
                  {data.orders.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No orders found</p>
                      </CardContent>
                    </Card>
                  ) : (
                    data.orders.map((order: CustomerOrder) => (
                      <Card key={order.id} className="overflow-hidden">
                        <CardHeader className="pb-3 pt-4 px-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {order.vendorLogoUrl ? (
                                <img src={order.vendorLogoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Store className="w-3.5 h-3.5 text-primary" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{order.vendorName}</p>
                                <p className="text-xs text-muted-foreground">Order #{order.id} · {formatDate(order.createdAt)}</p>
                              </div>
                            </div>
                            {orderStatusBadge(order.status, order.paymentStatus)}
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-3">
                          {/* Items */}
                          <div className="space-y-1">
                            {order.items.map((item: OrderItem, i: number) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground truncate mr-2">
                                  {item.productName}
                                  <span className="text-muted-foreground/60"> × {item.quantity}</span>
                                </span>
                                <span className="shrink-0 font-medium">{order.currency} {item.totalPrice}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-sm font-semibold border-t pt-2 mt-2">
                              <span>Total</span>
                              <span>{order.currency} {order.totalAmount}</span>
                            </div>
                          </div>

                          {/* Action */}
                          {order.storeUrl && (
                            <a
                              href={order.storeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/15 px-3 py-2 transition-colors"
                            >
                              <span className="text-xs font-medium text-primary">
                                {order.paymentStatus === "paid" ? "Visit the store again" : "Complete your purchase"}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5 text-primary" />
                            </a>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                {/* ── Comments Tab ── */}
                <TabsContent value="comments" className="mt-4 space-y-3">
                  {data.comments.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No blog comments found</p>
                      </CardContent>
                    </Card>
                  ) : (
                    data.comments.map((comment: CustomerComment) => (
                      <Card key={comment.id}>
                        <CardContent className="pt-4 px-4 pb-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {comment.vendorLogoUrl ? (
                                <img src={comment.vendorLogoUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Store className="w-3 h-3 text-primary" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{comment.vendorName}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</p>
                              </div>
                            </div>
                            {comment.postStatus !== "published" && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">Draft</Badge>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-0.5">{comment.postTitle}</p>
                            <p className="text-sm text-foreground line-clamp-3">{comment.body}</p>
                          </div>

                          {comment.postUrl && (
                            <a
                              href={comment.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              Read the post <ChevronRight className="w-3 h-3" />
                            </a>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}

            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => fetchActivity(submittedEmail)}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
