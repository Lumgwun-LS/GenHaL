/**
 * Billing Intelligence Panel
 *
 * Three clearly-separated sections:
 *  1. Your Platform Costs — what we actually pay per provider
 *     (Replit infrastructure, Twilio, ElevenLabs, OpenAI) with live usage-derived estimates
 *  2. Your Customer Pricing — 500% markup table, side-by-side with provider cost
 *  3. Per-Vendor Usage & Bills — metered consumption + calculated charges per vendor
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Server, Database, Cloud, Zap, TrendingUp,
  DollarSign, Users, HardDrive, Wifi, Bot, Phone,
  Mail, MessageSquare, Info, RefreshCw, Cpu, Music, Mic,
  ArrowUpRight, ArrowRight,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Overview {
  period: { start: string; end: string; label: string };
  totalVendors: number;
  paidVendors: number;
  replitRates: {
    reservedVmStandardPerMonth: number;
    reservedVmNanoPerMonth: number;
    autoscaleGibHour: number;
    egressPerGib: number;
    objectStoragePerGibMonth: number;
    postgresPerGibMonth: number;
    coreWorkspacePerMonth: number;
  };
  providerCosts: Record<string, number>;
  ourRatesPerUnit: Record<string, number>;
  ourInfraRates: { objectStoragePerGibMonth: number; egressPerGib: number };
  markup: number;
  estimatedReplitCosts: {
    fixedVm: number; workspace: number; database: number;
    objectStorage: number; egress: number; externalApis: number; total: number;
  };
  platformUsage: {
    storageGib: number; egressGib: number; uploadsCount: number;
    usageByResource: Record<string, number>;
  };
  revenue: { subscriptions: number; overage: number; total: number };
  projectedBillableRevenue: number;
}

interface VendorBill {
  vendorId: number;
  businessName: string;
  tier: string;
  usage: Record<string, number>;
  lineItems: Record<string, { units: number; unitRate: number; subtotal: number }>;
  ourCostToServe: number;
  billableAmount: number;
  subscriptionRevenue: number;
  overageRevenue: number;
  totalRevenue: number;
  netMargin: number;
  marginPct: number;
}

interface VendorBillsResponse {
  period: { start: string; end: string; label: string };
  bills: VendorBill[];
}

// ── Provider cost definitions (mirrors backend constants) ─────────────────────
// Replit infra costs are derived live from replitRates + usage.
// External provider costs are hardcoded here to match the backend PROVIDER_COST_PER_UNIT.
const TWILIO_COSTS = [
  { label: "Voice calls (outbound)",    unit: "/ min",  cost: 0.013,  resource: "voiceMinutes" },
  { label: "SMS messages (outbound)",   unit: "/ SMS",  cost: 0.0075, resource: "sms" },
];

const ELEVENLABS_COSTS = [
  { label: "Text-to-Speech (TTS)",      unit: "/ min",  cost: 0.005,  resource: "voiceMinutes" },
  { label: "AI music generation",       unit: "/ video", cost: 0.05,  resource: "aiVideos" },
];

const OPENAI_COSTS = [
  { label: "DALL-E 3 image generation", unit: "/ image",   cost: 0.04,  resource: "aiImages" },
  { label: "GPT-4o-mini captions",      unit: "/ caption", cost: 0.002, resource: "aiCaptions" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2)  { return `$${Number(n).toFixed(d)}`; }
function fmtPct(n: number)      { return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }

const RESOURCE_LABELS: Record<string, string> = {
  aiImages: "AI Images", aiVideos: "AI Videos", aiCaptions: "AI Captions",
  voiceMinutes: "Voice Minutes", sms: "SMS Messages", email: "Emails",
};
const RESOURCE_UNITS: Record<string, string> = {
  aiImages: "/ image", aiVideos: "/ video", aiCaptions: "/ caption",
  voiceMinutes: "/ min", sms: "/ SMS", email: "/ email",
};

function tierColor(tier: string) {
  if (tier === "enterprise") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  if (tier === "pro")        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (tier === "starter")    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (tier === "basic")      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-muted text-muted-foreground";
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    opts.push({ value, label });
  }
  return opts;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, accent = "default",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  accent?: "default" | "green" | "amber" | "blue";
}) {
  const c = { default: "text-primary", green: "text-emerald-500", amber: "text-amber-500", blue: "text-blue-500" };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${c[accent]}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className={`w-5 h-5 ${c[accent]} mt-1`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Provider Cost Card ────────────────────────────────────────────────────────
function ProviderCostCard({
  icon: Icon,
  providerName,
  accentClass,
  description,
  rows,
  totalEstimate,
  usageByResource,
}: {
  icon: React.ElementType;
  providerName: string;
  accentClass: string;
  description: string;
  rows: { label: string; unit: string; cost: number; resource?: string }[];
  totalEstimate?: number;
  usageByResource?: Record<string, number>;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-base ${accentClass}`}>
          <Icon className="w-4 h-4" /> {providerName}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Service</TableHead>
              <TableHead className="text-right text-xs">Our Cost</TableHead>
              {usageByResource && <TableHead className="text-right text-xs">Used (this month)</TableHead>}
              {usageByResource && <TableHead className="text-right text-xs">Est. Spend</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const used = r.resource ? (usageByResource?.[r.resource] ?? 0) : null;
              const spend = used !== null ? used * r.cost : null;
              return (
                <TableRow key={r.label}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt(r.cost, 4)} <span className="text-muted-foreground text-xs">{r.unit}</span>
                  </TableCell>
                  {usageByResource && (
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {used !== null ? used.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
                    </TableCell>
                  )}
                  {usageByResource && (
                    <TableCell className="text-right font-mono text-sm">
                      {spend !== null ? fmt(spend, 4) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {totalEstimate !== undefined && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-muted/40 border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Estimated spend this month</span>
            <span className="font-mono font-bold text-sm">{fmt(totalEstimate)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Our Customer Pricing Table ────────────────────────────────────────────────
function CustomerPricingTable({
  providerCosts,
  ourRates,
  markup,
  usageByResource,
}: {
  providerCosts: Record<string, number>;
  ourRates: Record<string, number>;
  markup: number;
  usageByResource: Record<string, number>;
}) {
  const resources = ["aiImages", "aiVideos", "aiCaptions", "voiceMinutes", "sms", "email"];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Resource</TableHead>
          <TableHead className="text-right">Provider Cost</TableHead>
          <TableHead className="text-center">
            <span className="flex items-center justify-center gap-1">
              <ArrowRight className="w-3 h-3" /> {markup}× Markup
            </span>
          </TableHead>
          <TableHead className="text-right text-primary font-semibold">We Charge</TableHead>
          <TableHead className="text-right">Units Used</TableHead>
          <TableHead className="text-right">Revenue Generated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((r) => {
          const provCost = providerCosts[r] ?? 0;
          const ourRate  = ourRates[r] ?? 0;
          const used     = usageByResource[r] ?? 0;
          const revenue  = used * ourRate;
          return (
            <TableRow key={r}>
              <TableCell className="font-medium">{RESOURCE_LABELS[r] ?? r}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground text-sm">
                {fmt(provCost, 4)} <span className="text-xs">{RESOURCE_UNITS[r]}</span>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                  {markup}×
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono font-semibold text-primary">
                {fmt(ourRate, 4)} <span className="text-xs text-muted-foreground">{RESOURCE_UNITS[r]}</span>
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground text-sm">
                {used > 0 ? used.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                {revenue > 0 ? fmt(revenue, 2) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Per-Vendor Bills Table ────────────────────────────────────────────────────
function VendorBillsTable({ bills }: { bills: VendorBill[] }) {
  if (bills.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No vendor usage data for this period.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendor</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead className="text-right">Our Cost to Serve</TableHead>
          <TableHead className="text-right">Billed (5×)</TableHead>
          <TableHead className="text-right">Sub Revenue</TableHead>
          <TableHead className="text-right">Total Revenue</TableHead>
          <TableHead className="text-right">Net Margin</TableHead>
          <TableHead className="text-right">Margin %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bills.map((v) => (
          <TableRow key={v.vendorId}>
            <TableCell>
              <p className="font-medium">{v.businessName || `Vendor #${v.vendorId}`}</p>
              <p className="text-xs text-muted-foreground">ID {v.vendorId}</p>
            </TableCell>
            <TableCell>
              <Badge className={`text-xs capitalize ${tierColor(v.tier)}`}>{v.tier}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground text-sm">{fmt(v.ourCostToServe, 4)}</TableCell>
            <TableCell className="text-right font-mono text-sm">{fmt(v.billableAmount)}</TableCell>
            <TableCell className="text-right font-mono text-sm">{fmt(v.subscriptionRevenue)}</TableCell>
            <TableCell className="text-right font-mono font-semibold">{fmt(v.totalRevenue)}</TableCell>
            <TableCell className={`text-right font-mono font-semibold ${v.netMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {fmt(v.netMargin)}
            </TableCell>
            <TableCell className={`text-right font-mono text-sm ${v.marginPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {fmtPct(v.marginPct)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InfrastructureBillingPanel() {
  const months = monthOptions();
  const [selectedMonth, setSelectedMonth] = useState(months[0]!.value);

  const { data: overview, isLoading: loadingOverview, isError: errorOverview } = useQuery<Overview>({
    queryKey: ["admin-infra-billing-overview", selectedMonth],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/infrastructure-billing/overview?month=${selectedMonth}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load overview");
      return r.json();
    },
  });

  const { data: vendorData, isLoading: loadingVendors } = useQuery<VendorBillsResponse>({
    queryKey: ["admin-infra-billing-vendors", selectedMonth],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/admin/infrastructure-billing/vendor-bills?month=${selectedMonth}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load vendor bills");
      return r.json();
    },
    enabled: !!overview,
  });

  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading billing intelligence…
      </div>
    );
  }
  if (errorOverview || !overview) {
    return <div className="text-center py-12 text-destructive">Failed to load billing data.</div>;
  }

  const usage = overview.platformUsage.usageByResource;

  // Per-provider estimated spend this month (from usage)
  const twilioSpend =
    (usage["voiceMinutes"] ?? 0) * 0.013 +
    (usage["sms"] ?? 0) * 0.0075;

  const elevenLabsSpend =
    (usage["voiceMinutes"] ?? 0) * 0.005 +
    (usage["aiVideos"] ?? 0) * 0.05;

  const openAiSpend =
    (usage["aiImages"] ?? 0) * 0.04 +
    (usage["aiCaptions"] ?? 0) * 0.002;

  const replitInfraSpend =
    overview.estimatedReplitCosts.fixedVm +
    overview.estimatedReplitCosts.workspace +
    overview.estimatedReplitCosts.database +
    overview.estimatedReplitCosts.objectStorage +
    overview.estimatedReplitCosts.egress;

  return (
    <div className="space-y-8">

      {/* ── Header + month selector ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" /> Billing Intelligence
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            What we pay providers · what we charge customers · per-vendor margin
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total Platform Cost" value={fmt(overview.estimatedReplitCosts.total)} sub={overview.period.label} accent="amber" />
        <KpiCard icon={TrendingUp} label="Projected Billable" value={fmt(overview.projectedBillableRevenue)} sub={`${overview.markup}× markup on costs`} accent="green" />
        <KpiCard icon={DollarSign} label="Revenue Collected" value={fmt(overview.revenue.total)} sub={`${fmt(overview.revenue.subscriptions)} sub + ${fmt(overview.revenue.overage)} overage`} />
        <KpiCard icon={Users} label="Vendors" value={String(overview.totalVendors)} sub={`${overview.paidVendors} on paid plans`} accent="blue" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — YOUR PLATFORM COSTS
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" /> Your Platform Costs — {overview.period.label}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          What you actually pay each provider. Live estimates are derived from the resource-usage ledger.
        </p>

        {/* Replit infrastructure */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-600 dark:text-blue-400">
              <Cloud className="w-4 h-4" /> Replit — Infrastructure & Hosting
            </CardTitle>
            <CardDescription className="text-xs">
              Managed VMs, object storage, PostgreSQL, egress, and the Core workspace plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Line Item</TableHead>
                  <TableHead className="text-right text-xs">Published Rate</TableHead>
                  <TableHead className="text-right text-xs">Est. Usage</TableHead>
                  <TableHead className="text-right text-xs">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-muted-foreground" /> API Server VM (Standard 1 vCPU / 2 GiB)</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.reservedVmStandardPerMonth)} / mo</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">1 × reserved</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.reservedVmStandardPerMonth)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-muted-foreground" /> Frontend VM (Nano 0.5 vCPU / 1 GiB)</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.reservedVmNanoPerMonth)} / mo</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">1 × reserved</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.reservedVmNanoPerMonth)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-muted-foreground" /> Replit Core workspace</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.coreWorkspacePerMonth)} / mo</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">1 seat</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.coreWorkspacePerMonth)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><Database className="w-3.5 h-3.5 text-muted-foreground" /> PostgreSQL managed DB</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.postgresPerGibMonth, 3)} / GiB / mo</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">~0.5 GiB</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.estimatedReplitCosts.database, 4)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><HardDrive className="w-3.5 h-3.5 text-muted-foreground" /> Object storage</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.objectStoragePerGibMonth, 3)} / GiB / mo</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{overview.platformUsage.storageGib.toFixed(2)} GiB</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.estimatedReplitCosts.objectStorage, 4)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm"><div className="flex items-center gap-2"><Wifi className="w-3.5 h-3.5 text-muted-foreground" /> Egress (outbound data)</div></TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.replitRates.egressPerGib, 2)} / GiB</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{overview.platformUsage.egressGib.toFixed(3)} GiB</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(overview.estimatedReplitCosts.egress, 4)}</TableCell>
                </TableRow>
                <TableRow className="font-bold bg-muted/30">
                  <TableCell colSpan={3}>Replit subtotal</TableCell>
                  <TableCell className="text-right font-mono">{fmt(replitInfraSpend)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* External provider cards — side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProviderCostCard
            icon={Phone}
            providerName="Twilio"
            accentClass="text-red-600 dark:text-red-400"
            description="Outbound voice calls (per-minute) and SMS messages. Rates are Twilio's published US outbound list prices."
            rows={TWILIO_COSTS}
            totalEstimate={twilioSpend}
            usageByResource={usage}
          />
          <ProviderCostCard
            icon={Mic}
            providerName="ElevenLabs"
            accentClass="text-violet-600 dark:text-violet-400"
            description="Text-to-Speech synthesis for voice campaigns, and AI music generation for video scenes."
            rows={ELEVENLABS_COSTS}
            totalEstimate={elevenLabsSpend}
            usageByResource={usage}
          />
          <ProviderCostCard
            icon={Bot}
            providerName="OpenAI"
            accentClass="text-emerald-600 dark:text-emerald-400"
            description="DALL-E 3 image generation and GPT-4o-mini for AI-generated product captions and social posts."
            rows={OPENAI_COSTS}
            totalEstimate={openAiSpend}
            usageByResource={usage}
          />
        </div>

        {/* Total cost summary strip */}
        <div className="mt-4 rounded-xl border bg-gradient-to-r from-muted/60 to-muted/30 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <span><span className="text-muted-foreground">Replit infra</span> <span className="font-mono font-semibold">{fmt(replitInfraSpend)}</span></span>
            <span className="text-muted-foreground">+</span>
            <span><span className="text-muted-foreground">Twilio</span> <span className="font-mono font-semibold">{fmt(twilioSpend)}</span></span>
            <span className="text-muted-foreground">+</span>
            <span><span className="text-muted-foreground">ElevenLabs</span> <span className="font-mono font-semibold">{fmt(elevenLabsSpend)}</span></span>
            <span className="text-muted-foreground">+</span>
            <span><span className="text-muted-foreground">OpenAI</span> <span className="font-mono font-semibold">{fmt(openAiSpend)}</span></span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total estimated cost</p>
            <p className="text-2xl font-bold font-mono">{fmt(overview.estimatedReplitCosts.total)}</p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — YOUR CUSTOMER PRICING (500% MARKUP)
      ══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-primary" /> Your Customer Pricing — 500% Markup
              </CardTitle>
              <CardDescription>
                Every unit of resource you provide to a vendor is billed at {overview.markup}× the underlying provider
                cost. These rates activate on overages and pay-as-you-go add-ons — vendors within their plan quota pay
                nothing extra.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                500% markup
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <CustomerPricingTable
            providerCosts={overview.providerCosts}
            ourRates={overview.ourRatesPerUnit}
            markup={overview.markup}
            usageByResource={usage}
          />
          <div className="m-4 rounded-lg bg-muted/40 border p-4 text-sm text-muted-foreground flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>Revenue Generated</strong> shows this month's total metered revenue at our 5× rates, based on
              the resource-usage ledger. This is separate from subscription revenue (flat monthly fees).
              Vendors on the free tier are hard-blocked once their quota is exhausted — no overage applies.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — PER-VENDOR USAGE & BILLS
      ══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Per-Vendor Usage & Bills — {overview.period.label}
          </CardTitle>
          <CardDescription>
            Resource consumption from the metering ledger, calculated bill at our 5× rates, subscription revenue
            collected, and net margin per vendor.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingVendors ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading vendor bills…
            </div>
          ) : (
            <VendorBillsTable bills={vendorData?.bills ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Estimates disclaimer */}
      <div className="text-xs text-muted-foreground bg-muted/30 border rounded-lg p-4 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Estimates only.</strong> Replit costs are estimated from published rates and usage proxies. Actual
          invoices may differ based on autoscaling and data transfer peaks. Twilio, ElevenLabs, and OpenAI costs are
          calculated at list prices — check each provider dashboard for actual spend. Storage assumes ~500 KB per image
          and ~15 MB per video.
        </span>
      </div>
    </div>
  );
}
