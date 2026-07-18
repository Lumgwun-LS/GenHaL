/**
 * Admin Void Errors — mobile screen.
 *
 * Shows cancelled payments where voidProviderSession failed to expire
 * the underlying Stripe checkout session, meaning the customer's original
 * checkout link might still be payable. Field-admin staff can review and
 * acknowledge each entry once they've confirmed it's dealt with.
 *
 * Accessible only to vendors whose Clerk user ID is in ADMIN_USER_IDS.
 * Non-admins are redirected back to the home tab by the server 403.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/auth-token';

// ─── types ────────────────────────────────────────────────────────────────────

interface VoidErrorPayment {
  id: number;
  vendorId: number;
  vendorName: string | null;
  orderId: number | null;
  provider: string;
  providerReference: string;
  amount: string;
  currency: string;
  status: string;
  voidError: string;
  voidErrorAt: string | null;
  voidErrorAlertedAt: string | null;
  voidErrorAcknowledgedAt: string | null;
  updatedAt: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/external`;

async function fetchVoidErrors(): Promise<VoidErrorPayment[]> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/admin/void-errors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<VoidErrorPayment[]>;
}

async function acknowledgeVoidError(paymentId: number): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/admin/void-errors/${paymentId}/acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAmount(amount: string, currency: string): string {
  try {
    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
    return fmt.format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

// ─── item ─────────────────────────────────────────────────────────────────────

function VoidErrorItem({
  item,
  onAcknowledge,
  isAcknowledging,
}: {
  item: VoidErrorPayment;
  onAcknowledge: (id: number) => void;
  isAcknowledging: boolean;
}) {
  const colors = useColors();
  const isAcked = !!item.voidErrorAcknowledgedAt;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isAcked ? colors.border : '#FF4444' + '40',
          borderLeftColor: isAcked ? colors.border : '#FF4444',
        },
      ]}
    >
      {/* header */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: isAcked ? colors.border + '80' : '#FF4444' + '20' }]}>
          <Feather
            name="alert-triangle"
            size={12}
            color={isAcked ? colors.mutedForeground : '#FF4444'}
          />
          <Text style={[styles.badgeText, { color: isAcked ? colors.mutedForeground : '#FF4444' }]}>
            {isAcked ? 'Acknowledged' : 'Live void error'}
          </Text>
        </View>
        <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
          {formatRelativeTime(item.voidErrorAt ?? item.updatedAt)}
        </Text>
      </View>

      {/* payment info */}
      <Text style={[styles.amount, { color: colors.foreground }]}>
        {formatAmount(item.amount, item.currency)}
      </Text>
      <Text style={[styles.vendorName, { color: colors.mutedForeground }]}>
        {item.vendorName ?? `Vendor #${item.vendorId}`} · {item.provider}
      </Text>

      {/* error detail */}
      <View style={[styles.errorBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.errorLabel, { color: colors.mutedForeground }]}>Error</Text>
        <Text style={[styles.errorText, { color: colors.foreground }]} numberOfLines={3}>
          {item.voidError}
        </Text>
      </View>

      <Text style={[styles.refLabel, { color: colors.mutedForeground }]}>
        Ref: {item.providerReference}  ·  Payment #{item.id}
      </Text>

      {/* acknowledge button */}
      {!isAcked && (
        <Pressable
          onPress={() => onAcknowledge(item.id)}
          disabled={isAcknowledging}
          style={({ pressed }) => [
            styles.ackButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || isAcknowledging ? 0.6 : 1,
            },
          ]}
        >
          {isAcknowledging ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ackButtonText}>Mark Acknowledged</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function AdminVoidErrorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();

  const [data, setData] = useState<VoidErrorPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setIsError(false);
      const result = await fetchVoidErrors();
      setData(result);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/(tabs)');
      return;
    }
    void load();
  }, [isAdmin, load]);

  const handleRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const handleAcknowledge = useCallback(
    async (paymentId: number) => {
      if (acknowledgingId != null) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setAcknowledgingId(paymentId);
      try {
        await acknowledgeVoidError(paymentId);
        // Optimistically update the item in place.
        setData((prev) =>
          prev.map((p) =>
            p.id === paymentId
              ? { ...p, voidErrorAcknowledgedAt: new Date().toISOString() }
              : p,
          ),
        );
      } catch {
        // Silent — let the user retry via pull-to-refresh.
      } finally {
        setAcknowledgingId(null);
      }
    },
    [acknowledgingId],
  );

  const unackedCount = data.filter((p) => !p.voidErrorAcknowledgedAt).length;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[styles.errorFallback, { color: colors.foreground }]}>
          Could not load void errors.
        </Text>
        <Pressable onPress={() => { setIsLoading(true); void load(); }} style={styles.retryBtn}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {unackedCount > 0 && (
        <View style={[styles.banner, { backgroundColor: '#FF4444' + '15', borderBottomColor: '#FF4444' + '30' }]}>
          <Feather name="alert-triangle" size={14} color="#FF4444" />
          <Text style={[styles.bannerText, { color: '#FF4444' }]}>
            {unackedCount} unacknowledged — checkout sessions may still be live
          </Text>
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <VoidErrorItem
            item={item}
            onAcknowledge={handleAcknowledge}
            isAcknowledging={acknowledgingId === item.id}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
          data.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="check-circle" size={40} color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              No unacknowledged void errors. Checkout sessions are clean.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  list: { padding: 16, gap: 12 },
  listEmpty: { flex: 1, justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  timestamp: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  amount: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  vendorName: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  errorBox: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 3,
  },
  errorLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  refLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  ackButton: {
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackButtonText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  errorFallback: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  retryBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  emptyBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
