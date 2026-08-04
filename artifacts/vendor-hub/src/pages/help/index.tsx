/**
 * Public customer-facing support ticket form.
 * Accessible at /help/:vendorId — no authentication required.
 * Vendors share this link on social media, email signatures, etc.
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TicketCheck, Paperclip, X, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Product = { id: number; name: string; price: string; category: string };
type VendorInfo = { id: number; name: string; logoUrl: string | null; description: string | null; brandTheme: string; industry: string };

type AttachmentFile = { file: File; url: string; type: "image" | "video"; uploading: boolean; error?: string };

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

  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ ticketId: number; ticketToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!vendorId) return;
    fetch(`${BASE_URL}/api/public/support/${vendorId}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) { setVendor(data.vendor); setProducts(data.products); }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [vendorId]);

  async function uploadFile(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const { uploadUrl, publicUrl } = await fetch(`${BASE_URL}/api/public/support/upload-url`, { method: "POST" }).then((r) => r.json());
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return { url: publicUrl, type };
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - attachments.length);
    const newAttachments: AttachmentFile[] = newFiles.map((f) => ({
      file: f,
      url: "",
      type: f.type.startsWith("video/") ? "video" : "image",
      uploading: true,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);

    newFiles.forEach(async (file, i) => {
      const idx = attachments.length + i;
      try {
        const { url, type } = await uploadFile(file);
        setAttachments((prev) => prev.map((a, j) => j === idx ? { ...a, url, type, uploading: false } : a));
      } catch {
        setAttachments((prev) => prev.map((a, j) => j === idx ? { ...a, uploading: false, error: "Upload failed" } : a));
      }
    });
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attachments.some((a) => a.uploading)) { setError("Please wait for uploads to finish"); return; }
    setSubmitting(true);
    setError(null);

    const readyAttachments = attachments.filter((a) => a.url && !a.error);
    const product = products.find((p) => p.id === parseInt(selectedProductId));

    try {
      const res = await fetch(`${BASE_URL}/api/public/support/${vendorId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName, customerEmail, customerPhone,
          subject, category,
          productId: product?.id ?? undefined,
          productName: product?.name ?? undefined,
          invoiceRef: invoiceRef || undefined,
          orderRef: orderRef || undefined,
          message,
          attachmentUrls: readyAttachments.map((a) => a.url),
          attachmentTypes: readyAttachments.map((a) => a.type),
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to submit ticket"); setSubmitting(false); return; }
      setSubmitted({ ticketId: data.ticketId, ticketToken: data.ticketToken });
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !vendor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-semibold">Support page not found</h1>
        <p className="text-muted-foreground text-sm">This vendor doesn't have a support page or the link is invalid.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background p-6">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Ticket Submitted!</h1>
          <p className="text-muted-foreground">Your support request has been sent to <strong>{vendor.name}</strong>.</p>
          <p className="text-sm text-muted-foreground">Ticket #{submitted.ticketId}</p>
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm font-medium">Track your ticket status:</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="text-xs break-all flex-1">{window.location.origin}/ticket/{submitted.ticketToken}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/ticket/${submitted.ticketToken}`)}>
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Save this link to view responses from {vendor.name}.</p>
          </CardContent>
        </Card>
        <Button variant="outline" onClick={() => { setSubmitted(null); setMessage(""); setSubject(""); setAttachments([]); }}>
          Submit another ticket
        </Button>
      </div>
    );
  }

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
          {/* Contact info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Email Address</Label>
                  <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+234..." />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ticket details */}
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
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of your issue" required />
              </div>

              {/* Optional reference fields */}
              {products.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Related Product <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger><SelectValue placeholder="Select a product…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} {p.price ? `— ${p.price}` : ""}
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
              <CardDescription>Upload images or videos to support your enquiry (max 5 files)</CardDescription>
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
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeAttachment(i)}>
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
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
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

          <Button type="submit" className="w-full" size="lg" disabled={submitting || attachments.some((a) => a.uploading)}>
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting…</> : "Submit Ticket"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by <a href="/" className="underline">Awa Biz Suite</a>
        </p>
      </div>
    </div>
  );
}
