import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Globe, Instagram, Facebook, Twitter, ShoppingBag,
  FileText, MousePointer2, Link2, MessageSquare,
  Phone, Mail, Building2, MapPin, BarChart3,
  Plus, Clock, RefreshCw,
} from "lucide-react";
import { useUpdateLead, useListPersonActivities, useCreatePersonActivity, getListPersonActivitiesQueryKey } from "@workspace/api-client-react";
import type { Lead } from "@workspace/api-zod";
type PersonActivity = { id: number; vendorId: number; personId: number; type: string; data?: Record<string, unknown> | null; createdAt: string };

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  website: <Globe className="w-3.5 h-3.5" />,
  instagram: <Instagram className="w-3.5 h-3.5" />,
  facebook: <Facebook className="w-3.5 h-3.5" />,
  twitter: <Twitter className="w-3.5 h-3.5" />,
  google_ads: <BarChart3 className="w-3.5 h-3.5" />,
  utm_link: <Link2 className="w-3.5 h-3.5" />,
  form: <FileText className="w-3.5 h-3.5" />,
  order: <ShoppingBag className="w-3.5 h-3.5" />,
  manual: <Plus className="w-3.5 h-3.5" />,
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  page_view: <Globe className="w-3.5 h-3.5 text-blue-500" />,
  form_submit: <FileText className="w-3.5 h-3.5 text-violet-500" />,
  social_click: <MousePointer2 className="w-3.5 h-3.5 text-pink-500" />,
  utm_click: <Link2 className="w-3.5 h-3.5 text-amber-500" />,
  order_placed: <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />,
  manual_note: <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />,
  status_change: <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, string> = {
  converted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  qualified: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  contacted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
};

function activityLabel(a: PersonActivity): string {
  const d = a.data as Record<string, unknown> | null;
  switch (a.type) {
    case "page_view": return `Visited ${d?.page ?? "a page"}`;
    case "form_submit": return `Submitted form "${d?.formName ?? ""}"`;
    case "social_click": return `Clicked from ${d?.platform ?? "social media"}`;
    case "utm_click": return `Clicked link "${d?.linkName ?? ""}" (${d?.utmSource ?? ""})`;
    case "order_placed": return `Placed an order (₦${Number(d?.totalAmount ?? 0).toLocaleString()})`;
    case "manual_note": return String(d?.note ?? "");
    case "status_change": return `Status → ${d?.newStatus ?? ""}`;
    default: return a.type.replace(/_/g, " ");
  }
}

interface Props {
  person: Lead | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function PersonDrawer({ person, open, onClose, onUpdated }: Props) {
  const qc = useQueryClient();
  const updateLead = useUpdateLead();
  const createActivity = useCreatePersonActivity();
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: activities = [], isLoading: loadingActivities } = useListPersonActivities(
    person?.id ?? 0,
    { query: { enabled: open && !!person?.id, queryKey: getListPersonActivitiesQueryKey(person?.id ?? 0) } },
  );

  async function handleStatusChange(status: string) {
    if (!person) return;
    try {
      await updateLead.mutateAsync({ id: person.id, data: { status } });
      onUpdated();
      toast.success("Status updated");
    } catch { toast.error("Failed to update status"); }
  }

  async function handleAddNote() {
    if (!person || !note.trim()) return;
    setSavingNote(true);
    try {
      await createActivity.mutateAsync({ id: person.id, data: { note: note.trim() } });
      setNote("");
      qc.invalidateQueries({ queryKey: getListPersonActivitiesQueryKey(person.id) });
      toast.success("Note added");
    } catch { toast.error("Failed to add note"); }
    setSavingNote(false);
  }

  if (!person) return null;

  const channel = person.channel ?? person.source ?? "manual";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {person.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-lg">{person.name}</SheetTitle>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className={STATUS_COLORS[person.status] ?? ""}>
                  {person.status}
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  {CHANNEL_ICONS[channel]}
                  {channel.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Contact info */}
        <div className="space-y-2 text-sm mb-5">
          {person.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0" />
              <a href={`mailto:${person.email}`} className="hover:underline truncate">{person.email}</a>
            </div>
          )}
          {person.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4 shrink-0" />
              <span>{person.phone}</span>
            </div>
          )}
          {person.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="w-4 h-4 shrink-0" />
              <span>{person.company}</span>
            </div>
          )}
          {person.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{person.location}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-xl font-bold">{person.pageViews}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Page Views</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-xs font-semibold">{person.firstSeenAt ? format(new Date(person.firstSeenAt), "MMM d") : "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">First Seen</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-xs font-semibold">{person.lastSeenAt ? format(new Date(person.lastSeenAt), "MMM d") : "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Last Seen</div>
          </div>
        </div>

        {/* UTM attribution */}
        {(person.utmSource || person.utmCampaign) && (
          <div className="rounded-lg bg-muted/30 border px-3 py-2.5 text-xs mb-5 space-y-1">
            <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Attribution</div>
            {person.utmSource && <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="font-medium">{person.utmSource}</span></div>}
            {person.utmMedium && <div className="flex justify-between"><span className="text-muted-foreground">Medium</span><span className="font-medium">{person.utmMedium}</span></div>}
            {person.utmCampaign && <div className="flex justify-between"><span className="text-muted-foreground">Campaign</span><span className="font-medium">{person.utmCampaign}</span></div>}
            {person.landingPage && <div className="flex justify-between"><span className="text-muted-foreground">Landing</span><span className="font-medium truncate max-w-[140px]">{person.landingPage}</span></div>}
          </div>
        )}

        {/* Pipeline stage */}
        <div className="mb-5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Pipeline Stage</div>
          <Select value={person.status} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="mb-5" />

        {/* Notes */}
        {person.notes && (
          <div className="mb-5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</div>
            <p className="text-sm whitespace-pre-wrap">{person.notes}</p>
          </div>
        )}

        {/* Add note */}
        <div className="mb-5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Add Note</div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a note about this person…"
            rows={2}
            className="text-sm"
          />
          <Button size="sm" className="mt-2" onClick={handleAddNote} disabled={savingNote || !note.trim()}>
            {savingNote ? "Saving…" : "Add Note"}
          </Button>
        </div>

        <Separator className="mb-4" />

        {/* Activity timeline */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Activity Timeline</div>
          {loadingActivities ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          ) : activities.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No activity yet.</div>
          ) : (
            <div className="relative">
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 pl-1">
                    <div className="w-6 h-6 rounded-full bg-background border flex items-center justify-center shrink-0 relative z-10">
                      {ACTIVITY_ICONS[a.type] ?? <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm leading-snug">{activityLabel(a)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(a.createdAt), "MMM d, yyyy · h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
