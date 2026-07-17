import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Image, Video, MessageSquare, Phone, Mail, Loader2, TrendingUp } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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

interface Plan {
  tier: "starter" | "pro" | "enterprise";
  name: string;
  pricing: PlanPricing;
  description: string;
  features: string[];
  highlight: boolean;
  quotas: PlanQuotas;
}

interface PaymentGateways {
  stripe: boolean;
  paystack: boolean;
  paypal: boolean;
}

interface TrialSettings {
  enabled: boolean;
  durationDays: number;
}

interface OverageRates {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

// Mirrors PLAN_RESOURCE_UNIT_COSTS in artifacts/api-server/src/lib/subscription-plans.ts —
// shown here only as a reference so an admin can see roughly what a plan's
// bundled quota costs the platform before repricing it. Not sent to the server.
const UNIT_COSTS: Record<keyof PlanQuotas, number> = {
  aiImages: 0.19,
  aiVideos: 0.3,
  aiCaptions: 0.01,
  voiceMinutes: 0.06,
  sms: 0.01,
  email: 0.001,
};

function estimatedResourceCost(quotas: PlanQuotas): number {
  return (Object.keys(UNIT_COSTS) as (keyof PlanQuotas)[]).reduce(
    (sum, key) => sum + quotas[key] * UNIT_COSTS[key],
    0,
  );
}

const DEFAULT_OVERAGE_RATES: OverageRates = {
  aiImages: 0.50,
  aiVideos: 1.00,
  aiCaptions: 0.05,
  voiceMinutes: 0.15,
  sms: 0.05,
  email: 0.01,
};

const DEFAULT_TRIAL_SETTINGS: TrialSettings = { enabled: true, durationDays: 14 };

async function fetchPlans(): Promise<{ plans: Plan[]; gateways: PaymentGateways; overageRates: OverageRates; trialSettings: TrialSettings }> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load plans");
  const content = (await res.json()) as {
    "billing.subscriptionPlans": { plans: Plan[] };
    "billing.paymentGateways"?: PaymentGateways;
    "billing.overageRates"?: OverageRates;
    "billing.trialSettings"?: TrialSettings;
  };
  return {
    plans: content["billing.subscriptionPlans"].plans,
    gateways: content["billing.paymentGateways"] ?? { stripe: true, paystack: true, paypal: false },
    overageRates: content["billing.overageRates"] ?? DEFAULT_OVERAGE_RATES,
    trialSettings: content["billing.trialSettings"] ?? DEFAULT_TRIAL_SETTINGS,
  };
}

async function saveTrialSettings(settings: TrialSettings): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/billing.trialSettings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value: settings }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save trial settings");
  }
}

async function saveOverageRates(rates: OverageRates): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/billing.overageRates`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value: rates }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save overage rates");
  }
}

async function savePlans(plans: Plan[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/billing.subscriptionPlans`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value: { plans } }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save");
  }
}

