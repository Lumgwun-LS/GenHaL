import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUS_STYLE: Record<string, string> = {
  paid:               "bg-green-100 text-green-700",
  unpaid:             "bg-yellow-100 text-yellow-700",
  failed:             "bg-red-100 text-red-700",
  refunded:           "bg-gray-100 text-gray-600",
  partially_refunded: "bg-orange-100 text-orange-700",
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
          className="text-3xl transition-transform hover:scale-110"
          style={{ color: s <= (hovered || value) ? "#f59e0b" : "#e5e7eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >★</button>
      ))}
    </div>
  );
}

export default function CustomerOrderDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading } = useQuery({
    queryKey: ["customer-order", id],
    queryFn: () => fetch(`${BASE}/api/customer/orders/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  // Rating state
  const [rating, setRating]     = useState(0);
  const [review, setReview]     = useState("");
  const [ratingDone, setRatingDone] = useState(false);
  const [ratingErr, setRatingErr]   = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);

  // Complaint state
  const [cSubject, setCSubject] = useState("");
  const [cBody, setCBody]       = useState("");
  const [cEmail, setCEmail]     = useState("");
  const [cDone, setCDone]       = useState(false);
  const [cErr, setCErr]         = useState("");
  const [cLoading, setCLoading] = useState(false);

  // Refund state
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundErr, setRefundErr]         = useState("");
  const [refundDone, setRefundDone]       = useState(false);
  const [refundAmount, setRefundAmount]   = useState("");

  async function submitRating(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setRatingErr("Please select a star rating."); return; }
    setRatingLoading(true); setRatingErr("");
    try {
      const res = await fetch(`${BASE}/api/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: order.vendorId,
          orderId:  order.id,
          customerName:  order.customerName,
          customerEmail: order.customerEmail,
          rating,
          review: review.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRatingErr(data.error ?? "Failed to submit rating."); return; }
      setRatingDone(true);
    } catch { setRatingErr("Network error. Please try again."); }
    finally { setRatingLoading(false); }
  }

  async function submitComplaint(e: React.FormEvent) {
    e.preventDefault();
    if (!cEmail || !cSubject || !cBody) { setCErr("All fields are required."); return; }
    setCLoading(true); setCErr("");
    try {
      const res = await fetch(`${BASE}/api/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: order.vendorId,
          orderId:  order.id,
          customerName:  order.customerName,
          customerEmail: cEmail,
          subject: cSubject,
          body:    cBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCErr(data.error ?? "Failed to submit complaint."); return; }
      setCDone(true);
    } catch { setCErr("Network error. Please try again."); }
    finally { setCLoading(false); }
  }

  async function requestRefund(e: React.FormEvent) {
    e.preventDefault();
    setRefundLoading(true); setRefundErr("");
    try {
      const body: Record<string, unknown> = {};
      if (refundAmount && parseFloat(refundAmount) > 0) body.amount = parseFloat(refundAmount);
      const res = await fetch(`${BASE}/api/payments/${order.paymentId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setRefundErr(data.error ?? "Refund could not be processed."); return; }
      setRefundDone(true);
    } catch { setRefundErr("Network error. Please try again."); }
    finally { setRefundLoading(false); }
  }

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="p-6 text-muted-foreground animate-pulse">Loading order…</div>
      </CustomerLayout>
    );
  }

  if (!order || order.error) {
    return (
      <CustomerLayout>
        <div className="p-6 text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <p className="font-bold text-gray-800">Order not found</p>
          <Link href="/customer/orders" className="text-violet-600 text-sm hover:underline mt-2 block">← Back to orders</Link>
        </div>
      </CustomerLayout>
    );
  }

  const isPaid     = order.paymentStatus === "paid";
  const isRefunded = ["refunded", "partially_refunded"].includes(order.paymentStatus);
  const totalAmt   = parseFloat(order.totalAmount);

  return (
    <CustomerLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <Link href="/customer/orders" className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1 mb-6">
          ← Back to orders
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Order #{order.id}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {new Date(order.createdAt).toLocaleString()}
                {order.source === "site" ? " · Website Shop" : order.source === "embed" ? " · Widget" : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLE[order.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                {order.paymentStatus}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{order.status}</span>
            </div>
          </div>

          {/* Vendor */}
          {order.vendor && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 mb-4">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white flex items-center justify-center text-xl border">
                {order.vendor.logoUrl ? <img src={order.vendor.logoUrl} className="w-full h-full object-cover" /> : "🏪"}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{order.vendor.name}</p>
                <p className="text-xs text-muted-foreground">Vendor</p>
              </div>
            </div>
          )}

          {/* Order items */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Items</p>
            <div className="space-y-2">
              {(order.items ?? []).map((item: { id: number; productName: string; quantity: number; unitPrice: number; totalPrice: number }) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">× {item.quantity} @ {order.currency} {item.unitPrice.toFixed(2)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{order.currency} {item.totalPrice.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="font-bold text-gray-700">Total</span>
            <span className="text-xl font-extrabold text-gray-900">{order.currency} {totalAmt.toFixed(2)}</span>
          </div>
        </div>

        {/* Delivery info */}
        {(order.customerPhone || order.shippingAddress) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Delivery Details</p>
            <div className="space-y-1.5 text-sm text-gray-700">
              <p><span className="font-medium">Name:</span> {order.customerName}</p>
              {order.customerEmail && <p><span className="font-medium">Email:</span> {order.customerEmail}</p>}
              {order.customerPhone && <p><span className="font-medium">Phone:</span> {order.customerPhone}</p>}
              {order.shippingAddress && <p><span className="font-medium">Address:</span> {order.shippingAddress}</p>}
            </div>
          </div>
        )}

        {/* ── Rate Your Experience ──────────────────────────────── */}
        {isPaid && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">⭐ Rate Your Experience</p>
            {ratingDone ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-bold text-gray-800">Thank you for your review!</p>
                <p className="text-sm text-muted-foreground mt-1">Your feedback helps other customers.</p>
              </div>
            ) : (
              <form onSubmit={submitRating} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Star Rating *</label>
                  <StarRating value={rating} onChange={setRating} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Review (optional)</label>
                  <textarea
                    value={review}
                    onChange={e => setReview(e.target.value)}
                    placeholder="Tell others about your experience…"
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none resize-none focus:ring-2 focus:ring-violet-200"
                    maxLength={1200}
                  />
                </div>
                {ratingErr && <p className="text-red-500 text-xs">{ratingErr}</p>}
                <button
                  type="submit"
                  disabled={ratingLoading || !rating}
                  className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {ratingLoading ? "Submitting…" : "Submit Rating"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Submit a Complaint ────────────────────────────────── */}
        {isPaid && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📋 Submit a Complaint</p>
            {cDone ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-bold text-gray-800">Complaint received</p>
                <p className="text-sm text-muted-foreground mt-1">Our team will review it shortly.</p>
              </div>
            ) : (
              <form onSubmit={submitComplaint} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Your Email *</label>
                  <input
                    type="email" required value={cEmail} onChange={e => setCEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Subject *</label>
                  <input
                    type="text" required value={cSubject} onChange={e => setCSubject(e.target.value)}
                    placeholder="Brief description of the issue"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-violet-200"
                    maxLength={300}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Details *</label>
                  <textarea
                    required value={cBody} onChange={e => setCBody(e.target.value)}
                    placeholder="Describe what happened…"
                    rows={4}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none resize-none focus:ring-2 focus:ring-violet-200"
                    maxLength={4000}
                  />
                </div>
                {cErr && <p className="text-red-500 text-xs">{cErr}</p>}
                <button
                  type="submit" disabled={cLoading}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {cLoading ? "Submitting…" : "Submit Complaint"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Request Refund ────────────────────────────────────── */}
        {isPaid && order.paymentId && !isRefunded && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">💳 Request a Refund</p>
            {refundDone ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-bold text-gray-800">Refund initiated</p>
                <p className="text-sm text-muted-foreground mt-1">Processing may take 3–10 business days depending on your bank.</p>
              </div>
            ) : (
              <form onSubmit={requestRefund} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You paid <span className="font-bold text-gray-800">{order.currency} {totalAmt.toFixed(2)}</span>.
                  Leave the amount blank for a full refund, or enter a partial amount.
                </p>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Refund Amount ({order.currency}) — leave blank for full refund
                  </label>
                  <input
                    type="number" step="0.01" min="0.01" max={totalAmt}
                    value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                    placeholder={`e.g. ${(totalAmt / 2).toFixed(2)}`}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                {refundErr && <p className="text-red-500 text-xs">{refundErr}</p>}
                <button
                  type="submit" disabled={refundLoading}
                  className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {refundLoading ? "Processing…" : refundAmount ? `Request Partial Refund (${order.currency} ${parseFloat(refundAmount || "0").toFixed(2)})` : "Request Full Refund"}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Refunds are subject to the vendor's refund policy and gateway processing time.
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
