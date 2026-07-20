/**
 * Admin Voice-Call Backfill — mobile screen.
 *
 * Shows the most-recently reconciled voice calls from the backfill job that
 * recovers calls stuck in a non-terminal status because their Twilio
 * status-callback was rejected while TWILIO_AUTH_TOKEN was stale.
 *
 * Each row displays the vendor name (tappable → admin vendor detail) and the
 * campaign name (tappable → voice campaign detail), so field-admin staff can
 * jump straight to the affected resources without switching to the web panel.
 *
 * Accessible only to vendors whose Clerk user ID is in ADMIN_USER_IDS.
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
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/auth-token';

// ─── types ────────────────────────────────────────────────────────────────────

interface BackfillFix {
  ranAt: string;
  callSid: string;
  fromStatus: string;
  toStatus: string;
  vendorId: number | null;
  vendorName: string | null;
  campaignId: number | null;
  campaignName: string | null;
}

interface BackfillData {
  ranAt?: string;
  triggeredBy?: string;
  checked?: number;
  updated?: number;
  failed?: number;
  recentFixes: BackfillFix[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/external`;

async function fetchVoiceBackfill(): Promise<BackfillData> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/admin/voice-backfill`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BackfillData>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_COLOR: Record<string, string> = {
  completed: '#22C55E',
  'no-answer': '#F59E0B',
  busy: '#F59E0B',
  failed: '#EF4444',
  canceled: '#6B7280',
};

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? '#6B7280';
}

// ─── BackfillFixItem ──────────────────────────────────────────────────────────

function BackfillFixItem({ item, colors }: { item: BackfillFix; colors: ReturnType<typeof useColors> }) {
  const handleVendorPress = () => {
    if (item.vendorId != null) {
      router.push(`/admin/vendor/${item.vendorId}` as any);
    }
  };

  const handleCampaignPress = () => {
    if (item.campaignId != null) {
      router.push(`/admin/campaign/${item.campaignId}` as any);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* status transition */}
      <View style={styles.statusRow}>
        <View style={[styles.statusPill, { backgroundColor: statusColor(item.fromStatus) + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor(item.fromStatus) }]}>
            {item.fromStatus}
          </Text>
        </View>
        <Feather name="arrow-right" size={12} color={colors.mutedForeground} />
        <View style={[styles.statusPill, { backgroundColor: statusColor(item.toStatus) + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor(item.toStatus) }]}>
            {item.toStatus}
          </Text>
        </View>
        <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
          {formatRelativeTime(item.ranAt)}
        </Text>
      </View>

      {/* vendor link */}
      <View style={styles.linkRow}>
        <Feather name="user" size={13} color={colors.mutedForeground} />
        {item.vendorId != null ? (
          <Pressable onPress={handleVendorPress} hitSlop={8}>
            <Text style={[styles.linkText, { color: colors.primary }]}>
              {item.vendorName ?? `Vendor #${item.vendorId}`}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.linkTextMuted, { color: colors.mutedForeground }]}>
            {item.vendorName ?? 'Unknown vendor'}
          </Text>
        )}
      </View>

      {/* campaign link */}
      <View style={styles.linkRow}>
        <Feather name="phone" size={13} color={colors.mutedForeground} />
        {item.campaignId != null ? (
          <Pressable onPress={handleCampaignPress} hitSlop={8}>
            <Text style={[styles.linkText, { color: colors.primary }]}>
              {item.campaignName ?? `Campaign #${item.campaignId}`}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.linkTextMuted, { color: colors.mutedForeground }]}>
            {item.campaignName ?? 'Unknown campaign'}
          </Text>
        )}
      </View>

      {/* call SID */}
      <Text style={[styles.sid, { color: colors.mutedForeground }]} numberOfLines={1}>
        {item.callSid}
      </Text>
    </View>
  );
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function AdminVoiceBackfillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();

  const [data, setData] = useState<BackfillData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsError(false);
      const result = await fetchVoiceBackfill();
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
          Could not load backfill data.
        </Text>
        <Pressable onPress={() => { setIsLoading(true); void load(); }} style={styles.retryBtn}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const fixes = data?.recentFixes ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* summary banner */}
      {data?.ranAt && (
        <View style={[styles.summaryBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: colors.foreground }]}>{data.checked ?? 0}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Checked</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: '#22C55E' }]}>{data.updated ?? 0}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Fixed</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: data.failed ? '#EF4444' : colors.foreground }]}>
              {data.failed ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Failed</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: colors.foreground, fontSize: 11 }]}>
              {formatRelativeTime(data.ranAt)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Last run</Text>
          </View>
        </View>
      )}

      <FlatList
        data={fixes}
        keyExtractor={(item, i) => `${item.callSid}-${i}`}
        renderItem={({ item }) => <BackfillFixItem item={item} colors={colors} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
          fixes.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          fixes.length > 0 ? (
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
              Recent reconciled calls ({fixes.length})
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="check-circle" size={40} color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No recent fixes</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              The backfill job has not reconciled any calls yet, or there were no stuck calls to fix.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryNum: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.4 },
  divider: { width: StyleSheet.hairlineWidth, height: 32, marginHorizontal: 4 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1, justifyContent: 'center' },
  sectionHeader: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  timestamp: { fontSize: 11, fontFamily: 'Inter_400Regular', marginLeft: 'auto' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  linkTextMuted: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  sid: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  emptyBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  errorFallback: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  retryBtn: { padding: 8 },
});
