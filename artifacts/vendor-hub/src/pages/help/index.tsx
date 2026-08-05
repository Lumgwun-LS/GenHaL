/**
 * Public customer-facing support ticket form.
 * Accessible at /help/:vendorId — no authentication required.
 *
 * Flow:
 *  1. Customer enters their email → we check if they're already a known contact
 *     of this vendor (CRM lead or past order).
 *  2a. Existing contact → "Welcome back, [name]!" — pre-filled, proceed straight
 *      to the ticket form.
 *  2b. New visitor → show name + phone fields — creates a CRM lead on submit,
 *      adds them to the platform contact registry, and ties the ticket to their
 *      new lead record.
 *  3. Customer fills in subject / category / message / attachments.
 *  4. Success → ticket token link for status tracking.
 */
import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TicketCheck, Paperclip, X, Upload, Loader2, CheckCircle2,
  AlertCircle, UserCheck, UserPlus, ArrowRight,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Product = { id: number; name: string; price: string; category: string };
type VendorInfo = {
  id: number; name: string; logoUrl: string | null;
  description: string | null; brandTheme: string; industry: string;
};
type AttachmentFile = {
  file: File; url: string; type: "image" | "video"; uploading: boolean; error?: string;
};

const CATEGORIES = [
  { value: "general",  label: "General Enquiry" },
  { value: "product",  label: "Product Question" },
  { value: "invoice",  label: "Invoice Issue" },
  { value: "order",    label: "Order Issue" },
  { value: "post",     label: "Post / Content Feedback" },
  { value: "other",    label: "Other" },
];

