/**
 * Infrastructure Billing Panel
 *
 * Shows:
 *  1. Replit's published rate card (what they charge us)
 *  2. Our 5× customer pricing (what we charge vendors)
 *  3. Estimated platform costs for the selected month
 *  4. Per-vendor usage table with calculated bills and margin
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Server, Database, Cloud, Zap, TrendingUp, TrendingDown,
  DollarSign, Users, Cpu, HardDrive, Wifi, Bot, Phone,
  Mail, MessageSquare, ArrowUpRight, Info, RefreshCw,
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
    fixedVm: number;
    workspace: number;
    database: number;
    objectStorage: number;
    egress: number;
    externalApis: number;
    total: number;
  };
  platformUsage: {
    storageGib: number;
    egressGib: number;
    uploadsCount: number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2) {
  return `$${n.toFixed(decimals)}`;
}

function fmtN(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function resourceLabel(key: string): string {
  const map: Record<string, string> = {
    aiImages:     "AI Images",
    aiVideos:     "AI Videos",
    aiCaptions:   "AI Captions",
    voiceMinutes: "Voice Minutes",
    sms:          "SMS Messages",
    email:        "Emails",
  };
  return map[key] ?? key;
}

function resourceUnit(key: string): string {
  const map: Record<string, string> = {
    aiImages:     "/ image",
    aiVideos:     "/ video",
    aiCaptions:   "/ caption",
    voiceMinutes: "/ min",
    sms:          "/ SMS",
    email:        "/ email",
  };
  return map[key] ?? "";
}

function resourceIcon(key: string) {
  if (key === "aiImages" || key === "aiVideos" || key === "aiCaptions") return Bot;
  if (key === "voiceMinutes") return Phone;
  if (key === "sms") return MessageSquare;
  if (key === "email") return Mail;
  return Zap;
}

function tierColor(tier: string) {
  if (tier === "enterprise") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
  if (tier === "pro")        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (tier === "starter")    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
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

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "green" | "red" | "amber";
}) {
  const colors = {
    default: "from-primary/10 to-primary/5 border-primary/20",
    green:   "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    red:     "from-red-500/10 to-red-500/5 border-red-500/20",
    amber:   "from-amber-500/10 to-amber-500/5 border-amber-500/20",
  };
  const iconColors = {
    default: "text-primary",
    green:   "text-emerald-500",
    red:     "text-red-500",
    amber:   "text-amber-500",
  };
  return (
    <Card className={`bg-gradient-to-br ${colors[accent]} border`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-background/50 ${iconColors[accent]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rate Comparison Table ─────────────────────────────────────────────────────
function RateComparisonTable({ providerCosts, ourRates }: {
  providerCosts: Record<string, number>;
  ourRates: Record<string, number>;
}) {
  const resources = Object.keys(providerCosts);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead className="text-right">Provider / Replit Cost</TableHead>
            <TableHead className="text-right text-primary font-semibold">Our Rate (5×)</TableHead>
            <TableHead className="text-right">Margin per Unit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((key) => {
            const costUs  = providerCosts[key]!;
            const ourRate = ourRates[key]!;
            const margin  = ourRate - costUs;
            const Icon = resourceIcon(key);
            return (
              <TableRow key={key}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{resourceLabel(key)}</span>
                    <span className="text-xs text-muted-foreground">{resourceUnit(key)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {fmt(costUs, 4)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold text-primary">
                  {fmt(ourRate, 4)}
                </TableCell>
                <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                  +{fmt(margin, 4)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Cost Breakdown ────────────────────────────────────────────────────────────
function CostBreakdown({ costs, markup }: {
  costs: Overview["estimatedReplitCosts"];
  markup: number;
}) {
  const rows = [
    { label: "Reserved VMs (API + Web server)", icon: Server,    cost: costs.fixedVm,      note: "Standard $13 + Nano $7" },
    { label: "Replit Core workspace",           icon: Cloud,      cost: costs.workspace,    note: "$25/month plan" },
    { label: "PostgreSQL storage",              icon: Database,   cost: costs.database,     note: "~0.5 GiB estimated" },
    { label: "Object storage",                  icon: HardDrive,  cost: costs.objectStorage,note: "Media files (images + video)" },
    { label: "Egress / data transfer",          icon: Wifi,       cost: costs.egress,       note: "API responses out" },
    { label: "External APIs (AI, voice, SMS)",  icon: Bot,        cost: costs.externalApis, note: "OpenAI · ElevenLabs · Twilio" },
  ];

  const totalBillable = costs.total * markup;

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between py-2 border-b last:border-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-muted">
              <row.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.note}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-semibold">{fmt(row.cost)}</p>
            <p className="font-mono text-xs text-primary">{fmt(row.cost * markup)} at 5×</p>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-dashed">
        <div>
          <p className="font-bold">Total Platform Cost</p>
          <p className="text-xs text-muted-foreground">What Replit + providers charge us</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold">{fmt(costs.total)}</p>
          <p className="font-mono text-sm font-bold text-primary">{fmt(totalBillable)} billable at 5×</p>
        </div>
      </div>
    </div>
  );
}

// ── Vendor Bills Table ────────────────────────────────────────────────────────
function VendorBillsTable({ bills }: { bills: VendorBill[] }) {
  const resources = ["aiImages", "aiVideos", "aiCaptions", "voiceMinutes", "sms", "email"];

  if (bills.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No vendor usage data for this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Vendor</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead className="text-right">AI Images</TableHead>
            <TableHead className="text-right">AI Videos</TableHead>
            <TableHead className="text-right">Captions</TableHead>
            <TableHead className="text-right">Voice Min</TableHead>
            <TableHead className="text-right">SMS</TableHead>
            <TableHead className="text-right">Email</TableHead>
            <TableHead className="text-right border-l">Our Cost</TableHead>
            <TableHead className="text-right text-primary">Their Bill (5×)</TableHead>
            <TableHead className="text-right">Sub Revenue</TableHead>
            <TableHead className="text-right">Net Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((v) => (
            <TableRow key={v.vendorId}>
              <TableCell className="font-medium max-w-40 truncate">{v.businessName}</TableCell>
              <TableCell>
                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${tierColor(v.tier)}`}>
                  {v.tier}
                </span>
              </TableCell>
              {resources.map((r) => (
                <TableCell key={r} className="text-right font-mono text-sm">
                  {(v.usage[r] ?? 0) > 0 ? fmtN(v.usage[r]!) : <span className="text-muted-foreground/40">—</span>}
                </TableCell>
              ))}
              <TableCell className="text-right font-mono text-sm border-l text-muted-foreground">
                {fmt(v.ourCostToServe, 4)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                {v.billableAmount > 0 ? fmt(v.billableAmount) : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {v.subscriptionRevenue > 0 ? fmt(v.subscriptionRevenue) : <span className="text-muted-foreground/40">—</span>}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                <span className={v.netMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                  {v.netMargin >= 0 ? "+" : ""}{fmt(v.netMargin)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function InfrastructureBillingPanel() {
  const months = monthOptions();
  const [month, setMonth] = useState(months[0]!.value);

  const { data: overview, isLoading: loadingOverview } = useQuery<Overview>({
    queryKey: ["admin-infra-billing-overview", month],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin/infrastructure-billing/overview?month=${month}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load billing overview");
      return res.json();
    },
  });

  const { data: vendorData, isLoading: loadingVendors } = useQuery<VendorBillsResponse>({
    queryKey: ["admin-infra-billing-vendor-bills", month],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin/infrastructure-billing/vendor-bills?month=${month}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load vendor bills");
      return res.json();
    },
  });

  const isLoading = loadingOverview || loadingVendors;

  // Summarise vendor data
  const totalBillable  = vendorData?.bills.reduce((s, b) => s + b.billableAmount, 0) ?? 0;
  const totalRevenue   = overview?.revenue.total ?? 0;
  const totalCost      = overview?.estimatedReplitCosts.total ?? 0;
  const netMargin      = totalRevenue - totalCost;
  const vendorsWithUsage = vendorData?.bills.filter(b => b.billableAmount > 0).length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Infrastructure Billing
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Replit + provider costs, our 5× pricing, and per-vendor bills.
          </p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Top KPIs */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading billing data…
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={Server}
              label="Our Replit Cost (est.)"
              value={fmt(totalCost)}
              sub={overview.period.label}
              accent="amber"
            />
            <KpiCard
              icon={DollarSign}
              label="Revenue Collected"
              value={fmt(totalRevenue)}
              sub={`Subs ${fmt(overview.revenue.subscriptions)} + Overage ${fmt(overview.revenue.overage)}`}
              accent="green"
            />
            <KpiCard
              icon={TrendingUp}
              label="Projected Billable (5×)"
              value={fmt(overview.projectedBillableRevenue)}
              sub={`${vendorsWithUsage} vendors with usage`}
              accent="default"
            />
            <KpiCard
              icon={netMargin >= 0 ? TrendingUp : TrendingDown}
              label="Net Margin vs Cost"
              value={`${netMargin >= 0 ? "+" : ""}${fmt(netMargin)}`}
              sub="Revenue collected − our cost"
              accent={netMargin >= 0 ? "green" : "red"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <KpiCard icon={Users}  label="Total Vendors" value={String(overview.totalVendors)} sub={`${overview.paidVendors} on paid plans`} />
            <KpiCard icon={HardDrive} label="Object Storage" value={`${overview.platformUsage.storageGib.toFixed(2)} GiB`} sub={`${overview.platformUsage.uploadsCount} files stored`} />
          </div>

          {/* Section 1 — Replit Rate Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-primary" /> Replit Infrastructure Rate Card
              </CardTitle>
              <CardDescription>
                Published 2025 pricing from replit.com/pricing. These are what Replit charges us.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Replit Rate</TableHead>
                      <TableHead>Our Usage (this month)</TableHead>
                      <TableHead className="text-right">Estimated Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Server className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">Reserved VM — Standard</p><p className="text-xs text-muted-foreground">API Server · 1 vCPU / 2 GiB RAM</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.reservedVmStandardPerMonth}/mo</TableCell>
                      <TableCell className="text-muted-foreground text-sm">1 instance (always-on)</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.replitRates.reservedVmStandardPerMonth)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Server className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">Reserved VM — Nano</p><p className="text-xs text-muted-foreground">Web server · 0.5 vCPU / 1 GiB RAM</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.reservedVmNanoPerMonth}/mo</TableCell>
                      <TableCell className="text-muted-foreground text-sm">1 instance (always-on)</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.replitRates.reservedVmNanoPerMonth)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Cloud className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">Replit Core Workspace</p><p className="text-xs text-muted-foreground">Developer plan</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.coreWorkspacePerMonth}/mo</TableCell>
                      <TableCell className="text-muted-foreground text-sm">1 workspace</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.replitRates.coreWorkspacePerMonth)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">Object Storage</p><p className="text-xs text-muted-foreground">AI-generated + vendor media</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.objectStoragePerGibMonth}/GiB·mo</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{overview.platformUsage.storageGib.toFixed(3)} GiB</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.estimatedReplitCosts.objectStorage, 4)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Database className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">PostgreSQL Database</p><p className="text-xs text-muted-foreground">Neon-backed managed DB</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.postgresPerGibMonth}/GiB·mo</TableCell>
                      <TableCell className="text-muted-foreground text-sm">~0.5 GiB estimated</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.estimatedReplitCosts.database, 4)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">Egress / Data Transfer</p><p className="text-xs text-muted-foreground">Outbound from Replit</p></div></div></TableCell>
                      <TableCell className="font-mono">${overview.replitRates.egressPerGib}/GiB</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{overview.platformUsage.egressGib.toFixed(4)} GiB est.</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.estimatedReplitCosts.egress, 4)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><div className="flex items-center gap-2"><Bot className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium">External APIs</p><p className="text-xs text-muted-foreground">OpenAI · ElevenLabs · Twilio</p></div></div></TableCell>
                      <TableCell className="font-mono text-muted-foreground">per-unit (see below)</TableCell>
                      <TableCell className="text-muted-foreground text-sm">Based on resource_usage ledger</TableCell>
                      <TableCell className="text-right font-mono">{fmt(overview.estimatedReplitCosts.externalApis, 4)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold bg-muted/30">
                      <TableCell colSpan={3}>Total estimated cost this month</TableCell>
                      <TableCell className="text-right font-mono text-lg">{fmt(overview.estimatedReplitCosts.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 — Our Pricing vs Provider Costs */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-primary" /> Our Customer Pricing — 5× Markup
                  </CardTitle>
                  <CardDescription>
                    We charge vendors {overview.markup}× the underlying provider cost for each resource. These rates are applied to vendor
                    usage tracked in the resource ledger.
                  </CardDescription>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  500% markup
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RateComparisonTable
                providerCosts={overview.providerCosts}
                ourRates={overview.ourRatesPerUnit}
              />
              <div className="mt-4 rounded-lg bg-muted/40 border p-4 text-sm text-muted-foreground flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  These metered rates apply on top of subscription plans. Vendors within their quota pay nothing extra —
                  these rates activate only on usage beyond included quotas (overages), or for pay-as-you-go
                  resource add-ons. Infrastructure rates (storage, egress) are reflected in plan pricing.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 — Platform Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> Platform Cost Breakdown — {overview.period.label}
              </CardTitle>
              <CardDescription>Estimated spend broken down by resource category, with the 5× billable equivalent.</CardDescription>
            </CardHeader>
            <CardContent>
              <CostBreakdown costs={overview.estimatedReplitCosts} markup={overview.markup} />
            </CardContent>
          </Card>

          {/* Section 4 — Per-Vendor Bills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Per-Vendor Usage & Bills — {overview.period.label}
              </CardTitle>
              <CardDescription>
                Resource consumption from the metering ledger, calculated bill at our 5× rates, subscription revenue collected,
                and net margin per vendor.
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

          {/* Footer note */}
          <div className="text-xs text-muted-foreground bg-muted/30 border rounded-lg p-4 flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Estimates only.</strong> Replit costs are estimated from published rates and usage proxies (file counts,
              resource ledger). Actual Replit invoices may differ based on autoscaling, data transfer peaks, and plan
              inclusions. External API costs (OpenAI, Twilio, ElevenLabs) are calculated at list prices — check each
              provider dashboard for actual spend. Storage estimates assume average file sizes of 500 KB (images) and 15 MB (videos).
            </span>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">Failed to load billing data.</div>
      )}
    </div>
  );
}
