/**
 * Subscription Plan Editor — Super Admin features: create & delete plans.
 * Regular Admin features: edit existing plans (pricing, quotas, features, gateways).
 *
 * Access levels:
 *   isAdmin      → can edit all fields on existing plans, toggle global gateways,
 *                  manage trial settings, overage rates.
 *   isSuperAdmin → additionally can create new plans and delete existing ones.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Save, Image, Video, MessageSquare, Phone, Mail, Loader2, TrendingUp,
  ClipboardList, Gift, Search, Plus, Trash2, AlertTriangle, Shield,
  CreditCard, SlidersHorizontal, Info,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanQuotas {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

interface PlanPricing {
  usd: number;
  ngn: number;
}

interface PlanGateways {
  stripe: boolean;
  paystack: boolean;
  paypal: boolean;
}

interface Plan {
  tier: string;           // admin-defined slug, immutable once vendors subscribed
  name: string;
  pricing: PlanPricing;
  description: string;
  features: string[];
  highlight: boolean;
  quotas: PlanQuotas;
  gateways?: PlanGateways; // per-plan override; absent = use global
}

interface PaymentGateways {
  stripe: boolean;
  paystack: boolean;
  paypal: boolean;
}

interface TrialSettings {
  enabled: boolean;
  durationDays?: number;
  defaultDurationDays: number;
  availableDurations: number[];
}

interface OverageRates {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

// ─── Cost helpers ─────────────────────────────────────────────────────────────

const UNIT_COSTS: Record<keyof PlanQuotas, number> = {
  aiImages: 0.19, aiVideos: 0.3, aiCaptions: 0.01,
  voiceMinutes: 0.06, sms: 0.01, email: 0.001,
};

function estimatedResourceCost(quotas: PlanQuotas): number {
  return (Object.keys(UNIT_COSTS) as (keyof PlanQuotas)[]).reduce(
    (sum, key) => sum + quotas[key] * UNIT_COSTS[key], 0,
  );
}

const DEFAULT_OVERAGE_RATES: OverageRates = {
  aiImages: 0.50, aiVideos: 1.00, aiCaptions: 0.05,
  voiceMinutes: 0.15, sms: 0.05, email: 0.01,
};
const DEFAULT_TRIAL_SETTINGS: TrialSettings = {
  enabled: true, defaultDurationDays: 7, availableDurations: [7, 14, 21, 30],
};
const USD_TO_NGN_HINT = 1550;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPlans(): Promise<{
  plans: Plan[]; gateways: PaymentGateways;
  overageRates: OverageRates; trialSettings: TrialSettings;
}> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load plans");
  const content = (await res.json()) as {
    "billing.subscriptionPlans": { plans: Plan[] };
    "billing.paymentGateways"?: PaymentGateways;
    "billing.overageRates"?: OverageRates;
    "billing.trialSettings"?: TrialSettings;
  };
  const rawTrial = content["billing.trialSettings"] as (Partial<TrialSettings> & { durationDays?: number }) | undefined;
  const trialSettings: TrialSettings = rawTrial
    ? {
        enabled: rawTrial.enabled ?? true,
        defaultDurationDays: rawTrial.defaultDurationDays ?? rawTrial.durationDays ?? 7,
        availableDurations: rawTrial.availableDurations ?? [7, 14, 21, 30],
      }
    : DEFAULT_TRIAL_SETTINGS;
  return {
    plans: content["billing.subscriptionPlans"].plans,
    gateways: content["billing.paymentGateways"] ?? { stripe: true, paystack: true, paypal: false },
    overageRates: content["billing.overageRates"] ?? DEFAULT_OVERAGE_RATES,
    trialSettings,
  };
}

async function fetchAdminLevel(): Promise<{ isAdmin: boolean; isSuperAdmin: boolean }> {
  const res = await authFetch(`${BASE_URL}/api/admin/check`, { credentials: "include" });
  if (!res.ok) return { isAdmin: false, isSuperAdmin: false };
  return res.json() as Promise<{ isAdmin: boolean; isSuperAdmin: boolean }>;
}

async function savePlans(plans: Plan[]): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/billing.subscriptionPlans`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ value: { plans } }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed to save");
}

async function saveGateways(gateways: PaymentGateways): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/billing.paymentGateways`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ value: gateways }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed to save");
}

async function saveTrialSettings(settings: TrialSettings): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/billing.trialSettings`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ value: settings }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed to save");
}

async function saveOverageRates(rates: OverageRates): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/billing.overageRates`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ value: rates }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed to save");
}

// ─── Change history ───────────────────────────────────────────────────────────

type SiteContentHistoryEntry = {
  id: number; contentKey: string; adminUserId: string;
  adminDisplayName: string | null; oldValue: string; newValue: string; changedAt: string;
};

async function fetchSiteContentHistory(key: string): Promise<SiteContentHistoryEntry[]> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/${encodeURIComponent(key)}/history`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load change history");
  return res.json() as Promise<SiteContentHistoryEntry[]>;
}

function formatPlansValue(raw: string): string {
  try {
    const v = JSON.parse(raw) as { plans?: Plan[] };
    if (!v.plans?.length) return raw;
    return v.plans.map((p) => `${p.name} ($${p.pricing.usd}/₦${p.pricing.ngn})`).join(", ");
  } catch { return raw; }
}

function formatGatewaysValue(raw: string): string {
  try {
    const v = JSON.parse(raw) as Partial<PaymentGateways>;
    const enabled = Object.entries(v).filter(([, on]) => on).map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
    return enabled.length ? enabled.join(", ") + " enabled" : "All disabled";
  } catch { return raw; }
}

function formatOverageRatesValue(raw: string): string {
  try {
    return Object.entries(JSON.parse(raw) as Partial<OverageRates>).map(([k, v]) => `${k}: ${v}`).join(", ");
  } catch { return raw; }
}

function formatTrialSettingsValue(raw: string): string {
  try {
    const v = JSON.parse(raw) as Partial<TrialSettings>;
    if (v.enabled === false) return "Disabled";
    const def = v.defaultDurationDays ?? v.durationDays ?? "?";
    const avail = v.availableDurations ? v.availableDurations.join(", ") + " days" : `${def} days`;
    return `Default ${def}d — options: ${avail}`;
  } catch { return raw; }
}

function SiteContentHistoryCard({ title, description, queryKey, contentKey, formatValue }: {
  title: string; description: string; queryKey: string[];
  contentKey: string; formatValue: (raw: string) => string;
}) {
  const { data: history, isLoading } = useQuery({
    queryKey, queryFn: () => fetchSiteContentHistory(contentKey),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="w-4 h-4" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading history…</div>
        ) : !history?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No changes recorded yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Changed By</TableHead>
                <TableHead>Previous</TableHead>
                <TableHead>New</TableHead>
                <TableHead className="text-right">Changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">
                    {entry.adminDisplayName ?? <span className="font-mono">{entry.adminUserId}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatValue(entry.oldValue)}</TableCell>
                  <TableCell className="text-xs">{formatValue(entry.newValue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {new Date(entry.changedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Shared Field wrapper ─────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const QUOTA_FIELDS: { key: keyof PlanQuotas; label: string; icon: typeof Image }[] = [
  { key: "aiImages",     label: "AI images / mo",    icon: Image },
  { key: "aiVideos",     label: "AI videos / mo",    icon: Video },
  { key: "aiCaptions",   label: "AI captions / mo",  icon: MessageSquare },
  { key: "voiceMinutes", label: "Voice minutes / mo", icon: Phone },
  { key: "sms",          label: "SMS / mo",           icon: MessageSquare },
  { key: "email",        label: "Emails / mo",        icon: Mail },
];

// ─── Create Plan Dialog ───────────────────────────────────────────────────────

const BLANK_PLAN: Plan = {
  tier: "",
  name: "",
  pricing: { usd: 0, ngn: 0 },
  description: "",
  features: [],
  highlight: false,
  quotas: { aiImages: 0, aiVideos: 0, aiCaptions: 0, voiceMinutes: 0, sms: 0, email: 0 },
  gateways: { stripe: true, paystack: true, paypal: false },
};

function CreatePlanDialog({
  open, existingTiers, onClose, onCreate,
}: {
  open: boolean; existingTiers: string[]; onClose: () => void; onCreate: (plan: Plan) => void;
}) {
  const [plan, setPlan] = useState<Plan>(BLANK_PLAN);
  const [featuresText, setFeaturesText] = useState("");
  const [showPass, setShowPass] = useState(false);

  const tierError = (() => {
    if (!plan.tier) return null;
    if (!/^[a-z][a-z0-9_-]*$/.test(plan.tier)) return "Must start with a lowercase letter; only a–z, 0–9, hyphens, underscores.";
    if (existingTiers.includes(plan.tier)) return "A plan with this tier slug already exists.";
    return null;
  })();

  const canCreate = plan.tier.length > 0 && !tierError && plan.name.length > 0 && plan.pricing.usd >= 0;

  const handleCreate = () => {
    const cleanedFeatures = featuresText.split("\n").map((f) => f.trim()).filter(Boolean);
    onCreate({ ...plan, features: cleanedFeatures });
    setPlan(BLANK_PLAN);
    setFeaturesText("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Create New Subscription Plan
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Tier slug warning */}
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Tier slug is immutable once vendors subscribe</p>
              <p className="text-amber-800 text-xs mt-0.5">
                The tier slug is used throughout billing, webhooks, and checkout. Choose it carefully —
                changing it after vendors have subscribed will break tier lookups for those vendors.
              </p>
            </div>
          </div>

          {/* Slug + Name */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tier slug * (e.g. growth, agency, basic)">
              <Input
                value={plan.tier}
                onChange={(e) => setPlan((p) => ({ ...p, tier: e.target.value.toLowerCase().replace(/\s/g, "-") }))}
                placeholder="my-plan"
                className={tierError ? "border-destructive" : ""}
              />
              {tierError && <p className="text-[11px] text-destructive">{tierError}</p>}
            </Field>
            <Field label="Display name *">
              <Input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} placeholder="My Plan" />
            </Field>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Price / month (USD)" hint={`≈ ₦${Math.round(plan.pricing.usd * USD_TO_NGN_HINT).toLocaleString()} at ~${USD_TO_NGN_HINT} NGN/USD`}>
              <Input type="number" min={0} step="0.01" value={plan.pricing.usd}
                onChange={(e) => setPlan((p) => ({ ...p, pricing: { ...p.pricing, usd: Number(e.target.value) } }))} />
            </Field>
            <Field label="Price / month (NGN)" hint="Paystack billing — set independently of USD">
              <Input type="number" min={0} step="1" value={plan.pricing.ngn}
                onChange={(e) => setPlan((p) => ({ ...p, pricing: { ...p.pricing, ngn: Number(e.target.value) } }))} />
            </Field>
            <Field label="">
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={plan.highlight} onCheckedChange={(v) => setPlan((p) => ({ ...p, highlight: v }))} />
                <Label className="text-sm">Highlight this plan</Label>
              </div>
            </Field>
          </div>

          <Field label="Description">
            <Textarea rows={2} value={plan.description}
              onChange={(e) => setPlan((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short marketing description shown on the pricing page" />
          </Field>

          <Field label="Features (one per line)">
            <Textarea rows={5} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)}
              placeholder={"Everything in Starter\nUnlimited orders\nPriority support"} />
          </Field>

          {/* Quotas */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Monthly resource quotas</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {QUOTA_FIELDS.map(({ key, label, icon: Icon }) => (
                <Field key={key} label={label}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Input type="number" min={0} value={plan.quotas[key]}
                      onChange={(e) => setPlan((p) => ({ ...p, quotas: { ...p.quotas, [key]: Number(e.target.value) } }))} />
                  </div>
                </Field>
              ))}
            </div>
          </div>

          {/* Per-plan gateways */}
          <GatewaysSection
            gateways={plan.gateways ?? { stripe: true, paystack: true, paypal: false }}
            onChange={(g) => setPlan((p) => ({ ...p, gateways: g }))}
            isNew
          />
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canCreate} onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeletePlanDialog({ plan, onClose, onDelete }: {
  plan: Plan | null; onClose: () => void; onDelete: () => void;
}) {
  const [confirmed, setConfirmed] = useState("");
  if (!plan) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" /> Delete "{plan.name}"?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">This is irreversible</p>
              <p className="text-red-800 mt-1">
                Vendors currently subscribed to tier <code className="font-mono bg-red-100 px-1 rounded">{plan.tier}</code> will
                keep their subscription status in the database, but the plan details (name, features, pricing) will no longer
                be loadable. Remove all active subscribers from this tier before deleting it.
              </p>
            </div>
          </div>
          <Field label={`Type "${plan.tier}" to confirm`}>
            <Input value={confirmed} onChange={(e) => setConfirmed(e.target.value)} placeholder={plan.tier} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={confirmed !== plan.tier} onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-plan Gateways section ────────────────────────────────────────────────

function GatewaysSection({
  gateways, onChange, isNew = false,
}: {
  gateways: PlanGateways; onChange: (g: PlanGateways) => void; isNew?: boolean;
}) {
  const items: { key: keyof PlanGateways; label: string; currency: string; description: string }[] = [
    { key: "stripe",   label: "Stripe",   currency: "USD", description: "Card payments via Stripe; billed in USD." },
    { key: "paystack", label: "Paystack", currency: "NGN", description: "Card / bank for Nigerian vendors; billed in NGN." },
    { key: "paypal",   label: "PayPal",   currency: "USD", description: "PayPal subscription billing in USD." },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Gateways available for this plan</Label>
        <div className="relative group">
          <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-popover border p-2 text-xs shadow-md opacity-0 group-hover:opacity-100 pointer-events-none z-10">
            Per-plan setting is intersected with the global gateway switches. A gateway disabled globally is never available
            to any plan even if enabled here.
          </div>
        </div>
      </div>
      <div className={`grid gap-2 ${isNew ? "grid-cols-1" : "grid-cols-3"}`}>
        {items.map(({ key, label, currency, description }) => (
          <div key={key}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
              gateways[key] ? "bg-muted/20 border-primary/30" : "bg-muted/5"
            }`}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium">{label}</p>
                <Badge variant="outline" className="text-[10px] px-1 py-0">{currency}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <Switch checked={gateways[key]} onCheckedChange={(v) => onChange({ ...gateways, [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan, isSuperAdmin: superAdmin, onChange, onDelete,
}: {
  plan: Plan; isSuperAdmin: boolean; onChange: (next: Plan) => void; onDelete: () => void;
}) {
  const cost = estimatedResourceCost(plan.quotas);
  const marginUsd = cost > 0 ? plan.pricing.usd / cost : Infinity;
  const planGateways = plan.gateways ?? { stripe: true, paystack: true, paypal: true };

  return (
    <Card className={plan.highlight ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="flex items-center gap-2">
              {plan.name}
              {plan.highlight && <Badge>Highlighted</Badge>}
            </CardTitle>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">{plan.tier}</Badge>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Highlight</Label>
              <Switch checked={plan.highlight} onCheckedChange={(v) => onChange({ ...plan, highlight: v })} />
            </div>
            {superAdmin && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={onDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Tier key: <code className="font-mono bg-muted px-1 rounded">{plan.tier}</code>
          {" — "}used by billing/checkout. {superAdmin ? "Delete only after all vendors on this tier have been migrated." : "Contact a super admin to rename or delete this plan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Name + Pricing */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Display name">
            <Input value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} />
          </Field>
          <Field
            label="Price / month (USD — Stripe)"
            hint={`Reference: $${plan.pricing.usd} × ~${USD_TO_NGN_HINT} ≈ ₦${Math.round(plan.pricing.usd * USD_TO_NGN_HINT).toLocaleString()}`}
          >
            <Input type="number" min={0} step="0.01" value={plan.pricing.usd}
              onChange={(e) => onChange({ ...plan, pricing: { ...plan.pricing, usd: Number(e.target.value) } })} />
          </Field>
          <Field label="Price / month (NGN — Paystack)">
            <Input type="number" min={0} step="1" value={plan.pricing.ngn}
              onChange={(e) => onChange({ ...plan, pricing: { ...plan.pricing, ngn: Number(e.target.value) } })} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea rows={2} value={plan.description} onChange={(e) => onChange({ ...plan, description: e.target.value })} />
        </Field>

        <Field label="Features (one per line)">
          <Textarea
            rows={5}
            value={plan.features.join("\n")}
            onChange={(e) => onChange({ ...plan, features: e.target.value.split("\n") })}
            onBlur={(e) => onChange({ ...plan, features: e.target.value.split("\n").map((f) => f.trim()).filter(Boolean) })}
          />
        </Field>

        {/* Quotas */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Monthly resource quotas bundled into this plan</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUOTA_FIELDS.map(({ key, label, icon: Icon }) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Input type="number" min={0} value={plan.quotas[key]}
                    onChange={(e) => onChange({ ...plan, quotas: { ...plan.quotas, [key]: Number(e.target.value) } })} />
                </div>
              </Field>
            ))}
          </div>
        </div>

        {/* Margin estimate */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>Estimated resource cost at full quota: <strong>${cost.toFixed(2)}</strong>/mo</span>
          <span className={marginUsd >= 5 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
            {isFinite(marginUsd) ? `${marginUsd.toFixed(1)}x margin (USD)` : "∞ margin"}
          </span>
        </div>

        {/* Per-plan gateways */}
        <GatewaysSection
          gateways={planGateways}
          onChange={(g) => onChange({ ...plan, gateways: g })}
        />
      </CardContent>
    </Card>
  );
}

// ─── Assign Trial Card ────────────────────────────────────────────────────────

interface VendorSearchResult {
  id: number; name: string; email: string; subscriptionTier: string; trialEndsAt: string | null;
}

async function searchVendors(q: string): Promise<VendorSearchResult[]> {
  if (q.length < 2) return [];
  const res = await authFetch(`${BASE_URL}/api/admin/vendors/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json() as Promise<VendorSearchResult[]>;
}

async function assignTrial(vendorId: number, durationDays: number): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/vendors/${vendorId}/trial`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ durationDays }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed to assign trial");
}

function AssignTrialCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<VendorSearchResult | null>(null);
  const [duration, setDuration] = useState<number>(7);
  const [assigning, setAssigning] = useState(false);
  const qc = useQueryClient();

  async function handleSearch(q: string) {
    setQuery(q); setSelected(null);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchVendors(q)); } finally { setSearching(false); }
  }

  async function handleAssign() {
    if (!selected) return;
    setAssigning(true);
    try {
      await assignTrial(selected.id, duration);
      toast.success(`${duration}-day trial assigned to ${selected.name}. They've been emailed.`);
      setSelected(null); setQuery(""); setResults([]);
      qc.invalidateQueries({ queryKey: ["trial-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign trial");
    } finally { setAssigning(false); }
  }

  const trialActive = selected?.trialEndsAt && new Date(selected.trialEndsAt) > new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-violet-400" /> Assign Free Trial to Vendor
        </CardTitle>
        <CardDescription>
          Manually grant a trial to any free-tier vendor. They receive an in-app notification and a welcome email
          immediately, and gain full starter-plan access until the trial expires.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Search vendor (name or email)">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-8" placeholder="e.g. John Doe or john@example.com"
              value={query} onChange={(e) => handleSearch(e.target.value)} />
          </div>
          {searching && <p className="text-xs text-muted-foreground mt-1">Searching…</p>}
          {!searching && results.length > 0 && !selected && (
            <div className="mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
              {results.map((v) => (
                <button key={v.id}
                  onClick={() => { setSelected(v); setResults([]); setQuery(v.name); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{v.name}</span>
                    <span className="text-muted-foreground ml-2">{v.email}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{v.subscriptionTier}</Badge>
                </button>
              ))}
            </div>
          )}
        </Field>

        {selected && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{selected.name}</p>
                <p className="text-xs text-muted-foreground">{selected.email} · Tier: {selected.subscriptionTier}</p>
                {trialActive && (
                  <p className="text-xs text-amber-500 mt-0.5">
                    ⚠ Active trial until {new Date(selected.trialEndsAt!).toLocaleDateString()} — assigning will overwrite it.
                  </p>
                )}
              </div>
              <button onClick={() => { setSelected(null); setQuery(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
                Change
              </button>
            </div>
            <Field label="Trial duration">
              <div className="flex gap-2 flex-wrap">
                {[7, 14, 21, 30].map((d) => (
                  <button key={d} onClick={() => setDuration(d)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      duration === d ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}>
                    {d} days
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAssign} disabled={assigning}>
                {assigning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Gift className="w-3.5 h-3.5 mr-1.5" />}
                Assign {duration}-day trial to {selected.name}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Overage rate fields ──────────────────────────────────────────────────────

const OVERAGE_RATE_FIELDS: { key: keyof OverageRates; label: string; hint: string }[] = [
  { key: "aiImages",     label: "AI image",      hint: "per image generated" },
  { key: "aiVideos",     label: "AI video",      hint: "per video generated" },
  { key: "aiCaptions",   label: "AI caption",    hint: "per caption generated" },
  { key: "voiceMinutes", label: "Voice minute",  hint: "per minute of voice calls" },
  { key: "sms",          label: "SMS",           hint: "per SMS sent" },
  { key: "email",        label: "Email",         hint: "per email sent" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlansEditor() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-subscription-plans"], queryFn: fetchPlans,
  });
  const { data: adminLevel } = useQuery({
    queryKey: ["admin-level"], queryFn: fetchAdminLevel,
  });

  const [draft, setDraft] = useState<Plan[]>([]);
  const [gateways, setGateways] = useState<PaymentGateways>({ stripe: true, paystack: true, paypal: false });
  const [overageRates, setOverageRates] = useState<OverageRates>(DEFAULT_OVERAGE_RATES);
  const [trialSettings, setTrialSettings] = useState<TrialSettings>(DEFAULT_TRIAL_SETTINGS);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGateways, setSavingGateways] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const [showCreateDlg, setShowCreateDlg] = useState(false);
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);
  const qc = useQueryClient();

  const isSuperAdmin = adminLevel?.isSuperAdmin ?? false;

  useEffect(() => {
    if (data && !seeded) {
      setDraft(data.plans);
      setGateways(data.gateways);
      setOverageRates(data.overageRates);
      setTrialSettings(data.trialSettings);
      setSeeded(true);
    }
  }, [data, seeded]);

  async function save() {
    setSaving(true);
    try {
      await savePlans(draft);
      toast.success("Plans saved. New pricing, quotas, and gateway settings are live immediately.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function saveTrial() {
    setSavingTrial(true);
    try {
      await saveTrialSettings(trialSettings);
      toast.success("Trial settings saved.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingTrial(false); }
  }

  async function saveRates() {
    setSavingRates(true);
    try {
      await saveOverageRates(overageRates);
      toast.success("Overage rates saved. New rates apply to all future charges.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingRates(false); }
  }

  async function toggleGateway(key: keyof PaymentGateways, value: boolean) {
    if (!value) {
      const next = { ...gateways, [key]: false };
      if (!Object.values(next).some(Boolean)) {
        toast.error("At least one payment gateway must stay enabled for subscriptions.");
        return;
      }
    }
    const next = { ...gateways, [key]: value };
    setGateways(next);
    setSavingGateways(true);
    try {
      await saveGateways(next);
      toast.success("Global gateway settings saved.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
      qc.invalidateQueries({ queryKey: ["subscription-plans"] });
    } catch (e) {
      setGateways(gateways);
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingGateways(false); }
  }

  const handleCreatePlan = (plan: Plan) => {
    setDraft((d) => [...d, plan]);
    setShowCreateDlg(false);
    toast.success(`Plan "${plan.name}" added. Click "Save all plans" to persist it.`);
  };

  const handleDeletePlan = (plan: Plan) => {
    setDraft((d) => d.filter((p) => p.tier !== plan.tier));
    setDeletePlan(null);
    toast.success(`Plan "${plan.name}" removed from draft. Click "Save all plans" to persist.`);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading plans…</div>;
  if (error) return (
    <div className="p-8 text-center space-y-3">
      <p className="font-medium text-destructive">Couldn't load plans.</p>
      <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Access level banner */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${
        isSuperAdmin ? "bg-violet-50 border-violet-200 text-violet-900" : "bg-muted/30 border-border text-muted-foreground"
      }`}>
        <Shield className={`w-5 h-5 shrink-0 ${isSuperAdmin ? "text-violet-600" : "text-muted-foreground/60"}`} />
        <div>
          <p className="font-semibold">{isSuperAdmin ? "Super Admin — full plan management" : "Admin — edit existing plans"}</p>
          <p className={`text-xs mt-0.5 ${isSuperAdmin ? "text-violet-700" : ""}`}>
            {isSuperAdmin
              ? "You can create new plans, delete existing plans, and edit all plan settings including per-plan gateway overrides."
              : "You can edit pricing, quotas, features, and gateway overrides on existing plans. To create or delete plans, contact a super admin."}
          </p>
        </div>
      </div>

      {/* Guidance */}
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Set the price, features, and bundled monthly resource quotas for each subscription tier. The margin badge estimates
        gross margin if a vendor fully uses their quota. Aim for ≥ 5× margin over estimated provider costs.
        Per-plan gateway settings let you restrict which payment methods are offered for each plan — e.g. offer only Paystack
        (NGN) for a local-market plan. Global gateway switches override all per-plan settings.
      </div>

      {/* Global gateway switches */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Global Subscription Payment Gateways
              </CardTitle>
              <CardDescription className="mt-1">
                Master switches — a gateway disabled here is unavailable to ALL plans regardless of per-plan settings.
                Stripe bills in USD · Paystack bills in NGN · PayPal bills in USD.
              </CardDescription>
            </div>
            {savingGateways && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          {(["stripe", "paystack", "paypal"] as const).map((key) => {
            const labels: Record<string, { name: string; currency: string; desc: string }> = {
              stripe:   { name: "Stripe",   currency: "USD", desc: "Card payments, Customer Portal for self-service." },
              paystack: { name: "Paystack", currency: "NGN", desc: "Card/bank for Nigerian vendors; NGN billing." },
              paypal:   { name: "PayPal",   currency: "USD", desc: "PayPal subscription billing in USD." },
            };
            const { name, currency, desc } = labels[key];
            return (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3 flex-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{name}</p>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{currency}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={gateways[key]} disabled={savingGateways} onCheckedChange={(v) => toggleGateway(key, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SiteContentHistoryCard
        title="Gateway Toggle History" description="Every change to global gateway switches — who, from what, and when."
        queryKey={["admin-billing-gateways-history"]} contentKey="billing.paymentGateways"
        formatValue={formatGatewaysValue}
      />

      {/* Trial settings */}
      <Card>
        <CardHeader>
          <CardTitle>Free Trial</CardTitle>
          <CardDescription>
            When enabled, new vendors can start a free trial via Stripe — card captured, not charged until trial ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enable free trials for new vendors</p>
              <p className="text-xs text-muted-foreground">When off, the "Start free trial" button is hidden from all upgrade flows.</p>
            </div>
            <Switch checked={trialSettings.enabled}
              onCheckedChange={(v) => setTrialSettings({ ...trialSettings, enabled: v })} />
          </div>
          <Field label="Default trial duration">
            <div className="flex gap-2 flex-wrap">
              {[7, 14, 21, 30].map((d) => (
                <button key={d} disabled={!trialSettings.enabled}
                  onClick={() => setTrialSettings({ ...trialSettings, defaultDurationDays: d })}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    trialSettings.defaultDurationDays === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                  } disabled:opacity-40 disabled:pointer-events-none`}>
                  {d} days
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveTrial} disabled={savingTrial}>
              {savingTrial ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save trial settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <SiteContentHistoryCard
        title="Trial Settings History" description="Every change to the free trial toggle and duration."
        queryKey={["admin-billing-trial-history"]} contentKey="billing.trialSettings"
        formatValue={formatTrialSettingsValue}
      />

      <AssignTrialCard />

      {/* Overage rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" /> Pay-as-you-go & Add-on Pricing
          </CardTitle>
          <CardDescription>
            USD per unit for overages and add-on bundle purchases. Keep each at ≥ 2.5× platform cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {OVERAGE_RATE_FIELDS.map(({ key, label, hint }) => (
              <Field key={key} label={`${label} (USD)`} hint={hint}>
                <Input type="number" min={0} step="0.001" value={overageRates[key]}
                  onChange={(e) => setOverageRates({ ...overageRates, [key]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveRates} disabled={savingRates}>
              {savingRates ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save overage rates
            </Button>
          </div>
        </CardContent>
      </Card>

      <SiteContentHistoryCard
        title="Overage & Add-on Rates History" description="Every change to pay-as-you-go and add-on unit pricing."
        queryKey={["admin-billing-overage-history"]} contentKey="billing.overageRates"
        formatValue={formatOverageRatesValue}
      />

      {/* Plans list header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Subscription Plans</h3>
          <p className="text-sm text-muted-foreground">{draft.length} plan{draft.length !== 1 ? "s" : ""} configured</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowCreateDlg(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Create New Plan
          </Button>
        )}
      </div>

      {/* Plan cards */}
      {draft.map((plan) => (
        <PlanCard
          key={plan.tier}
          plan={plan}
          isSuperAdmin={isSuperAdmin}
          onChange={(next) => setDraft(draft.map((p) => p.tier === next.tier ? next : p))}
          onDelete={() => setDeletePlan(plan)}
        />
      ))}

      {/* Save all */}
      <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          Changes to plans — including per-plan gateway overrides — take effect immediately after saving.
          Existing vendor subscriptions are not retroactively changed.
        </p>
        <Button onClick={save} disabled={saving} className="shrink-0">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save all plans
        </Button>
      </div>

      <SiteContentHistoryCard
        title="Subscription Plan History"
        description="Every change to plan names, pricing, features, quotas, and gateway overrides — who, from what, and when."
        queryKey={["admin-billing-plans-history"]} contentKey="billing.subscriptionPlans"
        formatValue={formatPlansValue}
      />

      {/* Dialogs */}
      {showCreateDlg && (
        <CreatePlanDialog
          open existingTiers={draft.map((p) => p.tier)}
          onClose={() => setShowCreateDlg(false)}
          onCreate={handleCreatePlan}
        />
      )}
      {deletePlan && (
        <DeletePlanDialog
          plan={deletePlan}
          onClose={() => setDeletePlan(null)}
          onDelete={() => handleDeletePlan(deletePlan)}
        />
      )}
    </div>
  );
}
