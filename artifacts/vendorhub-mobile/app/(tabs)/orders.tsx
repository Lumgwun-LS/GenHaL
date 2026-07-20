import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { GradientButton } from '@/components/GradientButton';
import {
  getListExternalPaymentsQueryKey,
  useGetExternalProfile,
  useInitializeExternalPayment,
  useListExternalOrders,
} from '@workspace/api-client-react';
import type { Order } from '@workspace/api-client-react';

const PROVIDER_OPTIONS: {
  label: string;
  currency: string;
  icon: keyof typeof Feather.glyphMap;
  isEnabled: (vendor: { stripeEnabled?: boolean; paystackEnabled?: boolean }) => boolean;
}[] = [
  { label: 'Card (Stripe)', currency: 'USD', icon: 'credit-card', isEnabled: (v) => !!v.stripeEnabled },
  { label: 'Paystack', currency: 'NGN', icon: 'globe', isEnabled: (v) => !!v.paystackEnabled },
];

type StatusFilter = 'all' | 'pending' | 'completed' | 'cancelled';

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function currency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Returns a human-readable cancellation reason inferred from paymentStatus */
function cancelReason(order: Order): string {
  if (order.paymentStatus === 'cancelled') return 'Customer cancelled';
  if (order.paymentStatus === 'paid') return 'Cancelled after payment';
  if (order.paymentStatus === 'refunded') return 'Cancelled & refunded';
  return 'Cancelled';
}

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { data, isLoading, isError, refetch } = useListExternalOrders();
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useGetExternalProfile();
  const initializePayment = useInitializeExternalPayment();
  const vendor = profile?.vendor;
  // Fail closed: until we've confirmed which gateways are enabled, offer none.
  const enabledProviders = vendor ? PROVIDER_OPTIONS.filter((option) => option.isEnabled(vendor)) : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const startCheckout = useCallback(
    async (order: Order, currencyCode: string) => {
      try {
        const result = await initializePayment.mutateAsync({
          data: {
            orderId: order.id,
            amount: order.totalAmount,
            currency: currencyCode,
            email: order.customerEmail,
            description: `Order #${order.id} — ${order.customerName}`,
          },
        });

        setCheckoutOrder(null);
        queryClient.invalidateQueries({ queryKey: getListExternalPaymentsQueryKey() });

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }

        if (result.url) {
          await WebBrowser.openBrowserAsync(result.url);
        }

        router.push('/(tabs)/payments');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start checkout. Please try again.';
        Alert.alert('Checkout failed', message);
      }
    },
    [initializePayment, queryClient],
  );

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const allOrders = data ?? [];
  const filteredOrders =
    statusFilter === 'all' ? allOrders : allOrders.filter((o) => o.status === statusFilter);

  const isPendingOrder = (order: Order) => order.status === 'pending';

  const handleCardPress = (order: Order) => {
    if (isPendingOrder(order)) {
      setCheckoutOrder(order);
    }
  };

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const isActive = isPendingOrder(item);
    const isCancelled = item.status === 'cancelled';

    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card
          style={[styles.card, isCancelled && styles.cancelledCard]}
          onPress={() => handleCardPress(item)}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.customer, { color: colors.foreground }]} numberOfLines={1}>
              {item.customerName}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.customerEmail}
          </Text>
          {isCancelled && (
            <View style={[styles.cancelReasonRow, { backgroundColor: colors.destructive + '10' }]}>
              <Feather name="x-circle" size={12} color={colors.destructive} />
              <Text style={[styles.cancelReasonText, { color: colors.destructive }]}>
                {cancelReason(item)}
              </Text>
            </View>
          )}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.footerRow}>
            <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
              {item.items.length} item{item.items.length === 1 ? '' : 's'}
            </Text>
            <Text style={[styles.total, { color: isCancelled ? colors.mutedForeground : colors.accent }]}>
              {currency(item.totalAmount)}
            </Text>
          </View>
          {isActive && (
            <View style={[styles.checkoutHint, { borderTopColor: colors.border }]}>
              <Feather name="credit-card" size={13} color={colors.primary} />
              <Text style={[styles.checkoutHintText, { color: colors.primary }]}>
                Tap to start checkout
              </Text>
            </View>
          )}
        </Card>
      </AnimatedListItem>
    );
  };

  const cancelledCount = allOrders.filter((o) => o.status === 'cancelled').length;

  return (
    <>
      <View style={{ backgroundColor: colors.background }}>
        {/* Status filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterBar, { paddingTop: 12 }]}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            const count =
              tab.key === 'all'
                ? allOrders.length
                : allOrders.filter((o) => o.status === tab.key).length;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.filterTab,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setStatusFilter(tab.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? '#fff' : colors.mutedForeground },
                  ]}
                >
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.filterBadge,
                      {
                        backgroundColor: isActive
                          ? 'rgba(255,255,255,0.25)'
                          : colors.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterBadgeText,
                        { color: isActive ? '#fff' : colors.mutedForeground },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        {cancelledCount > 0 && statusFilter !== 'cancelled' && statusFilter !== 'all' ? null : null}
      </View>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.content,
          filteredOrders.length === 0 && styles.emptyContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        data={filteredOrders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        scrollEnabled={filteredOrders.length > 0}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={statusFilter === 'cancelled' ? 'x-circle' : 'shopping-bag'}
            title={
              statusFilter === 'cancelled'
                ? 'No cancelled orders'
                : statusFilter === 'all'
                ? 'No orders yet'
                : `No ${statusFilter} orders`
            }
            message={
              statusFilter === 'cancelled'
                ? 'Cancelled shop-link orders will appear here.'
                : statusFilter === 'all'
                ? 'Orders placed by your customers will show up here.'
                : `No orders with status "${statusFilter}" found.`
            }
          />
        }
      />
      <Modal
        visible={checkoutOrder !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckoutOrder(null)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => (initializePayment.isPending ? undefined : setCheckoutOrder(null))}
        >
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Start checkout</Text>
            {checkoutOrder && (
              <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {checkoutOrder.customerName} · {currency(checkoutOrder.totalAmount)}
              </Text>
            )}
            <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>
              Choose a payment provider
            </Text>
            {isProfileLoading ? (
              <Text style={[styles.noProvidersText, { color: colors.mutedForeground }]}>
                Checking which payment providers are available…
              </Text>
            ) : isProfileError ? (
              <>
                <Text style={[styles.noProvidersText, { color: colors.mutedForeground }]}>
                  Couldn't verify your available payment providers.
                </Text>
                <Pressable onPress={() => refetchProfile()} style={styles.retryLink}>
                  <Text style={[styles.retryLinkText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </>
            ) : enabledProviders.length === 0 ? (
              <Text style={[styles.noProvidersText, { color: colors.mutedForeground }]}>
                No payment providers are enabled for your account yet. Contact the admin to turn one on.
              </Text>
            ) : (
              enabledProviders.map((option) => (
                <Pressable
                  key={option.currency}
                  style={[styles.providerRow, { borderColor: colors.border }]}
                  disabled={initializePayment.isPending}
                  onPress={() => checkoutOrder && startCheckout(checkoutOrder, option.currency)}
                >
                  <Feather name={option.icon} size={18} color={colors.primary} />
                  <Text style={[styles.providerLabel, { color: colors.foreground }]}>{option.label}</Text>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
              ))
            )}
            <GradientButton
              label="Cancel"
              variant="outline"
              onPress={() => setCheckoutOrder(null)}
              disabled={initializePayment.isPending}
              style={styles.cancelButton}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  filterBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 12,
  },
  cancelledCard: {
    opacity: 0.8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customer: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  email: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 3,
  },
  cancelReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  cancelReasonText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemCount: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  total: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  checkoutHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  checkoutHintText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  sheetSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
  },
  sheetLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginTop: 8,
  },
  providerLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  noProvidersText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
    lineHeight: 19,
  },
  retryLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  retryLinkText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelButton: {
    marginTop: 16,
  },
});
