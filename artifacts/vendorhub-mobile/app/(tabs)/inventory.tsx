import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { useListExternalInventory } from '@workspace/api-client-react';
import type { InventoryTransaction } from '@workspace/api-client-react';

const TYPE_META: Record<
  string,
  { icon: keyof typeof Feather.glyphMap; label: string; isIn: boolean }
> = {
  in: { icon: 'arrow-down-circle', label: 'Stock in', isIn: true },
  out: { icon: 'arrow-up-circle', label: 'Stock out', isIn: false },
  adjustment: { icon: 'sliders', label: 'Adjustment', isIn: true },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useListExternalInventory();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const transactions = data ?? [];

  const renderItem = ({ item, index }: { item: InventoryTransaction; index: number }) => {
    const meta = TYPE_META[item.type] ?? TYPE_META.adjustment;
    const isOut = item.type === 'out';
    const iconColor = isOut ? colors.accent : colors.primary;

    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card style={styles.card}>
          <LinearGradient
            colors={isOut ? ['#FF7F5020', '#FF7F5008'] : ['#7F50FF20', '#7F50FF08']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.iconWrap, { borderColor: iconColor + '30', borderWidth: 1 }]}
          >
            <Feather name={meta.icon} size={18} color={iconColor} />
          </LinearGradient>
          <View style={styles.main}>
            <Text style={[styles.type, { color: colors.foreground }]}>{meta.label}</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.reference || formatDate(item.createdAt)}
            </Text>
          </View>
          <View style={styles.quantityWrap}>
            <Text style={[styles.quantity, { color: iconColor }]}>
              {isOut ? '-' : '+'}
              {item.quantity}
            </Text>
            <Text style={[styles.quantityLabel, { color: colors.mutedForeground }]}>units</Text>
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
        transactions.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={transactions.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="layers"
          title="No inventory activity"
          message="Stock movements for your products will appear here."
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  type: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  quantityWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  quantity: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  quantityLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
