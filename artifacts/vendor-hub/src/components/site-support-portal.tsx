/**
 * SiteSupportPortal — embedded customer support portal for vendor websites.
 *
 * Rendered inside SiteRenderer as a fixed section on every vendor site.
 * Uses only inline styles so it works without ShadCN or any shared design system.
 *
 * Flow:
 *  1. Customer enters email → we check whether they're a known contact.
 *  2. Ticket list (or "no tickets yet" empty state) + "New Ticket" button.
 *  3. New-ticket form — subject / category / message + media uploads.
 *  4. Ticket detail — full conversation thread + reply box with media uploads.
 */
import { useState, useRef, useCallback } from "react";
import type { SiteTemplatePalette } from "./site-renderer";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ────────────────────────────────────────────────────────────────────

type Ticket = {
  id: number;
  ticketToken: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: string | null;
  productName: string | null;
  createdAt: string;
  updatedAt: string;
};

type TicketMessage = {
  id: number;
  senderType: "customer" | "vendor" | "system";
  senderName: string;
  content: string;
  attachmentUrls: string[] | null;
  attachmentTypes: string[] | null;
  createdAt: string;
};

type TicketDetail = {
  ticket: Ticket & { customerName: string; invoiceRef: string | null; orderRef: string | null };
  messages: TicketMessage[];
  vendor: { name: string; logoUrl: string | null } | null;
};

type Attachment = {
  file: File;
  url: string;
  mediaType: "image" | "video";
  uploading: boolean;
  error?: string;
};

type Order = {
  id: number;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

type OrderItem = {
  id: number;
  orderId: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
};

type Invoice = {
  id: number;
  customerName: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  dueDate: string | null;
  shareToken: string;
  notes: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
};

type InvoiceItem = {
  id: number;
  invoiceId: number;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  type: string;
};

type ProductHistory = {
  productId: number | null;
  productName: string;
  category: string | null;
  imageUrl: string | null;
  currency: string;
  totalQty: number;
  totalSpent: string;
  orderCount: number;
  lastOrderedAt: string;
};

type Refund = {
  paymentId: number;
  provider: string;
  providerReference: string;
  amount: string;
  currency: string;
  refundedAt: string;
  orderId: number | null;
  orderItems: OrderItem[];
};

type Message = {
  id: number;
  direction: "vendor_to_customer" | "customer_to_vendor";
  subject: string | null;
  body: string;
  read: boolean;
  createdAt: string;
};

type MyVendor = {
  vendorId: number;
  name: string;
  logoUrl: string | null;
  description: string | null;
  category: string | null;
  city: string | null;
  country: string | null;
  siteSlug: string | null;
  orderCount: number;
  totalSpent: string;
  currency: string;
  lastInteractionAt: string;
  sources: string[];
};

type ReportRef = { type: string; id: string | number; label: string };

type View = "email" | "list" | "new-ticket" | "detail" | "report";
type Tab  = "support" | "transactions" | "invoices" | "products" | "refunds" | "messages" | "vendors" | "report";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "general",  label: "General Enquiry" },
  { value: "product",  label: "Product Question" },
  { value: "invoice",  label: "Invoice Issue" },
  { value: "order",    label: "Order Issue" },
  { value: "delivery", label: "Delivery / Shipping" },
  { value: "refund",   label: "Refund Request" },
  { value: "other",    label: "Other" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  open:        { bg: "#dbeafe", text: "#1d4ed8" },
  in_progress: { bg: "#fef9c3", text: "#92400e" },
  resolved:    { bg: "#dcfce7", text: "#15803d" },
  closed:      { bg: "#f3f4f6", text: "#6b7280" },
};

const PAY_LABEL: Record<string, string> = {
  paid: "Paid", unpaid: "Unpaid", failed: "Failed", refunded: "Refunded", pending: "Pending",
};
const PAY_COLOR: Record<string, { bg: string; text: string }> = {
  paid:     { bg: "#dcfce7", text: "#15803d" },
  unpaid:   { bg: "#fef9c3", text: "#92400e" },
  failed:   { bg: "#fee2e2", text: "#b91c1c" },
  refunded: { bg: "#e0e7ff", text: "#4338ca" },
  pending:  { bg: "#f3f4f6", text: "#6b7280" },
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled",
};
const ORDER_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:    { bg: "#f3f4f6", text: "#6b7280" },
  confirmed:  { bg: "#dbeafe", text: "#1d4ed8" },
  processing: { bg: "#fef9c3", text: "#92400e" },
  shipped:    { bg: "#e0e7ff", text: "#4338ca" },
  delivered:  { bg: "#dcfce7", text: "#15803d" },
  cancelled:  { bg: "#fee2e2", text: "#b91c1c" },
};

const INV_STATUS_LABEL: Record<string, string> = {
  sent: "Sent", partially_paid: "Partially Paid", paid: "Paid",
  overdue: "Overdue", cancelled: "Cancelled",
};
const INV_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  sent:           { bg: "#dbeafe", text: "#1d4ed8" },
  partially_paid: { bg: "#fef9c3", text: "#92400e" },
  paid:           { bg: "#dcfce7", text: "#15803d" },
  overdue:        { bg: "#fee2e2", text: "#b91c1c" },
  cancelled:      { bg: "#f3f4f6", text: "#6b7280" },
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtFull(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  vendorId: number;
  themeColor: string;
  palette: SiteTemplatePalette;
  vendorName?: string;
}

