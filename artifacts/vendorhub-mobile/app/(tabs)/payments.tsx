import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import {
  getListExternalPaymentsQueryKey,
  useCancelExternalPayment,
  useListExternalOrders,
  useListExternalPayments,
  useRetryExternalPayment,
} from '@workspace/api-client-react';
import type { Payment } from '@workspace/api-client-react';

const STALE_MS = 24 * 60 * 60 * 1000; // 24h with no webhook update

function isStalePending(payment: Payment) {
  if (payment.status !== 'pending') return false;
  const reference = payment.updatedAt ?? payment.createdAt;
  const age = Date.now() - new Date(reference).getTime();
  return Number.isFinite(age) && age > STALE_MS;
}

const PROVIDER_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  stripe: 'credit-card',
  paystack: 'credit-card',
};

function currency(amount: number, code: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PaymentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useListExternalPayments({
    query: {
      queryKey: getListExternalPaymentsQueryKey(),
      refetchInterval: (query) => {
        const payments = query.state.data ?? [];
        return payments.some((p) => p.status === 'pending') ? 4000 : false;
      },
    },
  });
  const { data: ordersData } = useListExternalOrders();
  const retryPayment = useRetryExternalPayment();
  const cancelPayment = useCancelExternalPayment();

  const ordersById = useMemo(() => {
    const map = new Map<number, { customerName: string }>();
    (ordersData ?? []).forEach((order) => map.set(order.id, { customerName: order.customerName }));
    return map;
  }, [ordersData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleRetry = useCallback(
    async (payment: Payment) => {
      setBusyId(payment.id);
      try {
        const result = await retryPayment.mutateAsync({ id: payment.id });
        await refetch();
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        if (result.url) {
          await WebBrowser.openBrowserAsync(result.url);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not retry this checkout.';
        Alert.alert('Retry failed', message);
      } finally {
        setBusyId(null);
      }
    },
    [retryPayment, refetch],
  );

  const handleCancel = useCallback(
    (payment: Payment) => {
      Alert.alert('Cancel payment', 'This checkout will be marked cancelled and will no longer be tracked.', [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel payment',
          style: 'destructive',
          onPress: async () => {
            setBusyId(payment.id);
            try {
              await cancelPayment.mutateAsync({ id: payment.id });
              await refetch();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Could not cancel this payment.';
              Alert.alert('Cancel failed', message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [cancelPayment, refetch],
  );

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const payments = data ?? [];

  const renderItem = ({ item, index }: { item: Payment; index: number }) => {
    const order = item.orderId != null ? ordersById.get(item.orderId) : undefined;
    const stale = isStalePending(item);
    const canRetry = item.status === 'pending' || item.status === 'failed';
    const canCancel = item.status === 'pending';
    const busy = busyId === item.id;

    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card style={styles.card}>
          <View style={styles.row}>
            {/* Gradient icon container */}
            <LinearGradient
              colors={['#7F50FF20', '#FF7F5020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.iconWrap, { borderColor: colors.primary + '30', borderWidth: 1 }]}
            >
              <Feather
                name={PROVIDER_ICON[item.provider] ?? 'credit-card'}
                size={18}
                color={colors.primary}
              />
            </LinearGradient>
            <View style={styles.main}>
              <Text style={[styles.provider, { color: colors.foreground }]}>
                {item.provider.charAt(0).toUpperCase() + item.provider.slice(1)}
              </Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.orderId != null
                  ? `Order #${item.orderId}${order ? ` — ${order.customerName}` : ''}`
                  : formatDate(item.createdAt)}
              </Text>
              {item.orderId != null && (
                <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {formatDate(item.createdAt)}
                </Text>
              )}
            </View>
            <View style={styles.trailing}>
              <Text style={[styles.amount, { color: colors.accent }]}>
                {currency(item.amount, item.currency)}
              </Text>
              <StatusBadge status={item.status} />
            </View>
          </View>

          {stale && (
            <View style={[styles.staleBanner, { backgroundColor: colors.accent + '15' }]}>
              <Feather name="clock" size={13} color={colors.accent} />
              <Text style={[styles.staleText, { color: colors.accent }]}>
                Pending for over a day — no confirmation received
              </Text>
            </View>
          )}

          {(canRetry || canCancel) && (
            <View style={[styles.actions, { borderTopColor: colors.border }]}>
              {canRetry && (
                <Pressable
                  style={[styles.actionButton, { borderColor: colors.primary }]}
                  disabled={busy}
                  onPress={() => handleRetry(item)}
                >
                  <Feather name="refresh-cw" size={13} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>
                    {busy ? 'Working…' : 'Retry checkout'}
                  </Text>
                </Pressable>
              )}
              {canCancel && (
                <Pressable
                  style={[styles.actionButton, { borderColor: colors.border }]}
                  disabled={busy}
                  onPress={() => handleCancel(item)}
                >
                  <Feather name="x" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
              )}
            </View>
          )}
        </Card>
      </AnimatedListItem>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        payments.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={payments}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={payments.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="credit-card"
          title="No payments yet"
          message="Your payment history will show up here once a checkout completes."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
  },
  provider: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  staleText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
