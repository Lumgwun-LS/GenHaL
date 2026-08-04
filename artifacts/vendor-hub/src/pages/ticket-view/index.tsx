/**
 * Public customer ticket view — customer checks their ticket status using the token link.
 * Accessible at /ticket/:token — no authentication required.
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, TicketCheck, User, Building2, Send, Paperclip, X, Video, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Message = { id: number; senderType: "customer" | "vendor"; senderName: string; content: string; attachmentUrls?: string[] | null; attachmentTypes?: string[] | null; createdAt: string };
type Ticket = { id: number; subject: string; category: string; status: string; customerName: string; productName?: string; invoiceRef?: string; orderRef?: string; createdAt: string; updatedAt: string };
type Vendor = { name: string; logoUrl?: string };
type AttachFile = { file: File; url: string; type: "image" | "video"; uploading: boolean; error?: string };

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved:    "bg-green-100 text-green-700",
  closed:      "bg-gray-100 text-gray-600",
};
const STATUS_LABELS: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };

export default function TicketViewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [vendor, setVendor] = useState<Vendor | null>(null);

  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<AttachFile[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch(`${BASE_URL}/api/public/support/ticket/${token}`);
      if (r.status === 404) { setNotFound(true); setLoading(false); return; }
      const data = await r.json();
      setTicket(data.ticket); setMessages(data.messages); setVendor(data.vendor);
    } catch { setNotFound(true); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [token]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function uploadFile(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const { uploadUrl, publicUrl } = await fetch(`${BASE_URL}/api/public/support/upload-url`, { method: "POST" }).then((r) => r.json());
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return { url: publicUrl, type };
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - attachments.length);
    const start = attachments.length;
    const newAtts: AttachFile[] = newFiles.map((f) => ({ file: f, url: "", type: f.type.startsWith("video/") ? "video" : "image", uploading: true }));
    setAttachments((prev) => [...prev, ...newAtts]);
    newFiles.forEach(async (file, i) => {
      try {
        const { url, type } = await uploadFile(file);
        setAttachments((prev) => prev.map((a, j) => j === start + i ? { ...a, url, type, uploading: false } : a));
      } catch {
        setAttachments((prev) => prev.map((a, j) => j === start + i ? { ...a, uploading: false, error: "Upload failed" } : a));
      }
    });
  }

  async function sendReply() {
    if (!reply.trim() || !ticket) return;
    if (attachments.some((a) => a.uploading)) { setSendError("Please wait for uploads to finish"); return; }
    setSending(true); setSendError(null);
    const ready = attachments.filter((a) => a.url && !a.error);
    try {
      const r = await fetch(`${BASE_URL}/api/public/support/ticket/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim(), attachmentUrls: ready.map((a) => a.url), attachmentTypes: ready.map((a) => a.type) }),
      });
      if (!r.ok) { setSendError((await r.json()).error ?? "Failed to send"); setSending(false); return; }
      const msg = await r.json();
      setMessages((prev) => [...prev, msg]);
      setReply(""); setAttachments([]);
      await load(); // refresh ticket status
    } catch { setSendError("Network error. Please try again."); }
    setSending(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (notFound || !ticket) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <AlertCircle className="w-12 h-12 text-destructive" />
      <h1 className="text-xl font-semibold">Ticket not found</h1>
      <p className="text-muted-foreground text-sm">This ticket link is invalid or has expired.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-4">
          {vendor?.logoUrl ? (
            <img src={vendor.logoUrl} alt={vendor?.name} className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
              {vendor?.name?.[0] ?? "?"}
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Support ticket from</p>
            <h1 className="font-semibold">{vendor?.name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Ticket summary */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-bold text-lg">{ticket.subject}</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ticket #{ticket.id} · Opened {format(new Date(ticket.createdAt), "PPp")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {ticket.productName && <Badge variant="outline">Product: {ticket.productName}</Badge>}
            {ticket.invoiceRef && <Badge variant="outline">Invoice: {ticket.invoiceRef}</Badge>}
            {ticket.orderRef && <Badge variant="outline">Order: {ticket.orderRef}</Badge>}
          </div>
        </div>

        <Separator />

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((msg) => {
            const isVendor = msg.senderType === "vendor";
            return (
              <div key={msg.id} className={`flex gap-3 ${isVendor ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white ${isVendor ? "bg-primary" : "bg-muted-foreground"}`}>
                  {isVendor ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className={`flex-1 max-w-[85%] flex flex-col gap-1 ${isVendor ? "items-end" : "items-start"}`}>
                  <div className={`rounded-2xl px-4 py-3 ${isVendor ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.attachmentUrls?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.attachmentUrls.map((url, i) =>
                          (msg.attachmentTypes?.[i] ?? "image") === "image" ? (
                            <a key={i} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt="" className="w-24 h-24 object-cover rounded-lg hover:opacity-80" />
                            </a>
                          ) : (
                            <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-black/20 rounded-lg text-xs">
                              <Video className="w-3.5 h-3.5" /> Video
                            </a>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{msg.senderName} · {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Customer reply */}
        {ticket.status !== "closed" && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-medium">Add a follow-up message</p>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="relative group w-14 h-14">
                      {a.type === "image" && a.url ? (
                        <img src={a.url} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                          {a.uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                        </div>
                      )}
                      <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your message…" rows={3} className="resize-none" />
              {sendError && <p className="text-xs text-destructive">{sendError}</p>}
              <div className="flex items-center justify-between">
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                  {attachments.length < 5 && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="w-3.5 h-3.5" /> Attach
                    </Button>
                  )}
                </div>
                <Button size="sm" className="gap-1.5" onClick={sendReply} disabled={!reply.trim() || sending || attachments.some((a) => a.uploading)}>
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {ticket.status === "closed" && (
          <p className="text-center text-sm text-muted-foreground py-4">This ticket has been closed. Contact the vendor to re-open it.</p>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by <a href="/" className="underline">Awa Biz Suite</a>
        </p>
      </div>
    </div>
  );
}
