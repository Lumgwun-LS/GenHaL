import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListUtmLinks,
  useCreateUtmLink,
  useDeleteUtmLink,
  getListUtmLinksQueryKey,
} from "@workspace/api-client-react";
import type { UtmLink } from "@workspace/api-zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, Trash2, Link2, BarChart3, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const MEDIUM_PRESETS = [
  { label: "Instagram Post", source: "instagram", medium: "social", campaign: "" },
  { label: "Facebook Ad", source: "facebook", medium: "paid", campaign: "" },
  { label: "WhatsApp", source: "whatsapp", medium: "chat", campaign: "" },
  { label: "Email Campaign", source: "email", medium: "email", campaign: "" },
  { label: "Google Ads", source: "google", medium: "cpc", campaign: "" },
  { label: "Twitter/X", source: "twitter", medium: "social", campaign: "" },
  { label: "TikTok", source: "tiktok", medium: "social", campaign: "" },
];

function getShortUrl(link: UtmLink): string {
  return `${window.location.origin}${BASE_URL}/api/public/r/${link.shortCode}`;
}

export function UtmTab() {
  const qc = useQueryClient();
  const { data: links = [], isLoading } = useListUtmLinks();
  const createLink = useCreateUtmLink();
  const deleteLink = useDeleteUtmLink();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");

  function applyPreset(p: typeof MEDIUM_PRESETS[0]) {
    setUtmSource(p.source);
    setUtmMedium(p.medium);
  }

  function openCreate() {
    setName(""); setDestinationUrl(""); setUtmSource(""); setUtmMedium(""); setUtmCampaign(""); setUtmContent("");
    setOpen(true);
  }

  async function handleCreate() {
    if (!name || !destinationUrl || !utmSource || !utmMedium || !utmCampaign) {
      toast.error("All required fields must be filled");
      return;
    }
    try {
      await createLink.mutateAsync({ data: { name, destinationUrl, utmSource, utmMedium, utmCampaign, utmContent: utmContent || undefined } });
      qc.invalidateQueries({ queryKey: getListUtmLinksQueryKey() });
      toast.success("Link created");
      setOpen(false);
    } catch { toast.error("Failed to create link"); }
  }

  async function handleDelete(link: UtmLink) {
    if (!confirm(`Delete "${link.name}"?`)) return;
    try {
      await deleteLink.mutateAsync({ id: link.id });
      qc.invalidateQueries({ queryKey: getListUtmLinksQueryKey() });
      toast.success("Link deleted");
    } catch { toast.error("Failed to delete link"); }
  }

  function copyUrl(link: UtmLink) {
    navigator.clipboard.writeText(getShortUrl(link)).then(() => toast.success("Short link copied!"));
  }

  function copyFullUrl(link: UtmLink) {
    navigator.clipboard.writeText(link.fullUrl).then(() => toast.success("Full URL copied!"));
  }

  // Live preview of full URL
  let previewUrl = "";
  try {
    if (destinationUrl && utmSource && utmMedium && utmCampaign) {
      const u = new URL(destinationUrl);
      u.searchParams.set("utm_source", utmSource);
      u.searchParams.set("utm_medium", utmMedium);
      u.searchParams.set("utm_campaign", utmCampaign);
      if (utmContent) u.searchParams.set("utm_content", utmContent);
      previewUrl = u.toString();
    }
  } catch { previewUrl = ""; }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Build trackable links for your ads and social posts. Each click creates or updates a person in your CRM.</p>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />New Link</Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Loading links…</div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Link2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium mb-1">No UTM links yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create links for your Instagram posts, Facebook ads, and more.</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create First Link</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <Card key={link.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{link.name}</span>
                      <Badge variant="outline" className="text-xs">{link.utmSource}</Badge>
                      <Badge variant="outline" className="text-xs">{link.utmMedium}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mb-2">{link.destinationUrl}</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[240px] block">
                        {getShortUrl(link)}
                      </code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      <BarChart3 className="w-3 h-3" />
                      {link.clicks} clicks
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyUrl(link)}>
                    <Copy className="w-3 h-3" />Copy Short Link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyFullUrl(link)}>
                    <Copy className="w-3 h-3" />Copy Full URL
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(link)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">{format(new Date(link.createdAt), "MMM d, yyyy")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create UTM Link</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Link Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram Summer Campaign" />
            </div>
            <div className="space-y-1.5">
              <Label>Destination URL *</Label>
              <Input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://yourshop.com/products" />
            </div>

            {/* Quick presets */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="flex gap-1.5 flex-wrap">
                {MEDIUM_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="text-xs px-2 py-1 rounded-full border hover:bg-muted transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source * <span className="text-muted-foreground text-xs">(e.g. instagram)</span></Label>
                <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="instagram" />
              </div>
              <div className="space-y-1.5">
                <Label>Medium * <span className="text-muted-foreground text-xs">(e.g. social)</span></Label>
                <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="social" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Campaign *</Label>
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="summer_sale" />
              </div>
              <div className="space-y-1.5">
                <Label>Content <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="banner_v1" />
              </div>
            </div>

            {previewUrl && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Preview URL</Label>
                <div className="text-xs bg-muted p-2 rounded break-all">{previewUrl}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLink.isPending}>
              {createLink.isPending ? "Creating…" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