export default function PublicSupportPage() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId;

  // ── step 1: email verification ──────────────────────────────────────────────
  const [emailInput, setEmailInput] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<null | {
    found: boolean; name?: string; source?: string;
  }>(null);

  // ── step 2: customer identity fields (new visitors only) ────────────────────
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // ── step 3: ticket form ─────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ ticketId: number; ticketToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vendor info + products
  const { data, isLoading, isError } = useQuery<{ vendor: VendorInfo; products: Product[] }>({
    queryKey: ["public-support-vendor", vendorId],
    queryFn: () => fetch(`${BASE_URL}/api/public/support/${vendorId}`).then((r) => {
      if (!r.ok) throw new Error("not found");
      return r.json();
    }),
    enabled: !!vendorId,
    retry: false,
  });

  const vendor = data?.vendor;
  const products = data?.products ?? [];

  // ── email check ─────────────────────────────────────────────────────────────
  async function checkEmail() {
    if (!emailInput.trim()) return;
    setCheckingEmail(true);
    setEmailStatus(null);
    try {
      const r = await fetch(
        `${BASE_URL}/api/public/support/${vendorId}/check-customer?email=${encodeURIComponent(emailInput.trim())}`,
      );
      const data = await r.json();
      setEmailStatus(data);
      if (data.found && data.name) setCustomerName(data.name);
    } catch {
      setEmailStatus({ found: false });
    }
    setCheckingEmail(false);
  }

  // ── file upload ─────────────────────────────────────────────────────────────
  async function uploadFile(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const { uploadUrl, publicUrl } = await fetch(`${BASE_URL}/api/public/support/upload-url`, {
      method: "POST",
    }).then((r) => r.json());
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return { url: publicUrl, type };
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - attachments.length);
    const startIdx = attachments.length;
    const newAtts: AttachmentFile[] = newFiles.map((f) => ({
      file: f, url: "", type: f.type.startsWith("video/") ? "video" : "image", uploading: true,
    }));
    setAttachments((prev) => [...prev, ...newAtts]);
    newFiles.forEach(async (file, i) => {
      try {
        const { url, type } = await uploadFile(file);
        setAttachments((prev) => prev.map((a, j) => j === startIdx + i ? { ...a, url, type, uploading: false } : a));
      } catch {
        setAttachments((prev) => prev.map((a, j) => j === startIdx + i ? { ...a, uploading: false, error: "Upload failed" } : a));
      }
    });
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailStatus) { setError("Please verify your email first"); return; }
    if (!customerName.trim()) { setError("Please enter your name"); return; }
    if (attachments.some((a) => a.uploading)) { setError("Please wait for uploads to finish"); return; }
    setSubmitting(true); setError(null);

    const product = products.find((p) => p.id === parseInt(selectedProductId));
    const readyAttachments = attachments.filter((a) => a.url && !a.error);

    try {
      const res = await fetch(`${BASE_URL}/api/public/support/${vendorId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: emailInput.trim(),
          customerPhone: customerPhone.trim() || undefined,
          subject, category,
          productId: product?.id,
          productName: product?.name,
          invoiceRef: invoiceRef || undefined,
          orderRef: orderRef || undefined,
          message,
          attachmentUrls: readyAttachments.map((a) => a.url),
          attachmentTypes: readyAttachments.map((a) => a.type),
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Failed to submit"); setSubmitting(false); return; }
      setSubmitted({ ticketId: body.ticketId, ticketToken: body.ticketToken });
    } catch { setError("Network error. Please try again."); }
    setSubmitting(false);
  }

  // ── loading / error states ───────────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (isError || !vendor) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <AlertCircle className="w-12 h-12 text-destructive" />
      <h1 className="text-xl font-semibold">Support page not found</h1>
      <p className="text-muted-foreground text-sm">This vendor doesn't have a support page or the link is invalid.</p>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <CheckCircle2 className="w-16 h-16 text-green-500" />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Ticket Submitted!</h1>
        <p className="text-muted-foreground">Your request has been sent to <strong>{vendor.name}</strong>.</p>
        <p className="text-sm text-muted-foreground">Ticket #{submitted.ticketId}</p>
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-medium">Track your ticket status:</p>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <code className="text-xs break-all flex-1">{window.location.origin}/ticket/{submitted.ticketToken}</code>
            <Button size="sm" variant="outline"
              onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/ticket/${submitted.ticketToken}`)}>
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Save this link to check responses from {vendor.name}.</p>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => {
        setSubmitted(null); setEmailStatus(null); setEmailInput(""); setCustomerName("");
        setCustomerPhone(""); setSubject(""); setMessage(""); setAttachments([]);
      }}>Submit another ticket</Button>
    </div>
  );

  const identityConfirmed = !!emailStatus;
  const showTicketForm = identityConfirmed && !!customerName.trim();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-4">
          {vendor.logoUrl ? (
            <img src={vendor.logoUrl} alt={vendor.name} className="w-12 h-12 rounded-xl object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {vendor.name[0]}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold">{vendor.name}</h1>
            <p className="text-sm text-muted-foreground">Support Centre</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TicketCheck className="w-5 h-5 text-primary" />
            Submit a Support Request
          </h2>
          {vendor.description && <p className="text-sm text-muted-foreground mt-1">{vendor.description}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Step 1: email verification ─────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {emailStatus?.found
                  ? <UserCheck className="w-4 h-4 text-green-500" />
                  : emailStatus
                  ? <UserPlus className="w-4 h-4 text-primary" />
                  : <UserCheck className="w-4 h-4 text-muted-foreground" />}
                Your Email Address
              </CardTitle>
              <CardDescription>
                We use this to link your ticket to your account and keep you updated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setEmailStatus(null); setCustomerName(""); }}
                  placeholder="your@email.com"
                  required
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); checkEmail(); } }}
                />
                <Button
                  type="button"
                  variant={emailStatus ? "outline" : "default"}
                  onClick={checkEmail}
                  disabled={!emailInput.trim() || checkingEmail}
                  className="gap-1.5 flex-shrink-0"
                >
                  {checkingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {emailStatus ? "Change" : "Continue"}
                </Button>
              </div>

              {/* Existing customer */}
              {emailStatus?.found && (
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <UserCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      Welcome back, {emailStatus.name}!
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      You're a verified customer of {vendor.name}.
                    </p>
                  </div>
                </div>
              )}

              {/* New visitor — collect name + phone */}
              {emailStatus && !emailStatus.found && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <UserPlus className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      You're new to <strong>{vendor.name}</strong>. Complete your details below — you'll be added as a contact so the vendor can follow up.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Full Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Your name"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+234..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Steps 2 + 3: ticket form (visible once identity confirmed) ──── */}
          {identityConfirmed && customerName.trim() && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Enquiry Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Category <span className="text-destructive">*</span></Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Subject <span className="text-destructive">*</span></Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary of your issue"
                      required
                    />
                  </div>

                  {products.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Related Product <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger><SelectValue placeholder="Select a product…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}{p.price ? ` — ${p.price}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(category === "invoice" || category === "general" || category === "other") && (
                    <div className="space-y-1.5">
                      <Label>Invoice Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="Invoice number or reference" />
                    </div>
                  )}

                  {(category === "order" || category === "general" || category === "other") && (
                    <div className="space-y-1.5">
                      <Label>Order Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="Order ID or reference" />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Message <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe your issue in detail…"
                      rows={5}
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Attachments */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Attachments</CardTitle>
                  <CardDescription>Upload images or videos (max 5 files)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 border rounded-lg">
                          {a.type === "image" && a.url && !a.uploading ? (
                            <img src={a.url} alt="" className="w-10 h-10 object-cover rounded" />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              {a.uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{a.file.name}</p>
                            {a.error && <p className="text-xs text-destructive">{a.error}</p>}
                            {a.uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
                            {!a.uploading && !a.error && <Badge variant="outline" className="text-xs">{a.type}</Badge>}
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attachments.length < 5 && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFilesSelected(e.target.files)}
                      />
                      <Button type="button" variant="outline" className="w-full gap-2"
                        onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-4 h-4" />
                        Add Images / Videos
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !subject.trim() || !message.trim() || attachments.some((a) => a.uploading)}
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>
                  : "Submit Ticket"}
              </Button>
            </>
          )}

          {/* Prompt to verify email first */}
          {!identityConfirmed && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <ArrowRight className="w-4 h-4" />
              Enter your email above and click <strong>Continue</strong> to start your ticket.
            </div>
          )}

          {identityConfirmed && !customerName.trim() && !emailStatus?.found && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <ArrowRight className="w-4 h-4" />
              Enter your name above to continue.
            </div>
          )}
        </form>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by <a href="/" className="underline">Awa Biz Suite</a>
        </p>
      </div>
    </div>
  );
}
