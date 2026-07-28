/**
 * Admin Ratings & Complaints Panel
 * Super-admin view: see all customer ratings and complaints across all vendors.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Rating = {
  id: number; vendorId: number; orderId?: number | null; customerName?: string | null;
  customerEmail?: string | null; rating: number; review?: string | null;
  isVerifiedPurchase: boolean; isPublic: boolean; isFlagged: boolean; createdAt: string;
};

type Complaint = {
  id: number; vendorId: number; orderId?: number | null; customerName?: string | null;
  customerEmail: string; subject: string; body: string; status: string;
  adminNote?: string | null; createdAt: string;
};

function Stars({ n }: { n: number }) {
  return (
    <span>
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{ color: s <= n ? "#f59e0b" : "#e5e7eb" }}>★</span>
      ))}
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  open:       "bg-yellow-100 text-yellow-700",
  in_review:  "bg-blue-100 text-blue-700",
  resolved:   "bg-green-100 text-green-700",
  dismissed:  "bg-gray-100 text-gray-500",
};

export default function RatingsComplaintsPanel() {
  const qc = useQueryClient();
  const [complaintsStatusFilter, setComplaintsStatusFilter] = useState("all");
  const [noteEditing, setNoteEditing] = useState<{ id: number; note: string } | null>(null);

  // ── Ratings query ───────────────────────────────────────────────────────────
  const { data: ratingsData, isLoading: rLoad } = useQuery({
    queryKey: ["admin-ratings"],
    queryFn: () => fetch(`${BASE}/api/admin/ratings`).then(r => r.json()),
  });

  // ── Complaints query ────────────────────────────────────────────────────────
  const complaintsUrl = complaintsStatusFilter === "all"
    ? `${BASE}/api/admin/complaints`
    : `${BASE}/api/admin/complaints?status=${complaintsStatusFilter}`;

  const { data: complaintsData, isLoading: cLoad } = useQuery({
    queryKey: ["admin-complaints", complaintsStatusFilter],
    queryFn: () => fetch(complaintsUrl).then(r => r.json()),
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const patchRating = useMutation({
    mutationFn: ({ id, ...body }: { id: number; isFlagged?: boolean; isPublic?: boolean }) =>
      fetch(`${BASE}/api/admin/ratings/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ratings"] }); },
  });

  const patchComplaint = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: string; adminNote?: string }) =>
      fetch(`${BASE}/api/admin/complaints/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
      setNoteEditing(null);
      toast.success("Complaint updated");
    },
  });

  const ratings: Rating[]     = ratingsData?.ratings   ?? [];
  const complaints: Complaint[] = complaintsData?.complaints ?? [];

  return (
    <Tabs defaultValue="complaints">
      <TabsList className="mb-4">
        <TabsTrigger value="complaints">Complaints ({complaints.length})</TabsTrigger>
        <TabsTrigger value="ratings">Ratings ({ratings.length})</TabsTrigger>
      </TabsList>

      {/* ── Complaints tab ────────────────────────────────────────────────── */}
      <TabsContent value="complaints">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Customer Complaints</CardTitle>
            <Select value={complaintsStatusFilter} onValueChange={setComplaintsStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {cLoad && <p className="text-muted-foreground text-sm animate-pulse">Loading…</p>}
            {!cLoad && complaints.length === 0 && <p className="text-muted-foreground text-sm">No complaints found.</p>}
            <div className="space-y-4">
              {complaints.map(c => (
                <div key={c.id} className="border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-sm">{c.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.customerName || "Anonymous"} · {c.customerEmail} · Order #{c.orderId ?? "—"} · Vendor #{c.vendorId}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? "bg-gray-100"}`}>{c.status}</span>
                      <Select
                        value={c.status}
                        onValueChange={status => patchComplaint.mutate({ id: c.id, status })}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_review">In Review</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="dismissed">Dismissed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{c.body}</p>
                  {c.adminNote && (
                    <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 font-medium">
                      Admin note: {c.adminNote}
                    </p>
                  )}
                  {noteEditing?.id === c.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={noteEditing.note}
                        onChange={e => setNoteEditing({ id: c.id, note: e.target.value })}
                        placeholder="Add admin note…"
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => patchComplaint.mutate({ id: c.id, adminNote: noteEditing.note })}>Save Note</Button>
                        <Button size="sm" variant="outline" onClick={() => setNoteEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setNoteEditing({ id: c.id, note: c.adminNote ?? "" })}>
                      {c.adminNote ? "Edit Note" : "+ Add Note"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Ratings tab ───────────────────────────────────────────────────── */}
      <TabsContent value="ratings">
        <Card>
          <CardHeader>
            <CardTitle>Customer Ratings</CardTitle>
          </CardHeader>
          <CardContent>
            {rLoad && <p className="text-muted-foreground text-sm animate-pulse">Loading…</p>}
            {!rLoad && ratings.length === 0 && <p className="text-muted-foreground text-sm">No ratings yet.</p>}
            <div className="space-y-3">
              {ratings.map(r => (
                <div key={r.id} className="border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Stars n={r.rating} />
                        {r.isVerifiedPurchase && <Badge variant="outline" className="text-green-700 border-green-300 text-xs">✓ Verified</Badge>}
                        {r.isFlagged && <Badge variant="destructive" className="text-xs">Flagged</Badge>}
                        {!r.isPublic && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.customerName || "Anonymous"} · Order #{r.orderId ?? "—"} · Vendor #{r.vendorId}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        onClick={() => patchRating.mutate({ id: r.id, isFlagged: !r.isFlagged })}>
                        {r.isFlagged ? "Unflag" : "Flag"}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        onClick={() => patchRating.mutate({ id: r.id, isPublic: !r.isPublic })}>
                        {r.isPublic ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                  {r.review && (
                    <p className="text-sm text-gray-700 mt-2 italic">"{r.review}"</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
