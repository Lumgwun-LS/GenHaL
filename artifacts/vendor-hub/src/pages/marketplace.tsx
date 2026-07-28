import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plug, Unplug, ExternalLink, FileText, Search, Globe, CheckCircle2, AlertCircle, Lock,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PartnerConnection {
  status: "active" | "error" | "revoked";
  authType: string;
  connectedAt: string;
}

interface MarketplacePartner {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  baseUrl: string | null;
  pricingTier: string;
  hasDoc: boolean;
  connection: PartnerConnection | null;
}

async function fetchMarketplace(): Promise<{ partners: MarketplacePartner[] }> {
  const res = await fetch(`${BASE_URL}/api/marketplace`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load marketplace");
  return res.json();
}

async function connectPartner(partnerId: number, body: { authType: string; credential: string }): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/marketplace/${partnerId}/connect`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to connect");
}

async function disconnectPartner(partnerId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/marketplace/${partnerId}/connect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to disconnect");
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    free: "bg-zinc-100 text-zinc-700",
    starter: "bg-blue-100 text-blue-700",
    pro: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[tier] ?? map.free}`}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function ConnectionStatus({ conn }: { conn: PartnerConnection | null }) {
  if (!conn) return null;
  if (conn.status === "active")
    return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />Connected</span>;
  if (conn.status === "error")
    return <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />Error</span>;
  return <span className="flex items-center gap-1 text-xs text-zinc-500"><Lock className="w-3.5 h-3.5" />Revoked</span>;
}

export default function MarketplacePage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<MarketplacePartner | null>(null);
  const [credential, setCredential] = useState("");
  const [authType, setAuthType] = useState("api_key");

  const { data, isLoading } = useQuery({
    queryKey: ["marketplace"],
    queryFn: fetchMarketplace,
  });

  const connectMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { authType: string; credential: string } }) =>
      connectPartner(id, body),
    onSuccess: () => {
      toast.success("Connected successfully");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      setConnecting(null);
      setCredential("");
    },
    onError: () => toast.error("Failed to connect"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => disconnectPartner(id),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: () => toast.error("Failed to disconnect"),
  });

  const partners = useMemo(() => {
    if (!data?.partners) return [];
    if (!search.trim()) return data.partners;
    const q = search.toLowerCase();
    return data.partners.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Connect your business to partner platforms. Access their APIs and developer docs from one place.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search platforms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && partners.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No platforms found</p>
          <p className="text-sm mt-1">Check back later as new partners join the marketplace.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {partners.map((partner) => (
          <Card key={partner.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  {partner.logoUrl ? (
                    <img src={partner.logoUrl} alt={partner.name} className="w-10 h-10 rounded object-contain border" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-base">{partner.name}</CardTitle>
                    <ConnectionStatus conn={partner.connection} />
                  </div>
                </div>
                <TierBadge tier={partner.pricingTier} />
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-3">
              {partner.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{partner.description}</p>
              )}

              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                {/* Docs link */}
                {partner.hasDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(`/docs/${partner.slug}`)}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Docs
                  </Button>
                )}

                {/* Website link */}
                {partner.websiteUrl && (
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <a href={partner.websiteUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Website
                    </a>
                  </Button>
                )}

                {/* Connect / Disconnect */}
                {partner.connection?.status === "active" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5 ml-auto"
                    disabled={disconnectMutation.isPending}
                    onClick={() => disconnectMutation.mutate(partner.id)}
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 ml-auto"
                    onClick={() => { setConnecting(partner); setCredential(""); setAuthType("api_key"); }}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    Connect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Connect Dialog */}
      <Dialog open={!!connecting} onOpenChange={(o) => { if (!o) setConnecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to {connecting?.name}</DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect. Your credential is stored securely and used only to authorise requests from your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Auth type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
              >
                <option value="api_key">API Key</option>
                <option value="oauth">OAuth Token</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{authType === "api_key" ? "API Key" : "Access Token"}</Label>
              <Input
                type="password"
                placeholder={authType === "api_key" ? "sk_live_…" : "Bearer token…"}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in your {connecting?.name} developer settings.
              </p>
            </div>

            {connecting?.websiteUrl && (
              <a
                href={connecting.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Open {connecting.name} to get credentials
              </a>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnecting(null)}>Cancel</Button>
            <Button
              disabled={!credential.trim() || connectMutation.isPending}
              onClick={() => {
                if (!connecting) return;
                connectMutation.mutate({ id: connecting.id, body: { authType, credential } });
              }}
            >
              {connectMutation.isPending ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
