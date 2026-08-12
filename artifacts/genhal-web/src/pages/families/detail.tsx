/**
 * Family Account Detail — full management page with tabs for all family features.
 */
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Home, Loader2, Users, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';
import VaultTab from '@/pages/vault/index';
import MembersTab from '@/pages/members/index';
import SubscriptionTab from '@/pages/subscription/index';
import SecretAccountsTab from '@/pages/accounts/index';
import ClaimsTab from '@/pages/claims/index';
import PublicGallery from '@/pages/vault/public-gallery';
import SuccessionTab from '@/pages/succession/index';
import WillsTab from '@/pages/wills/index';

interface Family {
  id: number;
  name: string;
  localName?: string;
  description?: string;
  country?: string;
  region?: string;
  district?: string;
  coverImageUrl?: string;
  emblemImageUrl?: string;
  isPublic: boolean;
  clerkUserId: string;
  nextOfKinName?: string;
  createdAt: string;
}

export default function FamilyDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/families/${id}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
      setFamily(data);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: err instanceof Error ? err.message : 'Failed to load family' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-20 space-y-3">
        <Home className="h-12 w-12 text-muted-foreground/30 mx-auto" />
        <p className="font-semibold text-muted-foreground">Family not found</p>
        <Button variant="outline" className="rounded-full" onClick={() => navigate('/families')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Families
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-white">
        {family.coverImageUrl && (
          <img src={family.coverImageUrl} alt={family.name}
            className="absolute inset-0 w-full h-full object-cover opacity-20" />
        )}
        <div className="relative px-6 md:px-10 pt-6 pb-8">
          <button onClick={() => navigate('/families')}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Families
          </button>

          <div className="flex items-start gap-4">
            {family.emblemImageUrl ? (
              <img src={family.emblemImageUrl} alt="Emblem"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white/30 shadow-xl shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-amber-700/60 flex items-center justify-center shrink-0">
                <Home className="h-8 w-8 text-amber-200" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-3xl md:text-4xl font-bold">{family.name}</h1>
                {family.localName && (
                  <span className="text-amber-300/80 italic text-lg">"{family.localName}"</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {family.country && (
                  <span className="text-sm text-white/60 flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    {[family.district, family.region, family.country].filter(Boolean).join(', ')}
                  </span>
                )}
                <Badge variant="outline" className={`text-xs border-white/30 ${family.isPublic ? 'text-green-300' : 'text-white/60'}`}>
                  {family.isPublic ? <><Globe className="h-3 w-3 mr-1" />Public</> : <><Lock className="h-3 w-3 mr-1" />Private</>}
                </Badge>
              </div>
              {family.description && (
                <p className="text-white/70 text-sm mt-2 line-clamp-2">{family.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 md:px-10 pt-6">
        <Tabs defaultValue="overview">
          <TabsList className="rounded-xl bg-muted/60 p-1 mb-8 flex flex-wrap h-auto gap-1">
            {[
              { v: 'overview',    l: 'Overview' },
              { v: 'vault',       l: '📂 Vault' },
              { v: 'public',      l: '🌍 Public Archive' },
              { v: 'members',     l: '👥 Members' },
              { v: 'wills',       l: '📜 Wills' },
              { v: 'succession',  l: '🤝 Succession' },
              { v: 'subscription',l: '💳 Plan' },
              { v: 'accounts',    l: '🏦 Accounts' },
              { v: 'claims',      l: '⚖️ Claims' },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-lg text-xs">{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-6 pb-10">
            <div className="grid md:grid-cols-2 gap-4">
              {family.description && (
                <div className="col-span-2 p-5 rounded-2xl bg-amber-50/50 border border-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="font-semibold text-sm mb-1.5 text-amber-900 dark:text-amber-300">About This Family</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{family.description}</p>
                </div>
              )}
              <div className="p-5 rounded-2xl bg-muted/40 border space-y-3">
                <p className="font-semibold text-sm">Details</p>
                {family.country && <div><p className="text-xs text-muted-foreground">Country</p><p className="text-sm font-medium">{family.country}</p></div>}
                {family.region  && <div><p className="text-xs text-muted-foreground">Region</p><p className="text-sm font-medium">{family.region}</p></div>}
                {family.district && <div><p className="text-xs text-muted-foreground">District</p><p className="text-sm font-medium">{family.district}</p></div>}
                <div><p className="text-xs text-muted-foreground">Registered</p><p className="text-sm font-medium">{new Date(family.createdAt).toLocaleDateString()}</p></div>
              </div>
              <div className="p-5 rounded-2xl bg-muted/40 border space-y-2">
                <p className="font-semibold text-sm">Quick Actions</p>
                <div className="space-y-1.5">
                  {[
                    { tab: 'vault',      label: 'Upload Documents' },
                    { tab: 'members',    label: 'Manage Members' },
                    { tab: 'wills',      label: '📜 Register My Will' },
                    { tab: 'succession', label: 'Set Next of Kin' },
                    { tab: 'claims',     label: 'File Ownership Claim' },
                    { tab: 'accounts',   label: 'Set Up Bank Accounts' },
                  ].map(a => (
                    <Button key={a.tab} variant="outline" size="sm" className="w-full justify-start rounded-xl text-xs h-8"
                      onClick={() => {
                        const trigger = document.querySelector(`[data-value="${a.tab}"]`) as HTMLElement;
                        trigger?.click();
                      }}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── VAULT ── */}
          <TabsContent value="vault" className="py-6">
            <VaultTab unitType="family" unitId={family.id} />
          </TabsContent>

          {/* ── PUBLIC ARCHIVE ── */}
          <TabsContent value="public" className="py-6">
            <PublicGallery unitType="family" unitId={family.id} unitName={family.name} />
          </TabsContent>

          {/* ── MEMBERS ── */}
          <TabsContent value="members" className="py-6">
            <MembersTab unitType="family" unitId={family.id} />
          </TabsContent>

          {/* ── WILLS ── */}
          <TabsContent value="wills" className="py-6">
            <WillsTab familyId={family.id} />
          </TabsContent>

          {/* ── SUCCESSION ── */}
          <TabsContent value="succession" className="py-6">
            <SuccessionTab familyId={family.id} />
          </TabsContent>

          {/* ── SUBSCRIPTION ── */}
          <TabsContent value="subscription" className="py-6">
            <SubscriptionTab unitType="family" unitId={family.id} />
          </TabsContent>

          {/* ── ACCOUNTS ── */}
          <TabsContent value="accounts" className="py-6">
            <SecretAccountsTab unitType="family" unitId={family.id} unitName={family.name} />
          </TabsContent>

          {/* ── CLAIMS ── */}
          <TabsContent value="claims" className="py-6">
            <ClaimsTab unitType="family" unitId={family.id} unitName={family.name} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
