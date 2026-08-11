/**
 * GenHaL Subscription tab — plan cards, usage meters, checkout
 */
import { useState, useEffect } from 'react';
import { Check, Zap, Crown, Star, Shield, HardDrive, Users, FileText, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

export interface SubscriptionProps {
  unitType: 'kingdom' | 'family';
  unitId: number;
  userRole?: string | null;
}

interface Plan {
  id: string; name: string; priceUsd: number; priceNgn: number;
  storageLimitBytes: number; maxMembers: number; maxVaultDocuments: number;
  features: string[];
}

interface Subscription {
  plan: string; status: string;
  storageUsedBytes: number; storageLimitBytes: number;
  memberCount: number; maxMembers: number;
  vaultDocumentCount: number; maxVaultDocuments: number;
  currentPeriodEnd?: string; trialEndsAt?: string;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free:    <Shield className="h-5 w-5" />,
  starter: <Zap className="h-5 w-5" />,
  pro:     <Star className="h-5 w-5" />,
  royal:   <Crown className="h-5 w-5" />,
};
const PLAN_COLORS: Record<string, string> = {
  free:    'border-stone-200 bg-stone-50/50',
  starter: 'border-blue-200 bg-blue-50/50',
  pro:     'border-amber-300 bg-amber-50/60',
  royal:   'border-amber-500 bg-gradient-to-br from-amber-50 to-stone-50',
};
const PLAN_BTN: Record<string, string> = {
  free:    'bg-stone-600 hover:bg-stone-500 text-white',
  starter: 'bg-blue-600 hover:bg-blue-500 text-white',
  pro:     'bg-amber-600 hover:bg-amber-500 text-white',
  royal:   'bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-white',
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1e12) return `${(bytes/1e12).toFixed(0)} TB`;
  if (bytes >= 1e9) return `${(bytes/1e9).toFixed(0)} GB`;
  if (bytes >= 1e6) return `${(bytes/1e6).toFixed(0)} MB`;
  return `${Math.round(bytes/1024)} KB`;
}

