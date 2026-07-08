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
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import {
  getListExternalPaymentsQueryKey,
  useListExternalPayments,
} from '@workspace/api-client-react';
import type { Payment } from '@workspace/api-client-react';

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

  const { data, isLoading, isError, refetch } = useListExternalPayments({
    query: {
      queryKey: getListExternalPaymentsQueryKey(),
      refetchInterval: (query) => {
        const payments = query.state.data ?? [];
        return payments.some((p) => p.status === 'pending') ? 4000 : false;
      },
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const payments = data ?? [];

  const renderItem = ({ item, index }: { item: Payment; index: number }) => (
    <AnimatedListItem index={index} baseDelay={60}>
      <Card style={styles.card}>
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
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.amount, { color: colors.accent }]}>
            {currency(item.amount, item.currency)}
          </Text>
          <StatusBadge status={item.status} />
        </View>
      </Card>
    </AnimatedListItem>
  );

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
});
