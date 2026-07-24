/**
 * UpgradePlan screen — lets a vendor view available subscription plans and
 * start a checkout.
 *
 * Re-entry guard: a `useRef<boolean>` flag (`inFlightRef`) mirrors the web
 * version's synchronous lock in upgrade-plan-card.tsx. A second tap while the
 * first request is in flight finds `inFlightRef.current === true` and returns
 * immediately — identical to the web `handleUpgrade` guard. The button is also
 * visually disabled (`inFlightState`) so the user gets clear feedback.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { GradientButton } from '@/components/GradientButton';
import { getAuthToken } from '@/lib/auth-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanTier = 'starter' | 'pro' | 'enterprise';
type Gateway = 'stripe' | 'paystack' | 'paypal';

interface PlanQuotas {
  aiImages: number;
  aiVideos: number;
  aiCaptions: number;
  voiceMinutes: number;
  sms: number;
  email: number;
}

interface Plan {
  tier: PlanTier;
  name: string;
  pricing: { usd: number; ngn: number };
  description: string;
  features: string[];
  highlight: boolean;
  quotas: PlanQuotas;
}

interface PlansResponse {
  currentTier: string;
  trialEndsAt: string | null;
  trialAvailable: boolean;
  trialPeriodDays: number;
  plans: Plan[];
  enabledGateways: Record<Gateway, boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

const GATEWAY_LABEL: Record<Gateway, string> = {
  stripe: 'Card / Stripe (USD)',
  paystack: 'Paystack (NGN)',
  paypal: 'PayPal (USD)',
};

function apiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  return domain ? `https://${domain}` : '';
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function UpgradePlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { vendor } = useAuth();
  const vendorId = vendor?.id;

  const [loading, setLoading] = useState(true);
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Re-entry guard — same pattern as the web upgrade-plan-card.tsx.
  // A second tap while a checkout request is in flight finds this true and
  // returns immediately without firing a duplicate request.
  const inFlightRef = useRef(false);

  // Visual state: which tier + gateway is currently being checked out, or null.
  const [inFlightState, setInFlightState] = useState<{
    tier: PlanTier;
    gateway: Gateway;
  } | null>(null);

  // Gateway picker sheet state.
  const [pickingTier, setPickingTier] = useState<PlanTier | null>(null);

  const loadPlans = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`/api/vendors/${vendorId}/subscription/plans`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load plans.');
      setPlansData(data as PlansResponse);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load plans.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // ── Checkout ──────────────────────────────────────────────────────────────

  const handleUpgrade = useCallback(
    async (tier: PlanTier, gateway: Gateway) => {
      // Re-entry guard: if a checkout request is already in flight (e.g. the
      // user double-tapped) ignore subsequent taps until the first completes.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setInFlightState({ tier, gateway });
      setPickingTier(null);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      try {
        const res = await apiFetch(
          `/api/vendors/${vendorId}/subscription/checkout`,
          {
            method: 'POST',
            body: JSON.stringify({
              tier,
              provider: gateway,
              // The mobile app doesn't redirect back to a web URL; we open the
              // checkout page in an in-app browser, so the success/cancel URLs
              // just bring the user back to this screen.
              successUrl: `${apiBase()}/upgrade-success`,
              cancelUrl: `${apiBase()}/upgrade-cancelled`,
            }),
          },
        );

        const data = await res.json();

        if (!res.ok) {
          Alert.alert('Checkout failed', data.error ?? 'Could not start checkout. Please try again.');
          return;
        }

        if (!data.url) {
          Alert.alert('Checkout failed', 'No checkout URL was returned. Please try again.');
          return;
        }

        await WebBrowser.openBrowserAsync(data.url);
        // After the browser closes, reload plan state in case the subscription
        // changed while the vendor was in the checkout flow.
        void loadPlans();
      } catch {
        Alert.alert('Network error', 'Could not connect to the server. Please check your connection and try again.');
      } finally {
        inFlightRef.current = false;
        setInFlightState(null);
      }
    },
    [vendorId, loadPlans],
  );

  // ── Render helpers ────────────────────────────────────────────────────────

  const currentTier = plansData?.currentTier ?? vendor?.subscriptionTier ?? 'free';
  const currentRank = TIER_RANK[currentTier] ?? 0;

  if (!vendorId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Not signed in.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError || !plansData) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={36} color={colors.destructive} style={{ marginBottom: 12 }} />
        <Text style={[styles.errorText, { color: colors.destructive }]}>{loadError ?? 'Could not load plans.'}</Text>
        <Pressable onPress={loadPlans} style={[styles.retryButton, { borderColor: colors.primary }]}>
          <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { plans, enabledGateways, trialAvailable, trialPeriodDays } = plansData;
  const availableGateways = (Object.keys(enabledGateways) as Gateway[]).filter(
    (g) => enabledGateways[g],
  );

  const anyInFlight = inFlightState !== null;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="arrow-left" size={20} color={colors.primary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>Choose a Plan</Text>
        </View>

        {/* ── Current tier badge ── */}
        <View style={[styles.currentBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
          <Feather name="check-circle" size={14} color={colors.primary} />
          <Text style={[styles.currentBadgeText, { color: colors.primary }]}>
            Current plan: <Text style={{ fontFamily: 'Inter_700Bold' }}>{currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}</Text>
          </Text>
        </View>

        {/* ── Plan cards ── */}
        {plans.map((plan) => {
          const planRank = TIER_RANK[plan.tier] ?? 0;
          const isCurrent = plan.tier === currentTier;
          const isDowngrade = planRank < currentRank;
          const isUnavailable = isCurrent || isDowngrade;

          const thisGatewayBusy =
            inFlightState?.tier === plan.tier ? inFlightState.gateway : null;

          return (
            <Card key={plan.tier} style={[styles.planCard, plan.highlight && styles.highlightCard]}>
              {plan.highlight && (
                <LinearGradient
                  colors={['#7F50FF20', '#FF7F5020']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}

              <View style={styles.planHeader}>
                <View style={[styles.tierBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={[styles.tierBadgeText, { color: colors.primary }]}>
                    {plan.name}
                  </Text>
                </View>
                {isCurrent && (
                  <View style={[styles.currentPill, { backgroundColor: colors.primary }]}>
                    <Text style={styles.currentPillText}>Current</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.planDescription, { color: colors.mutedForeground }]}>
                {plan.description}
              </Text>

              <Text style={[styles.planPrice, { color: colors.foreground }]}>
                {enabledGateways.stripe ? `$${plan.pricing.usd}` : ''}
                {enabledGateways.stripe && enabledGateways.paystack ? ' / ' : ''}
                {enabledGateways.paystack ? `₦${plan.pricing.ngn.toLocaleString()}` : ''}
                <Text style={[styles.planPricePeriod, { color: colors.mutedForeground }]}> /mo</Text>
              </Text>

              <View style={styles.featureList}>
                {plan.features.slice(0, 5).map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Feather name="check" size={13} color={colors.primary} style={styles.featureIcon} />
                    <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* ── Upgrade / current button ── */}
              {isUnavailable ? (
                <View style={[styles.unavailableButton, { borderColor: colors.border }]}>
                  <Text style={[styles.unavailableButtonText, { color: colors.mutedForeground }]}>
                    {isCurrent ? 'Your current plan' : 'Included in current plan'}
                  </Text>
                </View>
              ) : availableGateways.length === 1 ? (
                /* Single gateway — go straight to checkout */
                <GradientButton
                  onPress={() => handleUpgrade(plan.tier, availableGateways[0]!)}
                  label={
                    thisGatewayBusy
                      ? 'Starting checkout…'
                      : `Upgrade to ${plan.name}`
                  }
                  loading={!!thisGatewayBusy}
                  disabled={anyInFlight}
                  style={styles.upgradeButtonWrap}
                />
              ) : availableGateways.length === 0 ? (
                <View style={[styles.unavailableButton, { borderColor: colors.border }]}>
                  <Text style={[styles.unavailableButtonText, { color: colors.mutedForeground }]}>
                    No payment gateway available
                  </Text>
                </View>
              ) : (
                /* Multiple gateways — show picker */
                thisGatewayBusy ? (
                  <GradientButton
                    onPress={() => {}}
                    label="Starting checkout…"
                    loading
                    disabled
                    style={styles.upgradeButtonWrap}
                  />
                ) : (
                  <GradientButton
                    onPress={() => setPickingTier(plan.tier)}
                    label={`Upgrade to ${plan.name}`}
                    disabled={anyInFlight}
                    style={styles.upgradeButtonWrap}
                  />
                )
              )}

              {/* ── Trial button ── */}
              {trialAvailable && !isUnavailable && enabledGateways.stripe && (
                <Pressable
                  onPress={() => handleUpgrade(plan.tier, 'stripe')}
                  disabled={anyInFlight}
                  style={({ pressed }) => [
                    styles.trialButton,
                    { borderColor: colors.primary + '60', opacity: pressed || anyInFlight ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="gift" size={13} color={colors.primary} />
                  <Text style={[styles.trialButtonText, { color: colors.primary }]}>
                    Start {trialPeriodDays}-day free trial
                  </Text>
                </Pressable>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {/* ── Gateway picker bottom sheet ── */}
      {pickingTier !== null && (
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setPickingTier(null)}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Choose payment method
            </Text>
            {availableGateways.map((g) => (
              <Pressable
                key={g}
                onPress={() => handleUpgrade(pickingTier, g)}
                style={({ pressed }) => [
                  styles.gatewayRow,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="credit-card" size={16} color={colors.primary} />
                <Text style={[styles.gatewayLabel, { color: colors.foreground }]}>
                  {GATEWAY_LABEL[g]}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
            <Pressable
              onPress={() => setPickingTier(null)}
              style={[styles.sheetCancel, { borderColor: colors.border }]}
            >
              <Text style={[styles.sheetCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  currentBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  planCard: {
    padding: 18,
    gap: 10,
    overflow: 'hidden',
  },
  highlightCard: {
    borderWidth: 1.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  currentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentPillText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  planDescription: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  planPrice: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
  },
  planPricePeriod: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  featureList: {
    gap: 6,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureIcon: {
    width: 18,
  },
  featureText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  upgradeButtonWrap: {},
  unavailableButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  trialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  trialButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  // Gateway picker sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000060',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  gatewayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  gatewayLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  sheetCancel: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});