function UsageMeter({ label, used, limit, icon }: { label: string; used: number; limit: number; icon: React.ReactNode }) {
  const pct = limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);
  const unlimited = limit < 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">{icon} {label}</span>
        <span className="text-muted-foreground text-xs">{unlimited ? `${used} / ∞` : `${used} / ${limit}`}</span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function SubscriptionTab({ unitType, unitId, userRole }: SubscriptionProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'usd' | 'ngn'>('usd');

  const isAdmin = ['king','queen_mother','council_chief','head','co_head'].includes(userRole ?? '');

  useEffect(() => {
    Promise.all([
      fetch(`${base}/genhal/plans?unitType=${unitType}`).then(r => r.json()),
      fetch(`${base}/genhal/subscriptions/${unitType}/${unitId}`).then(r => r.json()),
    ]).then(([p, s]) => {
      setPlans(Array.isArray(p) ? p : []);
      setSub(s && !s.error ? s : null);
    }).finally(() => setLoading(false));
  }, [unitType, unitId]);

  const checkout = async (plan: Plan) => {
    if (plan.id === 'free') return;
    if (plan.id === sub?.plan) return;
    setCheckingOut(plan.id);
    try {
      const provider = currency === 'ngn' ? 'paystack' : 'stripe';
      const email = (window as any).__clerk?.user?.primaryEmailAddress?.emailAddress ?? '';
      const res = await fetch(`${base}/genhal/subscriptions/checkout/${provider}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitType, unitId, plan: plan.id, email }),
      }).then(r => r.json());

      if (res.manual) {
        toast({ title: 'Contact us to upgrade', description: res.message });
        return;
      }
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else if (res.error) {
        throw new Error(res.error);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message ?? 'Checkout failed' });
    } finally { setCheckingOut(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const currentPlan = sub?.plan ?? 'free';
  const storageUsedBytes = sub?.storageUsedBytes ?? 0;
  const storageLimitBytes = sub?.storageLimitBytes ?? 500 * 1024 * 1024;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-bold">Subscription & Storage</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Your current plan, storage usage, and upgrade options</p>
      </div>

      {/* Current usage */}
      {sub && (
        <Card className={`border-2 ${PLAN_COLORS[currentPlan] ?? PLAN_COLORS.free}`}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${currentPlan === 'royal' ? 'bg-amber-500 text-white' : 'bg-background border'}`}>
                  {PLAN_ICONS[currentPlan]}
                </div>
                <div>
                  <p className="font-semibold">{plans.find(p => p.id === currentPlan)?.name ?? 'Free'} Plan</p>
                  <p className="text-xs text-muted-foreground capitalize">{sub.status}</p>
                </div>
              </div>
              {sub.currentPeriodEnd && (
                <p className="text-xs text-muted-foreground">Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</p>
              )}
            </div>
            <div className="space-y-3">
              <UsageMeter
                label="Storage" icon={<HardDrive className="h-3.5 w-3.5" />}
                used={storageUsedBytes} limit={storageLimitBytes}
              />
              <UsageMeter
                label="Members" icon={<Users className="h-3.5 w-3.5" />}
                used={sub.memberCount ?? 0} limit={sub.maxMembers}
              />
              <UsageMeter
                label="Vault documents" icon={<FileText className="h-3.5 w-3.5" />}
                used={sub.vaultDocumentCount ?? 0} limit={sub.maxVaultDocuments}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(storageUsedBytes)} used of {formatBytes(storageLimitBytes)} storage
            </p>
          </CardContent>
        </Card>
      )}

      {/* Currency toggle */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Pay in:</span>
          <div className="flex rounded-full border overflow-hidden">
            {(['usd', 'ngn'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${currency === c ? 'bg-amber-600 text-white' : 'hover:bg-muted'}`}>
                {c === 'usd' ? '🇺🇸 USD' : '🇳🇬 NGN'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const price = currency === 'ngn' ? plan.priceNgn : plan.priceUsd;
          const priceStr = plan.id === 'free' ? 'Free forever' : currency === 'ngn' ? `₦${price.toLocaleString()}/mo` : `$${price}/mo`;
          return (
            <Card key={plan.id} className={`relative border-2 transition-all ${isCurrent ? PLAN_COLORS[plan.id] : 'hover:shadow-md'} ${plan.id === 'pro' ? 'ring-2 ring-amber-400' : ''}`}>
              {plan.id === 'pro' && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full">POPULAR</div>}
              <CardContent className="p-4 flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg ${plan.id === 'royal' ? 'bg-amber-500 text-white' : 'bg-muted'}`}>{PLAN_ICONS[plan.id]}</div>
                    <span className="font-bold">{plan.name}</span>
                    {isCurrent && <Badge className="bg-green-500 text-white text-[10px] ml-auto">Current</Badge>}
                  </div>
                  <p className="text-xl font-bold">{priceStr}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(plan.storageLimitBytes)} storage ·{' '}
                    {plan.maxMembers < 0 ? '∞' : plan.maxMembers} members ·{' '}
                    {plan.maxVaultDocuments < 0 ? '∞' : plan.maxVaultDocuments} docs
                  </p>
                </div>
                <ul className="space-y-1.5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs"><Check className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" /><span>{f}</span></li>
                  ))}
                </ul>
                {isAdmin && !isCurrent && plan.id !== 'free' && (
                  <Button className={`rounded-full w-full text-sm ${PLAN_BTN[plan.id]}`} onClick={() => checkout(plan)} disabled={!!checkingOut}>
                    {checkingOut === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Upgrade</>}
                  </Button>
                )}
                {isCurrent && plan.id !== 'free' && (
                  <p className="text-center text-xs text-muted-foreground">You're on this plan</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>All plans include Cloudflare R2 storage • Files encrypted at rest • Cancel anytime</p>
        <p>Payments processed via Stripe (USD) or Paystack (NGN). <a href="mailto:support@awajimaaai.com" className="underline text-amber-700">Contact us</a> for custom enterprise plans.</p>
      </div>
    </div>
  );
}
