/**
 * Vendor Customer Messages — split-pane inbox.
 * Left:  contact list (customers from orders + message history)
 * Right: conversation thread + compose box
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Contact = {
  email: string; name?: string; latestAt: string;
  lastBody?: string; lastDir?: string; lastMsgAt?: string | null; unread: number;
};
type Msg = {
  id: number; direction: string; body: string; subject?: string | null;
  customerName?: string | null; createdAt: string; read: boolean;
};

export default function MessagesPage() {
  const qc = useQueryClient();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [composeOpen, setComposeOpen]     = useState(false);
  const [body,    setBody]    = useState("");
  const [subject, setSubject] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toName,  setToName]  = useState("");
  const [search,  setSearch]  = useState("");
  const [sendingEmail, setSendingEmail] = useState(true);
  const [broadcastOpen, setBroadcastOpen]     = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody]     = useState("");
  const [broadcastEmail, setBroadcastEmail]   = useState(true);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ["vendor-msg-contacts"],
    queryFn: () => fetch(`${BASE}/api/vendor-messages/contacts`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["vendor-msg-thread", selectedEmail],
    queryFn: () => fetch(`${BASE}/api/vendor-messages/thread?email=${encodeURIComponent(selectedEmail!)}`).then(r => r.json()),
    enabled: !!selectedEmail,
    refetchInterval: 15_000,
  });

  const sendMsg = useMutation({
    mutationFn: (payload: object) => fetch(`${BASE}/api/vendor-messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-msg-contacts"] });
      qc.invalidateQueries({ queryKey: ["vendor-msg-thread", selectedEmail ?? toEmail] });
      setBody(""); setSubject("");
      if (composeOpen) { setComposeOpen(false); setToEmail(""); setToName(""); }
      toast.success("Message sent");
    },
    onError: () => toast.error("Failed to send message"),
  });

  async function handleBroadcast() {
    if (!broadcastBody.trim()) return;
    setBroadcastSending(true);
    try {
      const res = await fetch(`${BASE}/api/vendor-messages/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: broadcastSubject || undefined, body: broadcastBody, sendEmailNotification: broadcastEmail }),
      });
      const data = (await res.json()) as { ok?: boolean; sent?: number; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Broadcast failed");
      toast.success(data.message ?? `Broadcast sent to ${data.sent ?? 0} customers`);
      setBroadcastOpen(false);
      setBroadcastSubject(""); setBroadcastBody("");
      qc.invalidateQueries({ queryKey: ["vendor-msg-contacts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBroadcastSending(false);
    }
  }

  // Scroll to bottom when thread loads
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages?.length]);

  const contacts: Contact[] = contactsData?.contacts ?? [];
  const filtered = contacts.filter(c =>
    (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );
  const thread: Msg[] = threadData?.messages ?? [];
  const contactName = threadData?.customerName ?? selectedEmail;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const email = composeOpen ? toEmail.trim() : selectedEmail!;
    const name  = composeOpen ? toName.trim()  : (contactName ?? undefined);
    sendMsg.mutate({ customerEmail: email, customerName: name, subject: subject || undefined, body, sendEmailNotification: sendingEmail });
  }

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* ── Left: contact list ─────────────────────────────────────────────── */}
        <aside className="w-72 border-r border-border flex flex-col bg-background shrink-0">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Messages</h2>
              <div className="flex gap-1.5">
                <button onClick={() => setBroadcastOpen(true)}
                  title="Broadcast to all customers"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-muted/60 transition-colors">
                  📢
                </button>
                <button onClick={() => { setComposeOpen(true); setSelectedEmail(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                  + New
                </button>
              </div>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto">
            {contactsLoading && (
              <div className="p-4 text-sm text-muted-foreground animate-pulse text-center">Loading…</div>
            )}
            {!contactsLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <p className="text-2xl mb-2">📭</p>
                <p>No customers yet.<br />Create a new message to start.</p>
              </div>
            )}
            {filtered.map(c => (
              <button key={c.email} onClick={() => { setSelectedEmail(c.email); setComposeOpen(false); }}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors ${
                  selectedEmail === c.email ? "bg-violet-50 dark:bg-violet-950/30 border-l-2 border-l-violet-500" : ""}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                      {(c.name ?? c.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${c.unread > 0 ? "font-bold" : "font-medium"}`}>
                        {c.name || c.email.split("@")[0]}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="ml-2 min-w-[18px] h-[18px] rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0">
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </div>
                {c.lastBody && (
                  <p className="text-xs text-muted-foreground truncate pl-10 mt-0.5">
                    {c.lastDir === "vendor_to_customer" ? "You: " : ""}{c.lastBody.slice(0, 60)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Right: thread / compose ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Compose new message */}
          {composeOpen && (
            <div className="flex-1 flex flex-col">
              <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                <button onClick={() => setComposeOpen(false)} className="text-muted-foreground hover:text-foreground text-lg">←</button>
                <h3 className="font-bold">New Message</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <form onSubmit={handleSend} className="max-w-lg space-y-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">To (Email) *</label>
                    <input value={toEmail} onChange={e => setToEmail(e.target.value)} type="email" required
                      placeholder="customer@email.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Customer Name</label>
                    <input value={toName} onChange={e => setToName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Subject</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)}
                      placeholder="Optional subject line"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Message *</label>
                    <textarea value={body} onChange={e => setBody(e.target.value)} required rows={6}
                      placeholder="Type your message here…"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background resize-none" />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={sendingEmail} onChange={e => setSendingEmail(e.target.checked)}
                      className="w-4 h-4 rounded" />
                    Also send as email to customer
                  </label>
                  <button type="submit" disabled={sendMsg.isPending}
                    className="px-6 py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                    {sendMsg.isPending ? "Sending…" : "Send Message →"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Thread view */}
          {!composeOpen && selectedEmail && (
            <>
              {/* Thread header */}
              <div className="px-6 py-4 border-b border-border flex items-center gap-3 bg-background">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                  {(contactName ?? selectedEmail)[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-sm">{contactName}</p>
                  <p className="text-xs text-muted-foreground">{selectedEmail}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {threadLoading && <p className="text-sm text-muted-foreground text-center">Loading…</p>}
                {!threadLoading && thread.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-3xl mb-3">💬</p>
                    <p className="text-sm">No messages yet. Say hello!</p>
                  </div>
                )}
                {thread.map(m => {
                  const isVendor = m.direction === "vendor_to_customer";
                  return (
                    <div key={m.id} className={`flex ${isVendor ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[72%] px-4 py-3 rounded-2xl ${
                        isVendor
                          ? "text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                      style={isVendor ? { background: "linear-gradient(135deg,#7F50FF,#9f5fcc)" } : {}}>
                        {m.subject && (
                          <p className={`text-[11px] font-bold mb-1 ${isVendor ? "text-white/70" : "text-muted-foreground"}`}>
                            {m.subject}
                          </p>
                        )}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                        <p className={`text-[10px] mt-1.5 ${isVendor ? "text-white/60" : "text-muted-foreground"}`}>
                          {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {isVendor && m.read && " · Read"}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <form onSubmit={handleSend} className="border-t border-border p-4 bg-background">
                <div className="flex gap-3 items-end">
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
                    placeholder={`Message ${contactName}…`}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                    className="flex-1 px-4 py-3 rounded-2xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-muted/30 resize-none" />
                  <button type="submit" disabled={sendMsg.isPending || !body.trim()}
                    className="px-5 py-3 rounded-2xl font-bold text-white text-sm disabled:opacity-40 shrink-0"
                    style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                    {sendMsg.isPending ? "…" : "Send"}
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 cursor-pointer">
                  <input type="checkbox" checked={sendingEmail} onChange={e => setSendingEmail(e.target.checked)} className="w-3.5 h-3.5" />
                  Also deliver via email
                </label>
              </form>
            </>
          )}

          {/* Empty state */}
          {!composeOpen && !selectedEmail && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
              <div className="text-5xl mb-4">💬</div>
              <p className="font-bold text-lg text-foreground mb-2">Customer Messages</p>
              <p className="text-sm max-w-xs">Select a customer from the list to view your conversation, or start a new message.</p>
              <button onClick={() => setComposeOpen(true)} className="mt-6 px-6 py-2.5 rounded-xl font-bold text-white text-sm"
                style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
                + New Message
              </button>
            </div>
          )}
        </div>
      </div>
      {/* ── Broadcast dialog ───────────────────────────────────────────── */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>📢 Broadcast to All Customers</DialogTitle>
            <DialogDescription>
              Send one message (and email) to every customer you've ever done business with — order customers and CRM leads combined.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Subject (optional)</label>
              <input
                value={broadcastSubject}
                onChange={e => setBroadcastSubject(e.target.value)}
                placeholder="e.g. Exciting news for our customers!"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Message *</label>
              <textarea
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                rows={5}
                placeholder="Type your broadcast message here…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-background resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={broadcastEmail} onChange={e => setBroadcastEmail(e.target.checked)} className="w-4 h-4 rounded" />
              Also deliver via email to each customer
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button
              disabled={broadcastSending || !broadcastBody.trim()}
              onClick={handleBroadcast}
              className="gap-2"
              style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)", border: "none", color: "#fff" }}
            >
              {broadcastSending ? "Sending…" : "Send Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
