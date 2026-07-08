import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { useListExternalOrders } from '@workspace/api-client-react';
import type { Order } from '@workspace/api-client-react';

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
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useListExternalOrders();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const orders = data ?? [];

  const renderItem = ({ item, index }: { item: Order; index: number }) => (
    <AnimatedListItem index={index} baseDelay={60}>
      <Card style={styles.card}>
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
      </Card>
    </AnimatedListItem>
  );

  return (
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
});
