/**
 * Vendor ticket detail — full message thread with reply and status controls.
 */
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Send, Paperclip, X, Upload, TicketCheck, User, Building2, Image as ImageIcon, Video } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Message = {
  id: number; ticketId: number; senderType: "customer" | "vendor";
  senderName: string; content: string;
  attachmentUrls?: string[] | null; attachmentTypes?: string[] | null;
  createdAt: string;
};
type Ticket = {
  id: number; subject: string; category: string; status: string; priority: string;
  customerName: string; customerEmail?: string; customerPhone?: string;
  productName?: string; invoiceRef?: string; orderRef?: string;
  firstReplyAt?: string; createdAt: string; updatedAt: string;
};

type AttachFile = { file: File; url: string; type: "image" | "video"; uploading: boolean; error?: string };

const STATUS_OPTIONS = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved",    label: "Resolved" },
  { value: "closed",      label: "Closed" },
];
const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];
const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  resolved:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed:      "bg-muted text-muted-foreground",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE_URL}/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const ticketId = params.id;

  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<AttachFile[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ ticket: Ticket; messages: Message[] }>({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => apiFetch(`/support/tickets/${ticketId}`),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { status?: string; priority?: string }) =>
      apiFetch(`/support/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] }); qc.invalidateQueries({ queryKey: ["support-tickets"] }); qc.invalidateQueries({ queryKey: ["support-stats"] }); },
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages?.length]);

  async function uploadFile(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const { uploadUrl, publicUrl } = await apiFetch("/support/upload-url", { method: "POST" });
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return { url: publicUrl, type };
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - attachments.length);
    const startIdx = attachments.length;
    const newAttachments: AttachFile[] = newFiles.map((f) => ({ file: f, url: "", type: f.type.startsWith("video/") ? "video" : "image", uploading: true }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    newFiles.forEach(async (file, i) => {
      const idx = startIdx + i;
      try {
        const { url, type } = await uploadFile(file);
        setAttachments((prev) => prev.map((a, j) => j === idx ? { ...a, url, type, uploading: false } : a));
      } catch {
        setAttachments((prev) => prev.map((a, j) => j === idx ? { ...a, uploading: false, error: "Upload failed" } : a));
      }
    });
  }

  async function sendReply() {
    if (!reply.trim()) return;
    if (attachments.some((a) => a.uploading)) return;
    setSending(true);
    const readyAttachments = attachments.filter((a) => a.url && !a.error);
    try {
      await apiFetch(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: reply.trim(),
          attachmentUrls: readyAttachments.map((a) => a.url),
          attachmentTypes: readyAttachments.map((a) => a.type),
        }),
      });
      setReply(""); setAttachments([]);
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-stats"] });
    } catch (e) { alert((e as Error).message); }
    setSending(false);
  }

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground"><TicketCheck className="w-10 h-10" /><p>Ticket not found</p></div>;

  const { ticket, messages } = data;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Back + header */}
      <div>
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-3" onClick={() => navigate("/support")}>
          <ArrowLeft className="w-4 h-4" /> Back to tickets
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-1">
              <span>#{ticket.id}</span>
              <span>·</span>
              <span>{ticket.customerName}</span>
              {ticket.customerEmail && <><span>·</span><span>{ticket.customerEmail}</span></>}
              {ticket.customerPhone && <><span>·</span><span>{ticket.customerPhone}</span></>}
            </div>
            {(ticket.productName || ticket.invoiceRef || ticket.orderRef) && (
              <div className="flex items-center gap-2 flex-wrap text-sm mt-1">
                {ticket.productName && <Badge variant="outline">Product: {ticket.productName}</Badge>}
                {ticket.invoiceRef && <Badge variant="outline">Invoice: {ticket.invoiceRef}</Badge>}
                {ticket.orderRef && <Badge variant="outline">Order: {ticket.orderRef}</Badge>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={ticket.status} onValueChange={(v) => updateMutation.mutate({ status: v })}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ticket.priority} onValueChange={(v) => updateMutation.mutate({ priority: v })}>
              <SelectTrigger className="w-[110px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Opened {format(new Date(ticket.createdAt), "PPp")}
          {ticket.firstReplyAt && ` · First replied ${formatDistanceToNow(new Date(ticket.firstReplyAt), { addSuffix: true })}`}
        </p>
      </div>

      <Separator />

      {/* Message thread */}
      <div className="space-y-4">
        {messages.map((msg) => {
          const isVendor = msg.senderType === "vendor";
          return (
            <div key={msg.id} className={`flex gap-3 ${isVendor ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium ${isVendor ? "bg-primary" : "bg-muted-foreground"}`}>
                {isVendor ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`flex-1 max-w-[85%] ${isVendor ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-3 ${isVendor ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.attachmentUrls && msg.attachmentUrls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachmentUrls.map((url, i) => {
                        const type = msg.attachmentTypes?.[i] ?? "image";
                        return type === "image" ? (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt="" className="w-24 h-24 object-cover rounded-lg hover:opacity-80 transition-opacity" />
                          </a>
                        ) : (
                          <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-black/20 rounded-lg text-xs">
                            <Video className="w-3.5 h-3.5" /> Video
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {msg.senderName} · {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {ticket.status !== "closed" && (
        <Card className="sticky bottom-4">
          <CardContent className="pt-4 space-y-3">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative group">
                    {a.type === "image" && a.url ? (
                      <img src={a.url} alt="" className="w-14 h-14 object-cover rounded-lg" />
                    ) : (
                      <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center">
                        {a.uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                      </div>
                    )}
                    <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply…"
                rows={3}
                className="flex-1 resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)} />
                <Button type="button" variant="outline" size="sm" className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= 5}>
                  <Paperclip className="w-3.5 h-3.5" /> Attach
                </Button>
              </div>
              <Button size="sm" className="gap-1.5" onClick={sendReply}
                disabled={!reply.trim() || sending || attachments.some((a) => a.uploading)}>
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Reply
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Tip: Ctrl+Enter / ⌘+Enter to send quickly</p>
          </CardContent>
        </Card>
      )}
      {ticket.status === "closed" && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          This ticket is closed. <button className="text-primary underline" onClick={() => updateMutation.mutate({ status: "open" })}>Re-open it</button> to reply.
        </div>
      )}
    </div>
  );
}
