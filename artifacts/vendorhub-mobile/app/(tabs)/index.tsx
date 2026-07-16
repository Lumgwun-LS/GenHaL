import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { MiniBarChart } from '@/components/MiniBarChart';
import {
  getGetExternalAnalyticsSummaryQueryKey,
  getListExternalOrdersQueryKey,
  useGetExternalAnalyticsSummary,
  useListExternalOrders,
  useListExternalPayments,
} from '@workspace/api-client-react';

function currency(amount: number, code?: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code ?? ''} ${amount.toFixed(2)}`;
  }
}

// Individual animated stat card — entering animation only (no conflicting useAnimatedStyle)
function StatCard({
  icon,
  value,
  label,
  index,
  accent = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  label: string;
  index: number;
  accent?: boolean;
}) {
  const colors = useColors();
  const iconColor = accent ? colors.accent : colors.primary;

  return (
    <Animated.View
      style={styles.statCardWrap}
      entering={FadeInDown.delay(index * 90).springify().damping(16).stiffness(130)}
    >
      <View
        style={[
          styles.statCard,
          {
            backgroundColor: colors.card,
            borderColor: accent ? colors.accent + '30' : colors.primary + '25',
            shadowColor: iconColor,
          },
        ]}
      >
        <View style={[styles.statIconWrap, { backgroundColor: iconColor + '18' }]}>
          <Feather name={icon} size={16} color={iconColor} />
        </View>
        <Text style={[styles.statValue, { color: accent ? colors.accent : colors.primary }]}>
          {value}
        </Text>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { vendor, features } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const canOrders = features.includes('orders');
  const canAnalytics = features.includes('analytics');

  const summaryQuery = useGetExternalAnalyticsSummary({
    query: { enabled: canAnalytics, queryKey: getGetExternalAnalyticsSummaryQueryKey() },
  });
  const ordersQuery = useListExternalOrders({
    query: { enabled: canOrders, queryKey: getListExternalOrdersQueryKey() },
  });
  const paymentsQuery = useListExternalPayments();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      canAnalytics ? summaryQuery.refetch() : Promise.resolve(),
      canOrders ? ordersQuery.refetch() : Promise.resolve(),
      paymentsQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [summaryQuery, ordersQuery, paymentsQuery, canOrders, canAnalytics]);

  const isLoading = (canAnalytics && summaryQuery.isLoading) || paymentsQuery.isLoading;
  const hasError = (canAnalytics && summaryQuery.isError) || paymentsQuery.isError;

  // Build a 7-day revenue trend from payments already in memory
  const payments = paymentsQuery.data ?? [];
  const revenueTrend = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      buckets[key] = 0;
    }
    payments
      .filter((p) => p.status === 'paid')
      .forEach((p) => {
        const d = new Date((p as any).createdAt ?? (p as any).created_at ?? '');
        if (isNaN(d.getTime())) return;
        const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (diff > 6) return;
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        buckets[key] = (buckets[key] ?? 0) + p.amount;
      });
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [payments]);

  if (isLoading) return <LoadingView />;
  if (hasError) {
    return (
      <ErrorView
        onRetry={() => {
          summaryQuery.refetch();
          paymentsQuery.refetch();
        }}
      />
    );
  }

  const summary = summaryQuery.data;
  const recentOrders = (ordersQuery.data ?? []).slice(0, 3);
  const recentPayments = payments.slice(0, 3);
  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const currencyPrefix = vendor?.defaultCurrency === 'NGN' ? 'NGN ' : '$';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* ── Gradient hero banner ── */}
      <Animated.View entering={FadeInDown.delay(0).duration(500)}>
        <LinearGradient
          colors={['#7F50FF', '#B060FF', '#FF7F50']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.heroBannerInner}>
            <View>
              <Text style={styles.heroGreeting}>Welcome back 👋</Text>
              <Text style={styles.heroName} numberOfLines={1}>
                {vendor?.name ?? 'Vendor'}
              </Text>
            </View>
            <View style={styles.heroAvatarWrap}>
              <Text style={styles.heroAvatarText}>
                {(vendor?.name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          {/* Decorative orbs */}
          <View style={[styles.orb, styles.orb1]} />
          <View style={[styles.orb, styles.orb2]} />
        </LinearGradient>
      </Animated.View>

      {/* ── Stat grid ── */}
      <View style={styles.statGrid}>
        <StatCard
          icon="dollar-sign"
          value={currency(totalPaid, vendor?.defaultCurrency)}
          label="Total paid in"
          index={0}
          accent
        />
        <StatCard
          icon="shopping-bag"
          value={String(summary?.ordersCount ?? 0)}
          label="Orders"
          index={1}
        />
        <StatCard
          icon="package"
          value={String(summary?.productsCount ?? 0)}
          label="Products"
          index={2}
        />
        <StatCard
          icon="users"
          value={String(summary?.leadsCount ?? 0)}
          label="Leads"
          index={3}
          accent
        />
      </View>

      {/* ── Revenue trend (last 7 days) ── */}
      {revenueTrend.some((d) => d.value > 0) && (
        <Animated.View
          style={styles.section}
          entering={FadeInDown.delay(340).springify().damping(18)}
        >
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>
            Revenue — last 7 days
          </Text>
          <Card style={styles.chartCard}>
            <MiniBarChart
              data={revenueTrend}
              barColor={colors.accent}
              height={110}
              prefix={currencyPrefix}
            />
          </Card>
        </Animated.View>
      )}

      {/* ── Recent orders ── */}
      {canOrders && (
        <Animated.View
          style={styles.section}
          entering={FadeInDown.delay(380).springify().damping(18)}
        >
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Recent orders</Text>
          {recentOrders.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No orders yet.
            </Text>
          ) : (
            recentOrders.map((order, idx) => (
              <AnimatedListItem key={order.id} index={idx} baseDelay={420}>
                <Card style={styles.rowCard}>
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.accent }]}>
                      {currency(order.totalAmount, vendor?.defaultCurrency)}
                    </Text>
                  </View>
                  <StatusBadge status={order.status} />
                </Card>
              </AnimatedListItem>
            ))
          )}
        </Animated.View>
      )}

      {/* ── Recent payments ── */}
      <Animated.View
        style={styles.section}
        entering={FadeInDown.delay(canOrders ? 500 : 380).springify().damping(18)}
      >
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Recent payments</Text>
        {recentPayments.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No payments yet.
          </Text>
        ) : (
          recentPayments.map((payment, idx) => (
            <AnimatedListItem key={payment.id} index={idx} baseDelay={canOrders ? 540 : 420}>
              <Card style={styles.rowCard}>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {payment.provider.charAt(0).toUpperCase() + payment.provider.slice(1)}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.accent }]}>
                    {currency(payment.amount, payment.currency)}
                  </Text>
                </View>
                <StatusBadge status={payment.status} />
              </Card>
            </AnimatedListItem>
          ))
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  heroBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroGreeting: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  heroName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    maxWidth: 200,
  },
  heroAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orb1: { width: 90, height: 90, bottom: -30, right: 80 },
  orb2: { width: 60, height: 60, bottom: -10, right: 20 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    marginTop: 16,
    gap: 0,
  },
  statCardWrap: {
    width: '50%',
    padding: 6,
  },
  statCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rowMain: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  chartCard: {
    padding: 16,
    marginBottom: 0,
  },
});