export function SiteSupportPortal({ vendorId, themeColor, palette, vendorName = "Support" }: Props) {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [view, setView]                 = useState<View>("email");
  const [email, setEmail]               = useState("");
  const [checking, setChecking]         = useState(false);
  const [customerInfo, setCustomerInfo] = useState<{ found: boolean; name?: string } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [authError, setAuthError]       = useState<string | null>(null);

  // ── Tab + list state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState<Tab>("support");
  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [transactions, setTransactions]       = useState<Order[]>([]);
  const [loadingTx, setLoadingTx]             = useState(false);
  const [invoices, setInvoices]               = useState<Invoice[]>([]);
  const [loadingInv, setLoadingInv]           = useState(false);
  const [products, setProducts]               = useState<ProductHistory[]>([]);
  const [loadingProd, setLoadingProd]         = useState(false);
  const [refunds, setRefunds]                 = useState<Refund[]>([]);
  const [loadingRefunds, setLoadingRefunds]   = useState(false);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [myVendors, setMyVendors]             = useState<MyVendor[]>([]);
  const [loadingVendors, setLoadingVendors]   = useState(false);
  // ── Report Vendor state ─────────────────────────────────────────────────────
  const [reportRef, setReportRef]             = useState<ReportRef | null>(null);
  const [reportCategory, setReportCategory]   = useState("transaction");
  const [reportSubject, setReportSubject]     = useState("");
  const [reportBody, setReportBody]           = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportResult, setReportResult]       = useState<{ id: number } | null>(null);
  const [reportError, setReportError]         = useState<string | null>(null);
  const [msgBody, setMsgBody]                 = useState("");
  const [msgSubject, setMsgSubject]           = useState("");
  const [sendingMsg, setSendingMsg]           = useState(false);
  const [msgError, setMsgError]               = useState<string | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  // ── Ticket detail state ─────────────────────────────────────────────────────
  const [selectedToken, setSelectedToken]   = useState<string | null>(null);
  const [detail, setDetail]                 = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail]   = useState(false);
  const [replyText, setReplyText]           = useState("");
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
  const [replying, setReplying]             = useState(false);
  const [replyError, setReplyError]         = useState<string | null>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

  // ── New ticket form state ───────────────────────────────────────────────────
  const [formSubject, setFormSubject]     = useState("");
  const [formCategory, setFormCategory]   = useState("general");
  const [formMessage, setFormMessage]     = useState("");
  const [formInvoice, setFormInvoice]     = useState("");
  const [formOrder, setFormOrder]         = useState("");
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting]       = useState(false);
  const [submitResult, setSubmitResult]   = useState<{ ticketToken: string; ticketId: number } | null>(null);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const newTicketFileRef = useRef<HTMLInputElement>(null);

  // ── Upload helper ────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File): Promise<{ url: string; mediaType: "image" | "video" }> => {
    const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const { uploadUrl, publicUrl } = await fetch(`${BASE_URL}/api/public/support/upload-url`, {
      method: "POST",
    }).then(r => r.json());
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return { url: publicUrl, mediaType };
  }, []);

  const handleFiles = useCallback(async (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<Attachment[]>>,
  ) => {
    if (!files) return;
    const accepted = Array.from(files).filter(f =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    ).slice(0, 5);
    const placeholders: Attachment[] = accepted.map(f => ({
      file: f, url: "", mediaType: f.type.startsWith("video/") ? "video" : "image", uploading: true,
    }));
    setter(prev => [...prev, ...placeholders]);
    for (const [i, f] of accepted.entries()) {
      try {
        const { url, mediaType } = await uploadFile(f);
        setter(prev => {
          const out = [...prev];
          const idx = out.findIndex(a => a.file === f && a.uploading);
          if (idx !== -1) out[idx] = { ...out[idx], url, mediaType, uploading: false };
          return out;
        });
      } catch {
        setter(prev => {
          const out = [...prev];
          const idx = out.findIndex(a => a.file === f && a.uploading);
          if (idx !== -1) out[idx] = { ...out[idx], uploading: false, error: "Upload failed" };
          return out;
        });
      }
    }
  }, [uploadFile]);

  // ── API calls ────────────────────────────────────────────────────────────────

  async function checkEmail() {
    if (!email.trim()) return;
    setChecking(true); setAuthError(null);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/check-customer?email=${encodeURIComponent(email.trim())}`,
      );
      const info = await r.json();
      setCustomerInfo(info);
      if (info.found && info.name) setCustomerName(info.name);
      // Fetch all customer data in parallel
      await Promise.all([
        fetchTickets(email.trim()),
        fetchTransactions(email.trim()),
        fetchInvoices(email.trim()),
        fetchProducts(email.trim()),
        fetchRefunds(email.trim()),
        fetchMessages(email.trim()),
        fetchVendors(email.trim()),
      ]);
      setActiveTab("support");
      setView("list");
    } catch {
      setAuthError("Unable to verify your email. Please try again.");
    }
    setChecking(false);
  }

  async function fetchTickets(emailAddr: string) {
    setLoadingList(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-tickets?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setTickets(data.tickets ?? []);
    } catch { /* silent — show empty state */ }
    setLoadingList(false);
  }

  async function fetchTransactions(emailAddr: string) {
    setLoadingTx(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-transactions?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setTransactions(data.orders ?? []);
    } catch { /* silent — show empty state */ }
    setLoadingTx(false);
  }

  async function fetchInvoices(emailAddr: string) {
    setLoadingInv(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-invoices?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setInvoices(data.invoices ?? []);
    } catch { /* silent — show empty state */ }
    setLoadingInv(false);
  }

  async function fetchProducts(emailAddr: string) {
    setLoadingProd(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-products?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setProducts(data.products ?? []);
    } catch { /* silent — show empty state */ }
    setLoadingProd(false);
  }

  async function fetchRefunds(emailAddr: string) {
    setLoadingRefunds(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-refunds?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setRefunds(data.refunds ?? []);
    } catch { /* silent — show empty state */ }
    setLoadingRefunds(false);
  }

  const REPORT_CATS = [
    { value: "transaction", label: "🛒 Transaction Issue",  desc: "Wrong charge, missing item, not as described" },
    { value: "product",     label: "📦 Product Issue",      desc: "Counterfeit, damaged, or dangerous product" },
    { value: "invoice",     label: "📋 Invoice Dispute",    desc: "Incorrect invoice or unexpected charge" },
    { value: "message",     label: "💬 Message Abuse",      desc: "Harassment, threats, or inappropriate content" },
    { value: "fraud",       label: "🚨 Fraud / Scam",       desc: "I believe this vendor is operating fraudulently" },
    { value: "other",       label: "📝 Other",               desc: "Something else not listed above" },
  ];

  function openReport(ref: ReportRef) {
    const catLabel: Record<string, string> = {
      transaction: "Issue with Order", product: "Product Issue",
      invoice: "Invoice Dispute", message: "Message Abuse",
    };
    setReportRef(ref);
    setReportCategory(ref.type);
    setReportSubject(`${catLabel[ref.type] ?? "Report"} – ${ref.label}`);
    setReportBody("");
    setReportResult(null);
    setReportError(null);
    setActiveTab("report");
    setView("list");
  }

  async function submitReport() {
    if (!reportBody.trim()) return;
    setSubmittingReport(true); setReportError(null);
    try {
      const orderId = reportRef?.type === "transaction" ? parseInt(String(reportRef.id)) || undefined : undefined;
      const fullBody = reportRef
        ? `[Reference: ${reportRef.type} – ${reportRef.label}]\n\n${reportBody.trim()}`
        : reportBody.trim();
      const r = await fetch(`${BASE_URL}/api/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          orderId,
          customerEmail: email.trim(),
          customerName:  customerName.trim() || undefined,
          subject:       reportSubject.trim() || "Vendor Report",
          body:          fullBody,
        }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setReportResult({ id: data.id });
    } catch {
      setReportError("Failed to submit. Please try again.");
    }
    setSubmittingReport(false);
  }

  async function fetchVendors(emailAddr: string) {
    setLoadingVendors(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-vendors?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setMyVendors(data.vendors ?? []);
    } catch { /* silent */ }
    setLoadingVendors(false);
  }

  async function fetchMessages(emailAddr: string) {
    setLoadingMessages(true);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/my-messages?email=${encodeURIComponent(emailAddr)}`,
      );
      const data = await r.json();
      setMessages(data.messages ?? []);
    } catch { /* silent */ }
    setLoadingMessages(false);
  }

  async function sendMessage() {
    if (!msgBody.trim()) return;
    setSendingMsg(true); setMsgError(null);
    try {
      const r = await fetch(`${BASE_URL}/api/public/support/${vendorId}/my-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: email.trim(),
          customerName:  customerName.trim() || undefined,
          subject:       msgSubject.trim() || undefined,
          body:          msgBody.trim(),
        }),
      });
      if (!r.ok) throw new Error();
      const { message: sent } = await r.json();
      setMessages(prev => [...prev, sent]);
      setMsgBody(""); setMsgSubject("");
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    } catch {
      setMsgError("Failed to send message. Please try again.");
    }
    setSendingMsg(false);
  }

  async function openTicket(token: string) {
    setSelectedToken(token); setView("detail"); setLoadingDetail(true); setDetail(null);
    try {
      const r = await fetch(`${BASE_URL}/api/public/support/ticket/${token}`);
      const data = await r.json();
      setDetail(data);
    } catch { /* show error */ }
    setLoadingDetail(false);
  }

  async function submitReply() {
    if (!replyText.trim() || !selectedToken) return;
    setReplying(true); setReplyError(null);
    try {
      const attachmentUrls = replyAttachments.filter(a => !a.uploading && !a.error && a.url).map(a => a.url);
      const attachmentTypes = replyAttachments.filter(a => !a.uploading && !a.error && a.url).map(a => a.mediaType);
      const r = await fetch(`${BASE_URL}/api/public/support/ticket/${selectedToken}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim(), attachmentUrls, attachmentTypes }),
      });
      if (!r.ok) throw new Error();
      setReplyText(""); setReplyAttachments([]);
      // Refresh detail
      await openTicket(selectedToken);
    } catch {
      setReplyError("Failed to send reply. Please try again.");
    }
    setReplying(false);
  }

  async function submitNewTicket() {
    if (!formSubject.trim() || !formMessage.trim()) return;
    if (!customerName.trim()) { setSubmitError("Please enter your name."); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      const attachmentUrls = formAttachments.filter(a => !a.uploading && !a.error && a.url).map(a => a.url);
      const attachmentTypes = formAttachments.filter(a => !a.uploading && !a.error && a.url).map(a => a.mediaType);
      const r = await fetch(`${BASE_URL}/api/public/support/${vendorId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: email.trim(),
          customerPhone: customerPhone.trim() || undefined,
          subject: formSubject.trim(),
          category: formCategory,
          message: formMessage.trim(),
          invoiceRef: formInvoice.trim() || undefined,
          orderRef: formOrder.trim() || undefined,
          attachmentUrls,
          attachmentTypes,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Submit failed");
      setSubmitResult(data);
      // Reset form
      setFormSubject(""); setFormCategory("general"); setFormMessage("");
      setFormInvoice(""); setFormOrder(""); setFormAttachments([]);
      // Refresh ticket list
      await fetchTickets(email.trim());
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Failed to submit ticket.");
    }
    setSubmitting(false);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: "1.5rem",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
  };

  const btn = (primary = true): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "0.55rem 1.25rem", borderRadius: 10, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: "0.88rem", transition: "opacity .18s",
    background: primary ? themeColor : "transparent",
    color: primary ? "#fff" : themeColor,
    boxShadow: primary ? `0 2px 10px ${themeColor}40` : "none",
    ...(primary ? {} : { border: `1.5px solid ${themeColor}` }),
  });

  const input: React.CSSProperties = {
    width: "100%", padding: "0.6rem 0.85rem", borderRadius: 10,
    border: "1.5px solid rgba(0,0,0,0.12)", fontSize: "0.9rem",
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
    background: "#fafafa",
  };

  const textarea: React.CSSProperties = { ...input, resize: "vertical", minHeight: 100 };

  const badge = (status: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center",
    padding: "2px 9px", borderRadius: 20,
    fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em",
    background: (STATUS_COLOR[status] ?? STATUS_COLOR.open).bg,
    color: (STATUS_COLOR[status] ?? STATUS_COLOR.open).text,
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section style={{ background: palette.bg, padding: "5rem 1.25rem" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Section heading */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${themeColor}14`, color: themeColor, borderRadius: 30, padding: "5px 16px", fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.85rem" }}>
            🎧 Customer Support
          </div>
          <h2 style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 900, color: palette.text }}>
            How can we help you?
          </h2>
          <p style={{ margin: "0.5rem 0 0", color: palette.text + "99", fontSize: "0.93rem" }}>
            View your order history, track support tickets, or start a new conversation.
          </p>
        </div>

        {/* ── Email check ─────────────────────────────────────────────────── */}
        {view === "email" && (
          <div style={card}>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.05rem", fontWeight: 800, color: palette.text }}>
              Verify your email
            </h3>
            <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: palette.text + "80" }}>
              Enter your email address to see your orders, support tickets, and conversations.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                style={{ ...input, flex: "1 1 240px" }}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && checkEmail()}
              />
              <button style={btn()} onClick={checkEmail} disabled={checking || !email.trim()}>
                {checking ? "Checking…" : "Continue →"}
              </button>
            </div>
            {authError && <p style={{ margin: "0.75rem 0 0", color: "#ef4444", fontSize: "0.83rem" }}>{authError}</p>}
          </div>
        )}

        {/* ── Dashboard (list) ─────────────────────────────────────────────── */}
        {view === "list" && (
          <div>
            {/* Welcome banner */}
            <div style={{ ...card, marginBottom: "1.25rem", background: `${themeColor}0c`, border: `1px solid ${themeColor}22` }}>
              <p style={{ margin: 0, fontWeight: 800, color: palette.text, fontSize: "0.95rem" }}>
                {customerInfo?.found
                  ? `👋 Welcome back${customerName ? `, ${customerName.split(" ")[0]}` : ""}!`
                  : "👋 Hi there!"}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: palette.text + "80" }}>
                Signed in as <span style={{ fontWeight: 700 }}>{email}</span>
                <button onClick={() => { setView("email"); setCustomerInfo(null); setTickets([]); setTransactions([]); setInvoices([]); setProducts([]); setRefunds([]); setMessages([]); setMyVendors([]); setReportRef(null); setReportResult(null); setActiveTab("support"); }} style={{ marginLeft: 10, background: "none", border: "none", cursor: "pointer", color: themeColor, fontSize: "0.78rem", fontWeight: 700, padding: 0 }}>Change</button>
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "2px solid rgba(0,0,0,0.08)", marginBottom: "1.25rem", gap: 0 }}>
              {(["support", "transactions", "invoices", "products", "refunds", "messages", "vendors", "report"] as Tab[]).map(tab => {
                const labels: Record<Tab, string> = { support: "🎫 Support", transactions: "🧾 Orders", invoices: "📋 Invoices", products: "📦 Products", refunds: "💸 Refunds", messages: "💬 Messages", vendors: "🏪 My Vendors", report: "🚩 Report" };
                const unreadMsgs = messages.filter(m => m.direction === "vendor_to_customer" && !m.read).length;
                const counts: Record<Tab, number> = { support: tickets.length, transactions: transactions.length, invoices: invoices.length, products: products.length, refunds: refunds.length, messages: unreadMsgs || messages.length, vendors: myVendors.length, report: 0 };
                const active = activeTab === tab;
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "0.65rem 1.1rem", fontWeight: active ? 800 : 600,
                    fontSize: "0.88rem", color: active ? themeColor : palette.text + "70",
                    borderBottom: active ? `2.5px solid ${themeColor}` : "2.5px solid transparent",
                    marginBottom: -2, transition: "color .15s",
                  }}>
                    {labels[tab]}
                    <span style={{
                      marginLeft: 6, background: active ? themeColor : "rgba(0,0,0,0.08)",
                      color: active ? "#fff" : palette.text + "80",
                      borderRadius: 20, padding: "1px 7px", fontSize: "0.72rem", fontWeight: 800,
                    }}>
                      {counts[tab]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Support Tickets tab ──────────────────────────────────────── */}
            {activeTab === "support" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
                  <button style={btn()} onClick={() => { setSubmitResult(null); setView("new-ticket"); }}>+ New Ticket</button>
                </div>
                {loadingList ? (
                  <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading tickets…</p>
                ) : tickets.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🎫</div>
                    <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No support tickets yet</p>
                    <p style={{ margin: "0.4rem 0 1.5rem", color: palette.text + "70", fontSize: "0.85rem" }}>
                      Create your first ticket and we'll get back to you soon.
                    </p>
                    <button style={btn()} onClick={() => { setSubmitResult(null); setView("new-ticket"); }}>Create a Ticket</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {tickets.map(t => (
                      <button key={t.id}
                        onClick={() => openTicket(t.ticketToken)}
                        style={{ ...card, cursor: "pointer", textAlign: "left", width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, transition: "box-shadow .18s, transform .15s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 24px ${themeColor}30`; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={badge(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</span>
                            <span style={{ fontSize: "0.73rem", color: palette.text + "60", fontWeight: 600, textTransform: "capitalize" }}>{t.category.replace("_", " ")}</span>
                            {t.productName && <span style={{ fontSize: "0.73rem", color: palette.text + "55" }}>· {t.productName}</span>}
                          </div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject}</p>
                          <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>
                            #{t.id} · Updated {fmt(t.updatedAt)}
                          </p>
                        </div>
                        <span style={{ color: themeColor, fontSize: "1.2rem", flexShrink: 0, marginTop: 2 }}>›</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Transactions tab ─────────────────────────────────────────── */}
            {activeTab === "transactions" && (
              <div>
                {loadingTx ? (
                  <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading transactions…</p>
                ) : transactions.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🧾</div>
                    <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No transactions yet</p>
                    <p style={{ margin: "0.4rem 0 0", color: palette.text + "70", fontSize: "0.85rem" }}>
                      Your purchases from this store will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {transactions.map(tx => {
                      const payC = PAY_COLOR[tx.paymentStatus] ?? PAY_COLOR.pending;
                      const ordC = ORDER_STATUS_COLOR[tx.status] ?? ORDER_STATUS_COLOR.pending;
                      return (
                        <div key={tx.id} style={card}>
                          {/* Order header */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "0.85rem" }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: palette.text }}>Order #{tx.id}</p>
                              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>{fmt(tx.createdAt)}</p>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: ordC.bg, color: ordC.text }}>
                                {ORDER_STATUS_LABEL[tx.status] ?? tx.status}
                              </span>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: payC.bg, color: payC.text }}>
                                {PAY_LABEL[tx.paymentStatus] ?? tx.paymentStatus}
                              </span>
                            </div>
                          </div>

                          {/* Line items */}
                          {tx.items.length > 0 && (
                            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "0.6rem 0", marginBottom: "0.85rem" }}>
                              {tx.items.map(item => (
                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.25rem 0", gap: 12 }}>
                                  <span style={{ fontSize: "0.85rem", color: palette.text, fontWeight: 600, flex: 1 }}>
                                    {item.productName}
                                    <span style={{ marginLeft: 6, fontSize: "0.75rem", color: palette.text + "70", fontWeight: 400 }}>× {item.quantity}</span>
                                  </span>
                                  <span style={{ fontSize: "0.85rem", color: palette.text, fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {tx.currency} {parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Footer: total + support CTA */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: "1rem", color: palette.text }}>
                              Total: <span style={{ color: themeColor }}>{tx.currency} {parseFloat(tx.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </p>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                style={btn(false)}
                                onClick={() => {
                                  setFormOrder(String(tx.id));
                                  setFormSubject(`Issue with Order #${tx.id}`);
                                  setFormCategory("order");
                                  setSubmitResult(null);
                                  setView("new-ticket");
                                }}
                              >
                                🎫 Get Support
                              </button>
                              <button
                                style={{ ...btn(false), borderColor: "#ef4444", color: "#ef4444" }}
                                onClick={() => openReport({ type: "transaction", id: tx.id, label: `Order #${tx.id} – ${tx.currency} ${parseFloat(tx.totalAmount).toFixed(2)}` })}
                              >
                                🚩 Report
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Invoices tab ─────────────────────────────────────────────── */}
            {activeTab === "invoices" && (
              <div>
                {loadingInv ? (
                  <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading invoices…</p>
                ) : invoices.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📋</div>
                    <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No invoices yet</p>
                    <p style={{ margin: "0.4rem 0 0", color: palette.text + "70", fontSize: "0.85rem" }}>
                      Invoices issued to you by this vendor will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {invoices.map(inv => {
                      const sC = INV_STATUS_COLOR[inv.status] ?? INV_STATUS_COLOR.sent;
                      const hasDiscount = parseFloat(inv.discountAmount) > 0;
                      const hasTax      = parseFloat(inv.taxAmount) > 0;
                      const isOverdue   = inv.status === "overdue";
                      return (
                        <div key={inv.id} style={{ ...card, borderLeft: isOverdue ? "4px solid #ef4444" : `4px solid ${themeColor}` }}>
                          {/* Invoice header */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "0.85rem" }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: palette.text }}>Invoice #{inv.id}</p>
                              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>
                                {inv.sentAt ? `Sent ${fmt(inv.sentAt)}` : `Issued ${fmt(inv.createdAt)}`}
                              </p>
                              {inv.dueDate && (
                                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: isOverdue ? "#ef4444" : palette.text + "60", fontWeight: isOverdue ? 700 : 400 }}>
                                  {isOverdue ? "⚠️ Overdue — " : "Due "}
                                  {new Date(inv.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              )}
                            </div>
                            <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: sC.bg, color: sC.text }}>
                              {INV_STATUS_LABEL[inv.status] ?? inv.status}
                            </span>
                          </div>

                          {/* Line items */}
                          {inv.items.length > 0 && (
                            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "0.6rem 0", marginBottom: "0.75rem" }}>
                              {inv.items.map(item => (
                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.25rem 0", gap: 12 }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: "0.85rem", color: palette.text, fontWeight: 600 }}>{item.description}</span>
                                    <span style={{ marginLeft: 8, fontSize: "0.73rem", color: palette.text + "60" }}>
                                      {parseFloat(item.quantity) % 1 === 0 ? parseInt(item.quantity) : parseFloat(item.quantity)} × {inv.currency} {parseFloat(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: "0.85rem", color: palette.text, fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {inv.currency} {parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Totals breakdown */}
                          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "0.6rem", marginBottom: "0.85rem" }}>
                            {(hasDiscount || hasTax) && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                                <span style={{ fontSize: "0.8rem", color: palette.text + "70" }}>Subtotal</span>
                                <span style={{ fontSize: "0.8rem", color: palette.text + "70" }}>{inv.currency} {parseFloat(inv.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {hasDiscount && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                                <span style={{ fontSize: "0.8rem", color: "#15803d" }}>Discount</span>
                                <span style={{ fontSize: "0.8rem", color: "#15803d" }}>− {inv.currency} {parseFloat(inv.discountAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {hasTax && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                                <span style={{ fontSize: "0.8rem", color: palette.text + "70" }}>Tax</span>
                                <span style={{ fontSize: "0.8rem", color: palette.text + "70" }}>{inv.currency} {parseFloat(inv.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: hasDiscount || hasTax ? "0.35rem" : 0 }}>
                              <span style={{ fontWeight: 800, fontSize: "1rem", color: palette.text }}>Total</span>
                              <span style={{ fontWeight: 800, fontSize: "1rem", color: themeColor }}>{inv.currency} {parseFloat(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {/* Notes + support CTA */}
                          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            {inv.notes ? (
                              <p style={{ margin: 0, fontSize: "0.78rem", color: palette.text + "70", fontStyle: "italic", flex: 1 }}>
                                {inv.notes}
                              </p>
                            ) : <span />}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                style={btn(false)}
                                onClick={() => {
                                  setFormInvoice(String(inv.id));
                                  setFormSubject(`Query on Invoice #${inv.id}`);
                                  setFormCategory("invoice");
                                  setSubmitResult(null);
                                  setView("new-ticket");
                                }}
                              >
                                🎫 Dispute / Query
                              </button>
                              <button
                                style={{ ...btn(false), borderColor: "#ef4444", color: "#ef4444" }}
                                onClick={() => openReport({ type: "invoice", id: inv.id, label: `Invoice #${inv.id}` })}
                              >
                                🚩 Report
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Products tab ─────────────────────────────────────────────── */}
            {activeTab === "products" && (
              <div>
                {loadingProd ? (
                  <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading product history…</p>
                ) : products.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📦</div>
                    <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No products purchased yet</p>
                    <p style={{ margin: "0.4rem 0 0", color: palette.text + "70", fontSize: "0.85rem" }}>
                      Products from your orders with this vendor will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {products.map((p, i) => (
                      <div key={p.productId ?? `${p.productName}-${i}`} style={card}>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                          {/* Product image */}
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.productName}
                              style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#f3f4f6" }}
                            />
                          ) : (
                            <div style={{ width: 64, height: 64, borderRadius: 10, background: `${themeColor}14`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.75rem" }}>
                              📦
                            </div>
                          )}

                          {/* Product details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 800, fontSize: "0.97rem", color: palette.text }}>{p.productName}</p>
                                {p.category && (
                                  <span style={{ display: "inline-block", marginTop: 3, fontSize: "0.72rem", fontWeight: 700, background: `${themeColor}14`, color: themeColor, borderRadius: 20, padding: "1px 8px", textTransform: "capitalize" }}>
                                    {p.category}
                                  </span>
                                )}
                              </div>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: "1rem", color: themeColor, whiteSpace: "nowrap" }}>
                                {p.currency} {parseFloat(p.totalSpent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>

                            {/* Stats row */}
                            <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                                <strong style={{ color: palette.text }}>{p.totalQty}</strong> unit{p.totalQty !== 1 ? "s" : ""} purchased
                              </span>
                              <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                                across <strong style={{ color: palette.text }}>{p.orderCount}</strong> order{p.orderCount !== 1 ? "s" : ""}
                              </span>
                              <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                                Last bought {fmt(p.lastOrderedAt)}
                              </span>
                            </div>

                            {/* Support CTA */}
                            <div style={{ marginTop: "0.75rem", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                style={btn(false)}
                                onClick={() => {
                                  setFormSubject(`Issue with ${p.productName}`);
                                  setFormCategory("product");
                                  setSubmitResult(null);
                                  setView("new-ticket");
                                }}
                              >
                                🎫 Get Support
                              </button>
                              <button
                                style={{ ...btn(false), borderColor: "#ef4444", color: "#ef4444" }}
                                onClick={() => openReport({ type: "product", id: p.productId ?? p.productName, label: p.productName })}
                              >
                                🚩 Report
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Refunds tab ──────────────────────────────────────────────── */}
            {activeTab === "refunds" && (
              <div>
                {loadingRefunds ? (
                  <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading refunds…</p>
                ) : refunds.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>✅</div>
                    <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No refunds on record</p>
                    <p style={{ margin: "0.4rem 0 0", color: palette.text + "70", fontSize: "0.85rem" }}>
                      Any refunds issued to you by this vendor will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {refunds.map(rf => {
                      const providerLabel: Record<string, string> = {
                        stripe: "Stripe", paystack: "Paystack", paypal: "PayPal",
                        flutterwave: "Flutterwave", nomba: "Nomba", remita: "Remita", squad: "Squad",
                      };
                      const providerColor: Record<string, string> = {
                        stripe: "#635bff", paystack: "#00c3f7", paypal: "#003087",
                        flutterwave: "#f5a623", nomba: "#1a1a2e", remita: "#e63946", squad: "#22c55e",
                      };
                      const pColor = providerColor[rf.provider] ?? themeColor;
                      const pLabel = providerLabel[rf.provider] ?? rf.provider;

                      return (
                        <div key={rf.paymentId} style={{ ...card, borderLeft: `4px solid #22c55e` }}>
                          {/* Header */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "0.85rem" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 800, background: pColor + "18", color: pColor }}>
                                  {pLabel}
                                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: "#dcfce7", color: "#15803d" }}>
                                  Refunded
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: "0.75rem", color: palette.text + "60", fontFamily: "monospace" }}>
                                Ref: {rf.providerReference}
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>
                                Processed {fmt(rf.refundedAt)}
                              </p>
                              {rf.orderId && (
                                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>
                                  Order #{rf.orderId}
                                </p>
                              )}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <p style={{ margin: 0, fontWeight: 900, fontSize: "1.3rem", color: "#15803d" }}>
                                {rf.currency} {parseFloat(rf.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: palette.text + "60" }}>refunded</p>
                            </div>
                          </div>

                          {/* Order items */}
                          {rf.orderItems.length > 0 && (
                            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "0.55rem 0", marginBottom: "0.75rem" }}>
                              {rf.orderItems.map(item => (
                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.2rem 0", gap: 12 }}>
                                  <span style={{ fontSize: "0.83rem", color: palette.text + "cc", flex: 1 }}>
                                    {item.productName}
                                    <span style={{ marginLeft: 6, fontSize: "0.73rem", color: palette.text + "60" }}>× {item.quantity}</span>
                                  </span>
                                  <span style={{ fontSize: "0.83rem", color: palette.text + "90", whiteSpace: "nowrap" }}>
                                    {rf.currency} {parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Support CTA */}
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              style={btn(false)}
                              onClick={() => {
                                setFormOrder(rf.orderId ? String(rf.orderId) : "");
                                setFormSubject(`Query on Refund – Ref ${rf.providerReference}`);
                                setFormCategory("refund");
                                setSubmitResult(null);
                                setView("new-ticket");
                              }}
                            >
                              🎫 Query this Refund
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Messages tab (chat) ──────────────────────────────────────────── */}
        {view === "list" && activeTab === "messages" && (
          <div style={card}>
            {/* Thread */}
            <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem", paddingRight: 4 }}>
              {loadingMessages ? (
                <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading messages…</p>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 0" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>💬</div>
                  <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No messages yet</p>
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.83rem", color: palette.text + "70" }}>
                    Send a message below and {vendorName} will get back to you.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map(m => {
                    const isVendor = m.direction === "vendor_to_customer";
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isVendor ? "flex-start" : "flex-end" }}>
                        {m.subject && (
                          <p style={{ margin: "0 0 2px", fontSize: "0.72rem", fontWeight: 700, color: palette.text + "60", paddingLeft: isVendor ? 12 : 0, paddingRight: isVendor ? 0 : 12 }}>
                            {m.subject}
                          </p>
                        )}
                        <div style={{
                          maxWidth: "78%", padding: "0.55rem 0.9rem", borderRadius: isVendor ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                          background: isVendor ? "#f3f4f6" : themeColor,
                          color: isVendor ? palette.text : "#fff",
                          fontSize: "0.88rem", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {m.body}
                        </div>
                        <p style={{ margin: "3px 4px 0", fontSize: "0.68rem", color: palette.text + "50" }}>
                          {isVendor ? vendorName : "You"} · {fmt(m.createdAt)}
                          {isVendor && m.read && <span style={{ marginLeft: 6 }}>✓ read</span>}
                        </p>
                      </div>
                    );
                  })}
                  <div ref={msgEndRef} />
                </>
              )}
            </div>

            {/* Compose box */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "0.85rem" }}>
              {messages.length === 0 && (
                <input
                  style={{ ...input, marginBottom: "0.5rem" }}
                  placeholder="Subject (optional)"
                  value={msgSubject}
                  onChange={e => setMsgSubject(e.target.value)}
                />
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  style={{ ...input, resize: "none", minHeight: 70, flex: 1 }}
                  placeholder={`Message ${vendorName}…`}
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendMessage(); }}
                />
                <button
                  style={{ ...btn(), padding: "0.55rem 1rem", height: 70, flexShrink: 0 }}
                  onClick={sendMessage}
                  disabled={sendingMsg || !msgBody.trim()}
                >
                  {sendingMsg ? "…" : "Send →"}
                </button>
              </div>
              {msgError && <p style={{ margin: "0.4rem 0 0", color: "#ef4444", fontSize: "0.8rem" }}>{msgError}</p>}
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: palette.text + "50" }}>Ctrl + Enter to send</p>
            </div>
          </div>
        )}

        {/* ── My Vendors tab ───────────────────────────────────────────────── */}
        {view === "list" && activeTab === "vendors" && (
          <div>
            {loadingVendors ? (
              <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading your vendors…</p>
            ) : myVendors.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🏪</div>
                <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>No vendor relationships yet</p>
                <p style={{ margin: "0.4rem 0 0", color: palette.text + "70", fontSize: "0.85rem" }}>
                  Vendors you've ordered from, messaged, or raised tickets with will appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {myVendors.map(v => {
                  const sourceIcons: Record<string, string> = { orders: "🛒", tickets: "🎫", messages: "💬" };
                  const isCurrentVendor = v.vendorId === vendorId;
                  return (
                    <div key={v.vendorId} style={{ ...card, ...(isCurrentVendor ? { borderLeft: `4px solid ${themeColor}` } : {}) }}>
                      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                        {/* Logo */}
                        {v.logoUrl ? (
                          <img src={v.logoUrl} alt={v.name}
                            style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(0,0,0,0.08)" }} />
                        ) : (
                          <div style={{ width: 56, height: 56, borderRadius: 12, background: `${themeColor}18`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>
                            🏪
                          </div>
                        )}

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: "0.97rem", color: palette.text }}>
                                {v.name}
                                {isCurrentVendor && (
                                  <span style={{ marginLeft: 8, fontSize: "0.68rem", fontWeight: 700, background: themeColor, color: "#fff", borderRadius: 20, padding: "1px 7px" }}>
                                    Current
                                  </span>
                                )}
                              </p>
                              {(v.city || v.country) && (
                                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: palette.text + "60" }}>
                                  📍 {[v.city, v.country].filter(Boolean).join(", ")}
                                </p>
                              )}
                            </div>
                            {/* Source badges */}
                            <div style={{ display: "flex", gap: 4 }}>
                              {v.sources.map(s => (
                                <span key={s} title={s} style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.06)", borderRadius: 20, padding: "1px 7px" }}>
                                  {sourceIcons[s] ?? s}
                                </span>
                              ))}
                            </div>
                          </div>

                          {v.description && (
                            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: palette.text + "70", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {v.description}
                            </p>
                          )}

                          {/* Stats */}
                          <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                            {v.orderCount > 0 && (
                              <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                                <strong style={{ color: palette.text }}>{v.orderCount}</strong> order{v.orderCount !== 1 ? "s" : ""}
                              </span>
                            )}
                            {v.orderCount > 0 && parseFloat(v.totalSpent) > 0 && (
                              <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                                <strong style={{ color: palette.text }}>{v.currency} {parseFloat(v.totalSpent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> spent
                              </span>
                            )}
                            <span style={{ fontSize: "0.78rem", color: palette.text + "70" }}>
                              Last active {fmt(v.lastInteractionAt)}
                            </span>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, marginTop: "0.75rem", flexWrap: "wrap" }}>
                            {v.siteSlug && (
                              <a
                                href={`${BASE_URL}/site/${v.siteSlug}`}
                                target="_blank" rel="noreferrer"
                                style={{ ...btn(), textDecoration: "none", fontSize: "0.82rem", padding: "0.45rem 1rem" }}
                              >
                                Visit Store →
                              </a>
                            )}
                            <button
                              style={{ ...btn(false), fontSize: "0.82rem", padding: "0.45rem 1rem" }}
                              onClick={() => {
                                setFormSubject(`Message for ${v.name}`);
                                setFormCategory("general");
                                setSubmitResult(null);
                                setView("new-ticket");
                              }}
                            >
                              🎫 Get Support
                            </button>
                            <button
                              style={{ ...btn(false), fontSize: "0.82rem", padding: "0.45rem 1rem", borderColor: "#ef4444", color: "#ef4444" }}
                              onClick={() => openReport({ type: "fraud", id: v.vendorId, label: v.name })}
                            >
                              🚩 Report Vendor
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Report tab ───────────────────────────────────────────────────── */}
        {view === "list" && activeTab === "report" && (
          <div style={card}>
            {reportResult ? (
              /* Success state */
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>✅</div>
                <p style={{ margin: "0 0 0.4rem", fontWeight: 800, fontSize: "1.1rem", color: palette.text }}>Report Submitted</p>
                <p style={{ margin: "0 0 0.3rem", color: palette.text + "70", fontSize: "0.88rem" }}>
                  Reference <strong style={{ color: palette.text }}>#{reportResult.id}</strong>
                </p>
                <p style={{ margin: "0 0 1.75rem", color: palette.text + "65", fontSize: "0.82rem", maxWidth: 360, marginInline: "auto" }}>
                  Our team has received your report and will review it. We'll contact you at <strong>{email}</strong> if we need more information.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <button style={btn()} onClick={() => { setReportResult(null); setReportRef(null); setReportBody(""); setReportSubject(""); }}>Submit Another</button>
                  <button style={btn(false)} onClick={() => setActiveTab("support")}>Back to Support</button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem", fontWeight: 800, color: palette.text }}>🚩 Report a Problem</h3>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: palette.text + "65", lineHeight: 1.5 }}>
                    Use this form to report an issue with this vendor directly to our platform team. We review every report confidentially.
                  </p>
                </div>

                {/* Pre-filled reference pill */}
                {reportRef && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.25rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.55rem 0.85rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "#b91c1c", fontWeight: 700 }}>Reporting about:</span>
                    <span style={{ fontSize: "0.8rem", color: "#7f1d1d", flex: 1 }}>{reportRef.label}</span>
                    <button
                      onClick={() => { setReportRef(null); setReportSubject(""); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: "1rem", padding: 0, lineHeight: 1 }}
                      title="Clear"
                    >×</button>
                  </div>
                )}

                {/* Category chips */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Category
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {REPORT_CATS.map(cat => (
                      <button
                        key={cat.value}
                        title={cat.desc}
                        onClick={() => {
                          setReportCategory(cat.value);
                          if (!reportRef) {
                            setReportSubject(cat.label.replace(/^[^\s]+\s/, ""));
                          }
                        }}
                        style={{
                          padding: "0.4rem 0.85rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                          border: reportCategory === cat.value ? `2px solid ${themeColor}` : "2px solid transparent",
                          background: reportCategory === cat.value ? themeColor + "18" : (palette.text === "#fff" ? "rgba(255,255,255,0.1)" : "#f3f4f6"),
                          color: reportCategory === cat.value ? themeColor : palette.text + "90",
                          transition: "all 0.15s",
                        }}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  {reportCategory && (
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: palette.text + "55" }}>
                      {REPORT_CATS.find(c => c.value === reportCategory)?.desc}
                    </p>
                  )}
                </div>

                {/* Reference picker — only shown when no pre-filled ref */}
                {!reportRef && ["transaction", "invoice", "product"].includes(reportCategory) && (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Select {reportCategory === "transaction" ? "Order" : reportCategory === "invoice" ? "Invoice" : "Product"} (optional)
                    </label>
                    <select
                      value=""
                      onChange={e => {
                        if (!e.target.value) return;
                        const [id, ...rest] = e.target.value.split("|");
                        const label = rest.join("|");
                        setReportRef({ type: reportCategory, id, label });
                        setReportSubject(`${REPORT_CATS.find(c => c.value === reportCategory)?.label.replace(/^[^\s]+\s/, "") ?? "Issue"} – ${label}`);
                      }}
                      style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: 8, border: `1.5px solid ${palette.text}30`, background: palette.bg, color: palette.text, fontSize: "0.85rem" }}
                    >
                      <option value="">— Choose one —</option>
                      {reportCategory === "transaction" && transactions.map(tx => (
                        <option key={tx.id} value={`${tx.id}|Order #${tx.id} – ${tx.currency} ${parseFloat(tx.totalAmount).toFixed(2)}`}>
                          Order #{tx.id} — {tx.currency} {parseFloat(tx.totalAmount).toFixed(2)} ({tx.paymentStatus})
                        </option>
                      ))}
                      {reportCategory === "invoice" && invoices.map(inv => (
                        <option key={inv.id} value={`${inv.id}|Invoice #${inv.id}`}>
                          Invoice #{inv.id}
                        </option>
                      ))}
                      {reportCategory === "product" && products.map(p => (
                        <option key={p.productId ?? p.productName} value={`${p.productId ?? p.productName}|${p.productName}`}>
                          {p.productName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject */}
                <div style={{ marginBottom: "1.1rem" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    value={reportSubject}
                    onChange={e => setReportSubject(e.target.value)}
                    placeholder="Brief summary of the issue"
                    maxLength={300}
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: 8, border: `1.5px solid ${palette.text}30`, background: palette.bg, color: palette.text, fontSize: "0.88rem", boxSizing: "border-box" }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Description <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    value={reportBody}
                    onChange={e => setReportBody(e.target.value)}
                    placeholder="Describe what happened in as much detail as possible. Include dates, amounts, and any relevant context."
                    rows={5}
                    maxLength={4000}
                    style={{ width: "100%", padding: "0.65rem 0.75rem", borderRadius: 8, border: `1.5px solid ${palette.text}30`, background: palette.bg, color: palette.text, fontSize: "0.85rem", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: palette.text + "45", textAlign: "right" }}>
                    {reportBody.length}/4000
                  </p>
                </div>

                {reportError && (
                  <p style={{ margin: "0 0 1rem", color: "#ef4444", fontSize: "0.82rem" }}>⚠️ {reportError}</p>
                )}

                {/* Disclaimer + submit */}
                <div style={{ borderTop: `1px solid ${palette.text}15`, paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: palette.text + "50", flex: 1 }}>
                    Reports are reviewed by our trust &amp; safety team. False reports may result in account action.
                  </p>
                  <button
                    style={{ ...btn(), opacity: !reportBody.trim() || submittingReport ? 0.5 : 1 }}
                    disabled={!reportBody.trim() || submittingReport}
                    onClick={submitReport}
                  >
                    {submittingReport ? "Submitting…" : "🚩 Submit Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── New ticket form ──────────────────────────────────────────────── */}
        {view === "new-ticket" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
              <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: themeColor, fontWeight: 700, fontSize: "0.85rem", padding: 0 }}>
                ← Back
              </button>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: palette.text }}>New Support Ticket</h3>
            </div>

            {submitResult ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>✅</div>
                <p style={{ margin: "0 0 0.4rem", fontWeight: 800, fontSize: "1.05rem", color: palette.text }}>Ticket Submitted!</p>
                <p style={{ margin: "0 0 1.5rem", color: palette.text + "70", fontSize: "0.85rem" }}>
                  Your ticket has been received. We'll respond as soon as possible.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <button style={btn()} onClick={() => openTicket(submitResult.ticketToken)}>View Ticket</button>
                  <button style={btn(false)} onClick={() => { setSubmitResult(null); setView("list"); }}>Back to List</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Identity (if new customer) */}
                {!customerInfo?.found && (
                  <div style={{ background: `${themeColor}08`, border: `1px solid ${themeColor}22`, borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: palette.text + "90", fontWeight: 700 }}>📋 Your details</p>
                    <input style={input} placeholder="Your full name *" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                    <input style={input} placeholder="Phone number (optional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                  </div>
                )}

                {/* Subject */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: palette.text + "90", marginBottom: 5 }}>Subject *</label>
                  <input style={input} placeholder="Brief description of your issue" value={formSubject} onChange={e => setFormSubject(e.target.value)} />
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: palette.text + "90", marginBottom: 5 }}>Category</label>
                  <select style={{ ...input }} value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: palette.text + "90", marginBottom: 5 }}>Message *</label>
                  <textarea style={textarea} placeholder="Describe your issue in detail…" value={formMessage} onChange={e => setFormMessage(e.target.value)} />
                </div>

                {/* Optional refs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: 4 }}>Invoice Ref (optional)</label>
                    <input style={input} placeholder="INV-001" value={formInvoice} onChange={e => setFormInvoice(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: palette.text + "80", marginBottom: 4 }}>Order Ref (optional)</label>
                    <input style={input} placeholder="ORD-001" value={formOrder} onChange={e => setFormOrder(e.target.value)} />
                  </div>
                </div>

                {/* Attachments */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: palette.text + "90", marginBottom: 8 }}>Attachments (images / videos, up to 5)</label>
                  <AttachmentPicker
                    attachments={formAttachments}
                    onRemove={i => setFormAttachments(p => p.filter((_, j) => j !== i))}
                    fileRef={newTicketFileRef}
                    onPick={() => newTicketFileRef.current?.click()}
                    themeColor={themeColor}
                  />
                  <input ref={newTicketFileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
                    onChange={e => handleFiles(e.target.files, setFormAttachments)} />
                </div>

                {submitError && <p style={{ margin: 0, color: "#ef4444", fontSize: "0.83rem" }}>{submitError}</p>}

                <button style={{ ...btn(), width: "100%", padding: "0.7rem" }} onClick={submitNewTicket}
                  disabled={submitting || !formSubject.trim() || !formMessage.trim()}>
                  {submitting ? "Submitting…" : "Submit Ticket"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Ticket detail ────────────────────────────────────────────────── */}
        {view === "detail" && (
          <div style={card}>
            <button onClick={() => { setView("list"); setDetail(null); setReplyText(""); setReplyAttachments([]); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: themeColor, fontWeight: 700, fontSize: "0.85rem", padding: 0, marginBottom: "1.25rem" }}>
              ← Back to tickets
            </button>

            {loadingDetail ? (
              <p style={{ textAlign: "center", color: palette.text + "60", padding: "2rem 0" }}>Loading…</p>
            ) : !detail ? (
              <p style={{ textAlign: "center", color: "#ef4444", padding: "2rem 0" }}>Unable to load ticket. Please try again.</p>
            ) : (
              <>
                {/* Ticket header */}
                <div style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: palette.text, flex: 1 }}>{detail.ticket.subject}</h3>
                    <span style={badge(detail.ticket.status)}>{STATUS_LABEL[detail.ticket.status] ?? detail.ticket.status}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: palette.text + "60" }}>
                    #{detail.ticket.id} · {detail.ticket.category} · Opened {fmt(detail.ticket.createdAt)}
                    {detail.ticket.invoiceRef && ` · Inv: ${detail.ticket.invoiceRef}`}
                    {detail.ticket.orderRef && ` · Order: ${detail.ticket.orderRef}`}
                  </p>
                </div>

                {/* Messages thread */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                  {detail.messages.map(m => {
                    const isCustomer = m.senderType === "customer";
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: isCustomer ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.85rem", background: isCustomer ? themeColor : "#f3f4f6", color: isCustomer ? "#fff" : palette.text }}>
                          {isCustomer ? (customerName[0]?.toUpperCase() ?? "C") : (vendorName[0]?.toUpperCase() ?? "S")}
                        </div>
                        <div style={{ flex: 1, maxWidth: "calc(100% - 48px)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: isCustomer ? "row-reverse" : "row", marginBottom: 4 }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: palette.text }}>{m.senderName}</span>
                            <span style={{ fontSize: "0.72rem", color: palette.text + "55" }}>{fmtFull(m.createdAt)}</span>
                          </div>
                          <div style={{
                            background: isCustomer ? `${themeColor}15` : "#f8f9fb",
                            border: isCustomer ? `1px solid ${themeColor}25` : "1px solid rgba(0,0,0,0.07)",
                            borderRadius: isCustomer ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                            padding: "0.7rem 1rem",
                            fontSize: "0.875rem", lineHeight: 1.55, color: palette.text,
                          }}>
                            {m.content}
                          </div>
                          {/* Attachments */}
                          {m.attachmentUrls && m.attachmentUrls.length > 0 && (
                            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", flexDirection: isCustomer ? "row-reverse" : "row" }}>
                              {m.attachmentUrls.map((url, i) => {
                                const isVideo = (m.attachmentTypes?.[i] ?? "") === "video";
                                return isVideo ? (
                                  <video key={i} src={url} controls style={{ maxWidth: 200, maxHeight: 140, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)" }} />
                                ) : (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt="" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(0,0,0,0.1)", cursor: "zoom-in" }} />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply box */}
                {detail.ticket.status !== "closed" ? (
                  <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: "1.25rem" }}>
                    <p style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", fontWeight: 700, color: palette.text + "80" }}>Add a reply</p>
                    <textarea
                      style={{ ...textarea, minHeight: 80, marginBottom: "0.65rem" }}
                      placeholder="Type your reply…"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                    />
                    <AttachmentPicker
                      attachments={replyAttachments}
                      onRemove={i => setReplyAttachments(p => p.filter((_, j) => j !== i))}
                      fileRef={replyFileRef}
                      onPick={() => replyFileRef.current?.click()}
                      themeColor={themeColor}
                    />
                    <input ref={replyFileRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
                      onChange={e => handleFiles(e.target.files, setReplyAttachments)} />
                    {replyError && <p style={{ margin: "0.5rem 0 0", color: "#ef4444", fontSize: "0.82rem" }}>{replyError}</p>}
                    <button style={{ ...btn(), marginTop: "0.75rem" }} onClick={submitReply} disabled={replying || !replyText.trim()}>
                      {replying ? "Sending…" : "Send Reply"}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: palette.text + "60", borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: "1rem" }}>
                    This ticket is closed. Create a new ticket if you need further assistance.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── AttachmentPicker sub-component ────────────────────────────────────────────

function AttachmentPicker({
  attachments,
  onRemove,
  fileRef,
  onPick,
  themeColor,
}: {
  attachments: Attachment[];
  onRemove: (i: number) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: () => void;
  themeColor: string;
}) {
  if (attachments.length === 0 && !fileRef) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      {attachments.map((a, i) => (
        <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0 }}>
          {a.uploading ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontSize: "0.72rem", color: "#888" }}>⏳</div>
          ) : a.error ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fee2e2", fontSize: "0.7rem", color: "#ef4444" }}>✗</div>
          ) : a.mediaType === "video" ? (
            <video src={a.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <img src={a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <button onClick={() => onRemove(i)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", color: "#fff", fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
        </div>
      ))}
      {attachments.length < 5 && (
        <button onClick={onPick} style={{ width: 72, height: 72, borderRadius: 8, border: `1.5px dashed ${themeColor}60`, background: `${themeColor}08`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: themeColor, fontSize: "0.68rem", fontWeight: 700 }}>
          <span style={{ fontSize: "1.3rem" }}>📎</span>
          Attach
        </button>
      )}
    </div>
  );
}
