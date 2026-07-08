import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { useListExternalProducts } from '@workspace/api-client-react';
import type { Product } from '@workspace/api-client-react';

function currency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useListExternalProducts();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const products = data ?? [];

  const renderItem = ({ item, index }: { item: Product; index: number }) => {
    const lowStock = item.stockQuantity <= (item.lowStockThreshold ?? 0);
    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={[styles.sku, { color: colors.mutedForeground }]}>SKU {item.sku}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.footerRow}>
            <Text style={[styles.price, { color: colors.primary }]}>{currency(item.price)}</Text>
            <View style={styles.stockWrap}>
              {lowStock && (
                <Feather
                  name="alert-triangle"
                  size={14}
                  color={colors.warning}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text
                style={[
                  styles.stock,
                  { color: lowStock ? colors.warning : colors.mutedForeground },
                ]}
              >
                {item.stockQuantity} in stock
              </Text>
            </View>
          </View>
        </Card>
      </AnimatedListItem>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        products.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={products}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={products.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="package"
          title="No products yet"
          message="Products you list for sale will appear here."
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
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  sku: {
    fontSize: 12,
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
  price: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  stockWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stock: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
