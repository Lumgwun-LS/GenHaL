/**
 * Vendor support ticket dashboard — list view with stats, filters, and share link.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketCheck, Copy, Check, ExternalLink, Loader2, MessageCircle, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Ticket = {
  id: number; vendorId: number; subject: string; category: string;
  status: string; priority: string; customerName: string; customerEmail?: string;
  productName?: string; invoiceRef?: string; orderRef?: string;
  unreadCount: number; createdAt: string; updatedAt: string;
};
type Stats = { open: number; in_progress: number; resolved: number; closed: number };

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  resolved:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed:      "bg-muted text-muted-foreground",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground", normal: "", high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE_URL}/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

export default function SupportPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: stats } = useQuery<Stats>({ queryKey: ["support-stats"], queryFn: () => apiFetch("/support/tickets/stats") });
  const { data: linkData } = useQuery<{ link: string }>({ queryKey: ["support-link"], queryFn: () => apiFetch("/support/link") });
  const { data, isLoading } = useQuery<{ tickets: Ticket[]; total: number }>({
    queryKey: ["support-tickets", statusFilter],
    queryFn: () => apiFetch(`/support/tickets?status=${statusFilter}&limit=50`),
  });

  const tickets = (data?.tickets ?? []).filter((t) =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.customerName.toLowerCase().includes(search.toLowerCase())
  );

  function copyLink() {
    if (!linkData?.link) return;
    navigator.clipboard?.writeText(linkData.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalOpen = (stats?.open ?? 0) + (stats?.in_progress ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TicketCheck className="w-6 h-6 text-primary" />
            Support Tickets
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage customer enquiries and support requests</p>
        </div>
        {linkData?.link && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg text-sm max-w-xs">
              <span className="text-muted-foreground text-xs truncate">{linkData.link}</span>
            </div>
            <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={linkData.link} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
            </Button>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: stats?.open ?? 0, color: "text-blue-600" },
          { label: "In Progress", value: stats?.in_progress ?? 0, color: "text-yellow-600" },
          { label: "Resolved", value: stats?.resolved ?? 0, color: "text-green-600" },
          { label: "Closed", value: stats?.closed ?? 0, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(s.label.toLowerCase().replace(" ", "_"))}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search by subject or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="open">Open {(stats?.open ?? 0) > 0 && <Badge variant="secondary" className="ml-1">{stats?.open}</Badge>}</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Ticket list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <TicketCheck className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">{search ? "No matching tickets" : `No ${statusFilter.replace("_", " ")} tickets`}</p>
          {statusFilter === "open" && !search && linkData?.link && (
            <p className="text-sm text-muted-foreground">Share your <button onClick={copyLink} className="text-primary underline">support link</button> with customers to start receiving tickets.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`}>
              <Card className="hover:shadow-md transition-all cursor-pointer group">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm">{ticket.subject}</span>
                        {ticket.unreadCount > 0 && (
                          <Badge className="bg-primary text-primary-foreground text-xs px-1.5 py-0">{ticket.unreadCount} new</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <span>#{ticket.id}</span>
                        <span>·</span>
                        <span>{ticket.customerName}</span>
                        {ticket.productName && <><span>·</span><span className="text-primary">{ticket.productName}</span></>}
                        {ticket.invoiceRef && <><span>·</span><span>INV: {ticket.invoiceRef}</span></>}
                        {ticket.orderRef && <><span>·</span><span>ORD: {ticket.orderRef}</span></>}
                        <span>·</span>
                        <Clock className="w-3 h-3" />
                        <span>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[ticket.status]}`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      {ticket.priority !== "normal" && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
