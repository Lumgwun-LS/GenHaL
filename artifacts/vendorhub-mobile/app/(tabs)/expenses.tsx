import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import {
  getListExpensesQueryKey,
  useListExpenses,
  useUpdateExpense,
} from '@workspace/api-client-react';
import type { Expense } from '@workspace/api-client-react';

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  rent: 'home',
  utilities: 'zap',
  payroll: 'users',
  marketing: 'trending-up',
  supplies: 'box',
  logistics: 'truck',
  software: 'monitor',
  maintenance: 'tool',
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
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { vendor } = useAuth();
  const vendorId = vendor?.id;

  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useListExpenses(
    { vendorId: vendorId as number },
    {
      query: {
        queryKey: getListExpensesQueryKey({ vendorId: vendorId as number }),
        enabled: Boolean(vendorId),
      },
    },
  );

  const updateExpense = useUpdateExpense();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleTogglePause = useCallback(
    (expense: Expense) => {
      const willPause = !expense.recurringPaused;
      const actionLabel = willPause ? 'Pause' : 'Resume';
      const message = willPause
        ? 'No new occurrences will be created until you resume this expense.'
        : 'This recurring expense will resume from today.';

      Alert.alert(`${actionLabel} recurring expense`, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: willPause ? 'destructive' : 'default',
          onPress: async () => {
            setBusyId(expense.id);
            try {
              await updateExpense.mutateAsync({
                id: expense.id,
                data: { recurringPaused: willPause },
              });
              await refetch();
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Could not update this expense.';
              Alert.alert(`${actionLabel} failed`, msg);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [updateExpense, refetch],
  );

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={() => refetch()} />;

  const expenses = data ?? [];

  const renderItem = ({ item, index }: { item: Expense; index: number }) => {
    const iconName: keyof typeof Feather.glyphMap =
      CATEGORY_ICON[item.category.toLowerCase()] ?? 'file-text';
    const busy = busyId === item.id;
    const isPaused = item.isRecurring && item.recurringPaused;

    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card style={styles.card}>
          <View style={styles.row}>
            {/* Icon */}
            <LinearGradient
              colors={['#7F50FF20', '#FF7F5020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.iconWrap, { borderColor: colors.primary + '30', borderWidth: 1 }]}
            >
              <Feather name={iconName} size={18} color={colors.primary} />
            </LinearGradient>

            {/* Main info */}
            <View style={styles.main}>
              <View style={styles.titleRow}>
                <Text style={[styles.category, { color: colors.foreground }]} numberOfLines={1}>
                  {capitalize(item.category)}
                </Text>
                {isPaused && (
                  <View style={[styles.pausedBadge, { backgroundColor: colors.accent + '20' }]}>
                    <Feather name="pause-circle" size={10} color={colors.accent} />
                    <Text style={[styles.pausedText, { color: colors.accent }]}>Paused</Text>
                  </View>
                )}
                {item.isRecurring && !isPaused && (
                  <View style={[styles.recurringBadge, { backgroundColor: colors.primary + '15' }]}>
                    <Feather name="repeat" size={10} color={colors.primary} />
                    <Text style={[styles.recurringText, { color: colors.primary }]}>
                      {item.recurringFrequency ? capitalize(item.recurringFrequency) : 'Recurring'}
                    </Text>
                  </View>
                )}
              </View>
              {item.description ? (
                <Text
                  style={[styles.description, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              ) : null}
              <Text style={[styles.date, { color: colors.mutedForeground }]}>
                {formatDate(item.expenseDate)}
              </Text>
            </View>

            {/* Amount + pause/resume action */}
            <View style={styles.trailing}>
              <Text style={[styles.amount, { color: colors.foreground }]}>
                {currency(item.amount, item.currency)}
              </Text>
              {item.isRecurring && (
                <Pressable
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => handleTogglePause(item)}
                  style={[
                    styles.pauseButton,
                    { borderColor: isPaused ? colors.primary + '60' : colors.border },
                  ]}
                >
                  {busy ? (
                    <Feather name="loader" size={14} color={colors.mutedForeground} />
                  ) : isPaused ? (
                    <Feather name="play" size={14} color={colors.primary} />
                  ) : (
                    <Feather name="pause" size={14} color={colors.mutedForeground} />
                  )}
                </Pressable>
              )}
            </View>
          </View>

          {/* Next occurrence footer for active recurring */}
          {item.isRecurring && !isPaused && item.nextOccurrenceDate && (
            <View style={[styles.nextRow, { borderTopColor: colors.border }]}>
              <Feather name="calendar" size={12} color={colors.mutedForeground} />
              <Text style={[styles.nextText, { color: colors.mutedForeground }]}>
                Next: {formatDate(item.nextOccurrenceDate)}
              </Text>
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
        expenses.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={expenses}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={expenses.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="file-text"
          title="No expenses yet"
          message="Expenses you record will show up here. Recurring templates can be paused and resumed."
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  category: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pausedText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recurringText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  description: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  date: {
    fontSize: 11,
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
  pauseButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
