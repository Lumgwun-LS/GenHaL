import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/* ── Types ────────────────────────────────────────────────────────────────── */
type Instalment = {
  id: number; instalmentNumber: number; amount: string;
  dueDate?: string | null; status: "pending" | "paid" | "overdue";
};
type LineItem = {
  id: number; description: string; quantity: string;
  unitPrice: string; totalPrice: string; type: string;
};
type InvoiceData = {
  invoice: {
    id: number; customerName: string; currency: string;
    subtotal: string; discountAmount: string; taxAmount: string; totalAmount: string;
    status: string; dueDate?: string | null; notes?: string | null; createdAt: string;
  };
  vendor: { name: string } | null;
  items: LineItem[];
  instalments: Instalment[];
  enabledGateways: string[];
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(amount: string | number, currency: string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STYLES = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(100%); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer { from { background-position:200% center; } to { background-position:-200% center; } }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { 0%,100% { transform:scale(1); box-shadow:0 0 0 0 rgba(127,80,255,.4); } 50% { transform:scale(1.03); box-shadow:0 0 0 12px rgba(127,80,255,0); } }
  @keyframes blobFloat { 0%,100% { transform:translate(0,0) scale(1); } 33% { transform:translate(30px,-20px) scale(1.05); } 66% { transform:translate(-20px,15px) scale(0.97); } }
  @keyframes progressFill { from { width:0; } to { width:var(--w); } }
  @keyframes rowIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
  @keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
  .fadein { animation: fadeUp .55s cubic-bezier(.22,1,.36,1) both; }
  .fadein-1 { animation-delay:.08s; }
  .fadein-2 { animation-delay:.16s; }
  .fadein-3 { animation-delay:.24s; }
  .fadein-4 { animation-delay:.32s; }
  .row-in { animation: rowIn .4s cubic-bezier(.22,1,.36,1) both; }
`;

/* ── Main component ───────────────────────────────────────────────────────── */
export default function InvoicePublicPage() {
  const [, params] = useRoute("/invoice/:token");
  const token = params?.token;

  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstalment, setSelectedInstalment] = useState<Instalment | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paying, setPaying] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${BASE_URL}/api/invoices/public/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Not found");
        return r.json() as Promise<InvoiceData>;
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  const openSheet = (inst: Instalment) => {
    setSelectedInstalment(inst);
    setSelectedGateway(data?.enabledGateways[0] ?? "stripe");
    setShowSheet(true);
  };

  const pay = async () => {
    if (!selectedInstalment || !selectedGateway || !token) return;
    setPaying(true);
    try {
      const origin = window.location.origin;
      const r = await fetch(`${BASE_URL}/api/invoices/public/${token}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instalmentId: selectedInstalment.id,
          gateway: selectedGateway,
          customerEmail: customerEmail || undefined,
          successUrl: `${origin}${BASE_URL}/invoice/${token}?paid=1`,
          cancelUrl: `${origin}${BASE_URL}/invoice/${token}`,
        }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Payment failed");
      const { checkoutUrl } = await r.json() as { checkoutUrl: string };
      window.location.href = checkoutUrl;
    } catch (e) { alert("Payment error: " + String(e)); }
    finally { setPaying(false); }
  };

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#f8f7ff 0%,#f0f9ff 100%)" }}>
      <style>{STYLES}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: "3px solid #e5e7eb", borderTopColor: "#7F50FF", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "#9ca3af", fontSize: "0.9rem", fontFamily: "-apple-system,sans-serif" }}>Loading invoice…</p>
      </div>
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", fontFamily: "-apple-system,sans-serif", padding: "24px" }}>
      <style>{STYLES}</style>
      <div className="fadein" style={{ textAlign: "center", padding: "40px 32px", background: "#fff", borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,.1)", maxWidth: 380 }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontWeight: 800, color: "#111827", margin: "0 0 8px", fontSize: "1.2rem" }}>Invoice Not Available</h2>
        <p style={{ color: "#6b7280", margin: 0, fontSize: "0.88rem", lineHeight: 1.6 }}>{error}</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { invoice, vendor, items, instalments, enabledGateways } = data;
  const paidAmount = instalments.filter((i) => i.status === "paid").reduce((s, i) => s + parseFloat(i.amount), 0);
  const unpaid = instalments.filter((i) => i.status !== "paid");
  const isPaid = invoice.status === "paid";
  const nextDue = unpaid[0];
  const justPaid = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1";
  const statusBg = isPaid ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : invoice.status === "overdue" ? "linear-gradient(135deg,#fef2f2,#fee2e2)" : "linear-gradient(135deg,#f8f7ff,#eff6ff)";

  return (
    <div style={{ minHeight: "100vh", background: statusBg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: "32px 16px 80px", position: "relative", overflow: "hidden" }}>
      <style>{STYLES}</style>

      {/* Floating background blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-80px", left: "-80px", width: 400, height: 400, borderRadius: "50%", background: "rgba(127,80,255,.07)", filter: "blur(80px)", animation: "blobFloat 22s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-40px", right: "-60px", width: 350, height: 350, borderRadius: "50%", background: "rgba(0,195,247,.06)", filter: "blur(70px)", animation: "blobFloat 28s ease-in-out infinite", animationDelay: "6s" }} />
        <div style={{ position: "absolute", top: "40%", left: "60%", width: 250, height: 250, borderRadius: "50%", background: "rgba(16,185,129,.05)", filter: "blur(60px)", animation: "blobFloat 18s ease-in-out infinite", animationDelay: "12s" }} />
      </div>

      <div style={{ maxWidth: 660, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* ── Vendor branding ── */}
        <div className="fadein" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7F50FF,#FF7F50)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "1rem", boxShadow: "0 4px 12px rgba(127,80,255,.3)" }}>
              {vendor?.name?.[0] ?? "A"}
            </div>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#111827" }}>{vendor?.name ?? "Awa Biz Suite"}</span>
          </div>
          <div style={{
            padding: "5px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 700,
            background: isPaid ? "#f0fdf4" : invoice.status === "overdue" ? "#fef2f2" : invoice.status === "partially_paid" ? "#fff7ed" : "#eff6ff",
            color: isPaid ? "#16a34a" : invoice.status === "overdue" ? "#dc2626" : invoice.status === "partially_paid" ? "#d97706" : "#2563eb",
            border: `1px solid ${isPaid ? "#86efac" : invoice.status === "overdue" ? "#fca5a5" : invoice.status === "partially_paid" ? "#fed7aa" : "#93c5fd"}`,
          }}>
            {isPaid ? "✓ FULLY PAID" : invoice.status === "overdue" ? "⚠ OVERDUE" : invoice.status === "partially_paid" ? "PARTIAL" : "UNPAID"}
          </div>
        </div>

        {/* ── Success banner ── */}
        {justPaid && (
          <div className="fadein" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid #86efac", borderRadius: 16, padding: "16px 20px", marginBottom: 20, color: "#166534", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.5rem" }}>🎉</span>
            <div><strong>Payment received!</strong><br /><span style={{ fontSize: "0.85rem", opacity: .85 }}>Your receipt will be sent by email.</span></div>
          </div>
        )}

        {/* ── Invoice card ── */}
        <div className="fadein fadein-1" style={{ background: "#fff", borderRadius: 24, boxShadow: "0 4px 32px rgba(0,0,0,.08)", overflow: "hidden", marginBottom: 16 }}>
          {/* Header gradient band */}
          <div style={{ background: "linear-gradient(135deg,#7F50FF 0%,#a78bfa 50%,#FF7F50 100%)", padding: "24px 28px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.7)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Invoice</div>
                <div style={{ fontSize: "2.4rem", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginTop: 2 }}>#{invoice.id}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.7)", fontWeight: 700, letterSpacing: "0.06em" }}>BILL TO</div>
                <div style={{ fontWeight: 800, color: "#fff", fontSize: "1rem", marginTop: 2 }}>{invoice.customerName}</div>
                {invoice.dueDate && <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,.75)", marginTop: 2 }}>Due {invoice.dueDate}</div>}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div style={{ padding: "0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Description", "Qty", "Unit Price", "Total"].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: h === "Description" ? "left" : "right", fontSize: "0.7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} className="row-in" style={{ borderBottom: "1px solid #f3f4f6", animationDelay: `${0.1 + idx * 0.06}s` }}>
                    <td style={{ padding: "13px 20px", color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}>{item.description}</td>
                    <td style={{ padding: "13px 20px", textAlign: "right", color: "#9ca3af", fontSize: "0.88rem" }}>{parseFloat(item.quantity)}</td>
                    <td style={{ padding: "13px 20px", textAlign: "right", color: "#9ca3af", fontSize: "0.88rem" }}>{fmt(item.unitPrice, invoice.currency)}</td>
                    <td style={{ padding: "13px 20px", textAlign: "right", fontWeight: 700, color: "#111827", fontSize: "0.9rem" }}>{fmt(item.totalPrice, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ padding: "16px 20px 20px", background: "#fafafa", borderTop: "1px solid #f3f4f6" }}>
              {parseFloat(invoice.discountAmount) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.85rem" }}>
                  <span style={{ color: "#6b7280" }}>Discount</span>
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>-{fmt(invoice.discountAmount, invoice.currency)}</span>
                </div>
              )}
              {parseFloat(invoice.taxAmount) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.85rem" }}>
                  <span style={{ color: "#6b7280" }}>Tax / VAT</span>
                  <span>{fmt(invoice.taxAmount, invoice.currency)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.15rem", fontWeight: 900, color: "#111827", borderTop: "2px solid #e5e7eb", paddingTop: 12, marginTop: 6 }}>
                <span>Total</span>
                <span style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  {fmt(invoice.totalAmount, invoice.currency)}
                </span>
              </div>
              {paidAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#16a34a", marginTop: 4, fontWeight: 600 }}>
                  <span>Paid so far</span>
                  <span>-{fmt(paidAmount, invoice.currency)}</span>
                </div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.6 }}>
              <strong style={{ color: "#374151" }}>Notes:</strong> {invoice.notes}
            </div>
          )}
        </div>

        {/* ── Instalment schedule ── */}
        {instalments.length > 1 && (
          <div className="fadein fadein-2" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.06)", padding: "20px 22px", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 14px", fontWeight: 800, fontSize: "0.95rem", color: "#111827" }}>Payment Schedule</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {instalments.map((inst, idx) => {
                const isPaidRow = inst.status === "paid";
                const isOverdueRow = inst.status === "overdue";
                return (
                  <div key={inst.id} className="row-in" style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 12, animationDelay: `${0.2 + idx * 0.07}s`,
                    background: isPaidRow ? "#f0fdf4" : isOverdueRow ? "#fef2f2" : "#f9fafb",
                    border: `1px solid ${isPaidRow ? "#86efac" : isOverdueRow ? "#fca5a5" : "#e5e7eb"}`,
                    transition: "transform .15s, box-shadow .15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: "0.8rem",
                        background: isPaidRow ? "#dcfce7" : isOverdueRow ? "#fee2e2" : "#ede9fe",
                        color: isPaidRow ? "#16a34a" : isOverdueRow ? "#dc2626" : "#7F50FF",
                      }}>{inst.instalmentNumber}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#111827" }}>Instalment {inst.instalmentNumber}</div>
                        {inst.dueDate && <div style={{ fontSize: "0.73rem", color: "#9ca3af" }}>{isPaidRow ? "Paid" : isOverdueRow ? "Overdue" : "Due"} {inst.dueDate}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 800, color: "#111827" }}>{fmt(inst.amount, invoice.currency)}</span>
                      {isPaidRow ? (
                        <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, background: "#dcfce7", padding: "2px 8px", borderRadius: 999 }}>✓ Paid</span>
                      ) : !isPaid && enabledGateways.length > 0 ? (
                        <button onClick={() => openSheet(inst)} style={{
                          background: "linear-gradient(135deg,#7F50FF,#a78bfa)", color: "#fff", border: "none",
                          borderRadius: 8, padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(127,80,255,.3)", transition: "opacity .15s",
                        }}>Pay</button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}>
                <span>{instalments.filter(i => i.status === "paid").length} of {instalments.length} paid</span>
                <span>{Math.round((paidAmount / parseFloat(invoice.totalAmount)) * 100)}%</span>
              </div>
              <div style={{ height: 6, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  background: "linear-gradient(90deg,#7F50FF,#FF7F50)",
                  [`--w` as any]: `${Math.round((paidAmount / parseFloat(invoice.totalAmount)) * 100)}%`,
                  width: `${Math.round((paidAmount / parseFloat(invoice.totalAmount)) * 100)}%`,
                  animation: "progressFill .8s .4s ease-out both",
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Single payment CTA ── */}
        {instalments.length === 1 && !isPaid && nextDue && enabledGateways.length > 0 && (
          <div className="fadein fadein-2" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.06)", padding: "28px 22px", marginBottom: 16, textAlign: "center" }}>
            <div style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: 6 }}>Amount due</div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, background: "linear-gradient(135deg,#7F50FF,#FF7F50)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 20 }}>
              {fmt(nextDue.amount, invoice.currency)}
            </div>
            <button onClick={() => openSheet(nextDue)} style={{
              background: "linear-gradient(135deg,#7F50FF,#a78bfa)", color: "#fff", border: "none",
              borderRadius: 14, padding: "15px 44px", fontSize: "1rem", fontWeight: 800, cursor: "pointer",
              boxShadow: "0 6px 20px rgba(127,80,255,.4)", animation: "pulse 2.5s ease-in-out infinite",
            }}>Pay Now</button>
          </div>
        )}

        {/* ── Paid state ── */}
        {isPaid && (
          <div className="fadein fadein-2" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid #86efac", borderRadius: 20, padding: "28px 22px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
            <h3 style={{ fontWeight: 900, color: "#166534", margin: "0 0 4px", fontSize: "1.2rem" }}>Invoice Fully Paid</h3>
            <p style={{ color: "#16a34a", margin: 0, fontSize: "0.88rem" }}>Thank you! All payments have been received.</p>
          </div>
        )}

        {/* Footer */}
        <div className="fadein fadein-4" style={{ textAlign: "center", color: "#c4b5fd", fontSize: "0.72rem", marginTop: 32 }}>
          Powered by <strong style={{ color: "#7F50FF" }}>Awa Biz Suite</strong> · awajimaaai.com
        </div>
      </div>

      {/* ── Gateway sheet (bottom drawer) ── */}
      {showSheet && selectedInstalment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowSheet(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", background: "#fff", borderRadius: "24px 24px 0 0",
            padding: "28px 24px 40px", width: "100%", maxWidth: 520,
            animation: "sheetUp .35s cubic-bezier(.22,1,.36,1)",
            boxShadow: "0 -8px 40px rgba(0,0,0,.15)",
          }} onClick={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <div style={{ width: 40, height: 4, background: "#e5e7eb", borderRadius: 2, margin: "0 auto 20px" }} />

            <h3 style={{ margin: "0 0 4px", fontWeight: 900, fontSize: "1.15rem", color: "#111827" }}>Choose Payment Method</h3>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0 0 20px" }}>
              Paying {fmt(selectedInstalment.amount, invoice.currency)} — Instalment {selectedInstalment.instalmentNumber}
            </p>

            {enabledGateways.map((gw) => {
              const config = gw === "stripe"
                ? { label: "Card / Stripe", sub: "Credit & debit cards, Apple Pay, Google Pay", color: "#635bff", letter: "S" }
                : { label: "Paystack", sub: "Cards, bank transfer, USSD", color: "#00c3f7", letter: "P" };
              return (
                <button key={gw} onClick={() => setSelectedGateway(gw)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                  borderRadius: 14, border: `2px solid ${selectedGateway === gw ? "#7F50FF" : "#e5e7eb"}`,
                  background: selectedGateway === gw ? "#f5f0ff" : "#fff",
                  cursor: "pointer", marginBottom: 10, transition: "border-color .15s, background .15s",
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: config.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "0.8rem", flexShrink: 0 }}>{config.letter}</div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "#111827", fontSize: "0.9rem" }}>{config.label}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{config.sub}</div>
                  </div>
                  {selectedGateway === gw && <span style={{ color: "#7F50FF", fontWeight: 900, fontSize: "1rem" }}>✓</span>}
                </button>
              );
            })}

            {selectedGateway === "paystack" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Email address *</label>
                <input
                  type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: "0.9rem", outline: "none", boxSizing: "border-box", transition: "border-color .15s" }}
                />
              </div>
            )}

            <button onClick={pay} disabled={paying || (selectedGateway === "paystack" && !customerEmail)} style={{
              width: "100%", background: paying ? "#a78bfa" : "linear-gradient(135deg,#7F50FF,#a78bfa)",
              color: "#fff", border: "none", borderRadius: 14, padding: "15px",
              fontSize: "1rem", fontWeight: 800, cursor: paying ? "not-allowed" : "pointer",
              boxShadow: "0 4px 16px rgba(127,80,255,.35)", marginTop: 4,
              transition: "opacity .2s", opacity: (paying || (selectedGateway === "paystack" && !customerEmail)) ? 0.65 : 1,
            }}>
              {paying ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Redirecting…
                </span>
              ) : `Pay ${fmt(selectedInstalment.amount, invoice.currency)}`}
            </button>

            <button onClick={() => setShowSheet(false)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "0.85rem", marginTop: 12, padding: "8px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
