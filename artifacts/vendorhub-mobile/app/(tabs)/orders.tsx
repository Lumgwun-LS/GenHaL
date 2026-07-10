import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
  useInitializeExternalPayment,
  useListExternalOrders,
} from '@workspace/api-client-react';
import type { Order } from '@workspace/api-client-react';

const PROVIDER_OPTIONS: { label: string; currency: string; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'Card (Stripe)', currency: 'USD', icon: 'credit-card' },
  { label: 'Paystack', currency: 'NGN', icon: 'globe' },
];

function currency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const { data, isLoading, isError, refetch } = useListExternalOrders();
  const initializePayment = useInitializeExternalPayment();

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

  const orders = data ?? [];

  const renderItem = ({ item, index }: { item: Order; index: number }) => (
    <AnimatedListItem index={index} baseDelay={60}>
      <Card style={styles.card} onPress={() => setCheckoutOrder(item)}>
        <View style={styles.headerRow}>
          <Text style={[styles.customer, { color: colors.foreground }]} numberOfLines={1}>
            {item.customerName}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.customerEmail}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.footerRow}>
          <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
            {item.items.length} item{item.items.length === 1 ? '' : 's'}
          </Text>
          <Text style={[styles.total, { color: colors.accent }]}>{currency(item.totalAmount)}</Text>
        </View>
        <View style={[styles.checkoutHint, { borderTopColor: colors.border }]}>
          <Feather name="credit-card" size={13} color={colors.primary} />
          <Text style={[styles.checkoutHintText, { color: colors.primary }]}>
            Tap to start checkout
          </Text>
        </View>
      </Card>
    </AnimatedListItem>
  );

  return (
    <>
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        orders.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={orders}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={orders.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="shopping-bag"
          title="No orders yet"
          message="Orders placed by your customers will show up here."
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
          {PROVIDER_OPTIONS.map((option) => (
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
          ))}
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
  cancelButton: {
    marginTop: 16,
  },
});