async function saveGateways(gateways: PaymentGateways): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/site-content/billing.paymentGateways`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value: gateways }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save");
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const QUOTA_FIELDS: { key: keyof PlanQuotas; label: string; icon: typeof Image }[] = [
  { key: "aiImages", label: "AI images / mo", icon: Image },
  { key: "aiVideos", label: "AI videos / mo", icon: Video },
  { key: "aiCaptions", label: "AI captions / mo", icon: MessageSquare },
  { key: "voiceMinutes", label: "Voice minutes / mo", icon: Phone },
  { key: "sms", label: "SMS / mo", icon: MessageSquare },
  { key: "email", label: "Emails / mo", icon: Mail },
];

// Same rough assumption used server-side for the NGN default seed price —
// shown as a hint only; admins can freely diverge from it.
const USD_TO_NGN_HINT = 1550;

function PlanCard({ plan, onChange }: { plan: Plan; onChange: (next: Plan) => void }) {
  const cost = estimatedResourceCost(plan.quotas);
  const marginUsd = cost > 0 ? plan.pricing.usd / cost : Infinity;

  return (
    <Card className={plan.highlight ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {plan.name}
            {plan.highlight && <Badge>Highlighted</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Highlight</Label>
            <Switch checked={plan.highlight} onCheckedChange={(v) => onChange({ ...plan, highlight: v })} />
          </div>
        </div>
        <CardDescription>Tier key: {plan.tier} (fixed — used by billing/checkout)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Display name">
            <Input value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} />
          </Field>
          <Field label="Price / month (USD — Stripe)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={plan.pricing.usd}
              onChange={(e) => onChange({ ...plan, pricing: { ...plan.pricing, usd: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Price / month (NGN — Paystack)">
            <Input
              type="number"
              min={0}
              step="1"
              value={plan.pricing.ngn}
              onChange={(e) => onChange({ ...plan, pricing: { ...plan.pricing, ngn: Number(e.target.value) } })}
            />
            <p className="text-[11px] text-muted-foreground">
              Reference: ${plan.pricing.usd} × ~{USD_TO_NGN_HINT} ≈ ₦{Math.round(plan.pricing.usd * USD_TO_NGN_HINT).toLocaleString()}
            </p>
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

        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Monthly resource quotas bundled into this plan</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUOTA_FIELDS.map(({ key, label, icon: Icon }) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Input
                    type="number"
                    min={0}
                    value={plan.quotas[key]}
                    onChange={(e) => onChange({ ...plan, quotas: { ...plan.quotas, [key]: Number(e.target.value) } })}
                  />
                </div>
              </Field>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>Estimated resource cost at full quota usage: <strong>${cost.toFixed(2)}</strong>/mo</span>
          <span className={marginUsd >= 5 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
            {isFinite(marginUsd) ? `${marginUsd.toFixed(1)}x margin (USD)` : "∞ margin (no cost)"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

const OVERAGE_RATE_FIELDS: { key: keyof OverageRates; label: string; hint: string }[] = [
  { key: "aiImages",     label: "AI image",         hint: "per image generated" },
  { key: "aiVideos",     label: "AI video",         hint: "per video generated" },
  { key: "aiCaptions",   label: "AI caption",       hint: "per caption generated" },
  { key: "voiceMinutes", label: "Voice minute",      hint: "per minute of voice calls" },
  { key: "sms",          label: "SMS",              hint: "per SMS sent" },
  { key: "email",        label: "Email",            hint: "per email sent" },
];

export default function PlansEditor() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-subscription-plans"], queryFn: fetchPlans });
  const [draft, setDraft] = useState<Plan[]>([]);
  const [gateways, setGateways] = useState<PaymentGateways>({ stripe: true, paystack: true, paypal: false });
  const [overageRates, setOverageRates] = useState<OverageRates>(DEFAULT_OVERAGE_RATES);
  const [trialSettings, setTrialSettings] = useState<TrialSettings>(DEFAULT_TRIAL_SETTINGS);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGateways, setSavingGateways] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (data && !seeded) {
      setDraft(data.plans);
      setGateways(data.gateways);
      setOverageRates(data.overageRates);
      setTrialSettings(data.trialSettings);
      setSeeded(true);
    }
  }, [data, seeded]);

  async function saveTrial() {
    setSavingTrial(true);
    try {
      await saveTrialSettings(trialSettings);
      toast.success("Trial settings saved.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingTrial(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await savePlans(draft);
      toast.success("Plans saved. New pricing/quotas are live immediately.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRates() {
    setSavingRates(true);
    try {
      await saveOverageRates(overageRates);
      toast.success("Overage rates saved. New rates apply to all future charges and add-on purchases.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingRates(false);
    }
  }

  async function toggleGateway(key: keyof PaymentGateways, value: boolean) {
    // Ensure at least one gateway stays enabled when turning one off
    if (!value) {
      const next = { ...gateways, [key]: false };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) {
        toast.error("At least one payment gateway must stay enabled for subscriptions.");
        return;
      }
    }
    const next = { ...gateways, [key]: value };
    setGateways(next);
    setSavingGateways(true);
    try {
      await saveGateways(next);
      toast.success("Payment gateway settings saved.");
      qc.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
      qc.invalidateQueries({ queryKey: ["subscription-plans"] });
    } catch (e) {
      setGateways(gateways); // revert on failure
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingGateways(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading plans…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-muted-foreground space-y-3">
        <p className="font-medium text-destructive">Couldn't load plans.</p>
        <p className="text-xs">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Set the price, features, and bundled monthly resource quotas (AI generations, voice minutes, SMS, email) for each
        subscription tier. Vendors only ever see these — they cannot edit plans themselves. The margin badge on each card
        estimates gross margin if a vendor fully uses their quota, based on assumed per-unit provider costs (OpenAI, Twilio,
        ElevenLabs) plus payment-processing fees — aim to keep it at 5x or higher.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscription payment gateways</CardTitle>
          <CardDescription>
            Choose which gateways vendors can use to pay for a subscription plan. Stripe bills in USD; Paystack bills in NGN —
            currency follows the gateway a vendor picks. This is separate from per-vendor storefront checkout gateways.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 flex-1">
            <div>
              <p className="text-sm font-medium">Stripe (USD)</p>
              <p className="text-xs text-muted-foreground">Card payments, Customer Portal for self-service management.</p>
            </div>
            <Switch
              checked={gateways.stripe}
              disabled={savingGateways}
              onCheckedChange={(v) => toggleGateway("stripe", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 flex-1">
            <div>
              <p className="text-sm font-medium">Paystack (NGN)</p>
              <p className="text-xs text-muted-foreground">Card/bank payments for Nigerian vendors; cancel is immediate.</p>
            </div>
            <Switch
              checked={gateways.paystack}
              disabled={savingGateways}
              onCheckedChange={(v) => toggleGateway("paystack", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 flex-1">
            <div>
              <p className="text-sm font-medium">PayPal (USD)</p>
              <p className="text-xs text-muted-foreground">PayPal subscription billing in USD; cancel is immediate via the dashboard.</p>
            </div>
            <Switch
              checked={gateways.paypal}
              disabled={savingGateways}
              onCheckedChange={(v) => toggleGateway("paypal", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Free trial settings */}
      <Card>
        <CardHeader>
          <CardTitle>Free trial</CardTitle>
          <CardDescription>
            When enabled, new vendors can start a free trial by entering their card details upfront (via Stripe). The card is
            captured but not charged until the trial ends — it then converts automatically to a paid subscription unless the
            vendor cancels first. Vendors who have already trialled or subscribed will not see the trial option.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enable free trials for new vendors</p>
              <p className="text-xs text-muted-foreground">
                When off, the "Start free trial" button is hidden from all upgrade flows.
              </p>
            </div>
            <Switch
              checked={trialSettings.enabled}
              onCheckedChange={(v) => setTrialSettings({ ...trialSettings, enabled: v })}
            />
          </div>
          <Field label="Trial duration (days)">
            <Input
              type="number"
              min={1}
              max={365}
              value={trialSettings.durationDays}
              disabled={!trialSettings.enabled}
              onChange={(e) => setTrialSettings({ ...trialSettings, durationDays: Math.max(1, Number(e.target.value)) })}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Stripe passes this as <code>trial_period_days</code> on the subscription. Change takes effect for the next new trial started; existing trials are not affected.
            </p>
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveTrial} disabled={savingTrial}>
              {savingTrial ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save trial settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overage & add-on unit pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Pay-as-you-go & Add-on Pricing
          </CardTitle>
          <CardDescription>
            USD per unit charged when a paid-tier vendor exhausts their included credits (automatic overage) or when any vendor proactively buys extra capacity for a resource (add-on bundle). Priced at ~2.5–3× platform cost. Changes take effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {OVERAGE_RATE_FIELDS.map(({ key, label, hint }) => (
              <Field key={key} label={`${label} (USD)`}>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={overageRates[key]}
                  onChange={(e) => setOverageRates({ ...overageRates, [key]: Number(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
              </Field>
            ))}
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            These rates apply to: (1) automatic pay-as-you-go billing when a paid-tier vendor goes beyond their included monthly credits, and (2) the price shown to any vendor purchasing an add-on bundle from the usage view. Keep each rate at ≥ 2.5× the platform unit cost shown in the margin estimates above.
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveRates} disabled={savingRates}>
              {savingRates ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save overage rates
            </Button>
          </div>
        </CardContent>
      </Card>

      {draft.map((plan) => (
        <PlanCard
          key={plan.tier}
          plan={plan}
          onChange={(next) => setDraft(draft.map((p) => (p.tier === next.tier ? next : p)))}
        />
      ))}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save all plans
        </Button>
      </div>
    </div>
  );
}
