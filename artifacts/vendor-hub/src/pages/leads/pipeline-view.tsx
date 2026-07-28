import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUpdateLead, getListLeadsQueryKey } from "@workspace/api-client-react";
import type { Lead } from "@workspace/api-zod";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Globe, Instagram, Facebook, Link2, FileText, ShoppingBag, Plus, BarChart3, Twitter } from "lucide-react";
import { format } from "date-fns";

const STAGES = [
  { key: "new",       label: "New",       color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { key: "contacted", label: "Contacted", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { key: "qualified", label: "Qualified", color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  { key: "converted", label: "Converted", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { key: "lost",      label: "Lost",      color: "bg-destructive/10 text-destructive border-destructive/20" },
];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  website: <Globe className="w-3 h-3" />,
  instagram: <Instagram className="w-3 h-3" />,
  facebook: <Facebook className="w-3 h-3" />,
  twitter: <Twitter className="w-3 h-3" />,
  google_ads: <BarChart3 className="w-3 h-3" />,
  utm_link: <Link2 className="w-3 h-3" />,
  form: <FileText className="w-3 h-3" />,
  order: <ShoppingBag className="w-3 h-3" />,
  manual: <Plus className="w-3 h-3" />,
};

interface Props {
  leads: Lead[];
  onSelect: (lead: Lead) => void;
}

export function PipelineView({ leads, onSelect }: Props) {
  const qc = useQueryClient();
  const updateLead = useUpdateLead();

  async function moveTo(lead: Lead, newStatus: string) {
    try {
      await updateLead.mutateAsync({ id: lead.id, data: { status: newStatus } });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey({}) });
      toast.success(`Moved to ${newStatus}`);
    } catch { toast.error("Failed to update"); }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stage) => {
        const cards = leads.filter((l) => l.status === stage.key);
        return (
          <div key={stage.key} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${stage.color}`}>{stage.label}</Badge>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </div>
            </div>
            <div className="space-y-2 min-h-[120px]">
              {cards.map((lead) => {
                const ch = lead.channel ?? lead.source ?? "manual";
                return (
                  <Card
                    key={lead.id}
                    className="p-3 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
                    onClick={() => onSelect(lead)}
                  >
                    <div className="font-medium text-sm truncate">{lead.name}</div>
                    {lead.email && <div className="text-xs text-muted-foreground truncate mt-0.5">{lead.email}</div>}
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline" className="text-[10px] gap-1 py-0 px-1.5">
                        {CHANNEL_ICONS[ch]}
                        {ch.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(lead.createdAt), "MMM d")}
                      </span>
                    </div>
                    {/* Quick move */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {STAGES.filter((s) => s.key !== stage.key).slice(0, 2).map((s) => (
                        <button
                          key={s.key}
                          onClick={(e) => { e.stopPropagation(); moveTo(lead, s.key); }}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted transition-colors"
                        >
                          → {s.label}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No people here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
