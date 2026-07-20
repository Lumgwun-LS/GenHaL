/**
 * Admin Voice Campaign Detail — mobile screen.
 *
 * Shows full campaign info (name, script, status, stats, per-call list) for
 * any vendor's campaign, without requiring the admin to own that campaign.
 * Navigated to by tapping a campaign name in the admin voice-backfill list.
 *
 * Backed by GET /external/admin/voice-campaigns/:id which bypasses vendor
 * ownership restriction and is guarded by the ADMIN_USER_IDS check.
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
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/auth-token';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { Card } from '@/components/Card';

// ─── types ────────────────────────────────────────────────────────────────────

interface AdminCampaignCall {
  id: number;
  leadName: string | null;
  phone: string;
  status: string;
  durationSeconds: number | null;
  callSid: string | null;
  initiatedAt: string;
}

interface AdminCampaignDetail {
  id: number;
  name: string;
  script: string;
  status: string;
  vendorId: number;
  vendorName: string | null;
  scheduledAt: string | null;
  createdAt: string;
  stats: {
    totalCalls: number;
    answeredCalls: number;
    answerRate: number;
    avgDurationSeconds: number;
  };
  calls: AdminCampaignCall[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/external`;

async function fetchAdminCampaign(id: number): Promise<AdminCampaignDetail> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/admin/voice-campaigns/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminCampaignDetail>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const CALL_STATUS_ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  completed: 'check-circle',
  'no-answer': 'x-circle',
  busy: 'alert-circle',
  failed: 'x-circle',
  canceled: 'x-circle',
  ringing: 'phone',
  queued: 'clock',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function AdminCampaignDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const campaignId = Number(id);

  const [campaign, setCampaign] = useState<AdminCampaignDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId || isNaN(campaignId)) return;
    try {
      setIsError(false);
      const result = await fetchAdminCampaign(campaignId);
      setCampaign(result);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [campaignId]);

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

  if (isError || !campaign) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          Could not load campaign.
        </Text>
        <Pressable
          onPress={() => { setIsLoading(true); void load(); }}
          style={styles.retryBtn}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const renderCall = ({ item, index }: { item: AdminCampaignCall; index: number }) => (
    <AnimatedListItem index={index} baseDelay={30}>
      <View style={[styles.callRow, { borderBottomColor: colors.border }]}>
        <View style={styles.callMain}>
          <Text style={[styles.callName, { color: colors.foreground }]} numberOfLines={1}>
            {item.leadName ?? 'Unknown'}
          </Text>
          <Text style={[styles.callPhone, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.phone}
          </Text>
        </View>
        <View style={styles.callTrailing}>
          <View style={styles.callStatusRow}>
            <Feather
              name={CALL_STATUS_ICON[item.status] ?? 'clock'}
              size={13}
              color={item.status === 'completed' ? '#22C55E' : colors.mutedForeground}
            />
            <Text style={[styles.callStatusText, { color: colors.mutedForeground }]}>
              {item.status.replace(/-/g, ' ')}
            </Text>
          </View>
          <Text style={[styles.callMeta, { color: colors.mutedForeground }]}>
            {item.durationSeconds != null ? `${item.durationSeconds}s · ` : ''}
            {formatDate(item.initiatedAt)}
          </Text>
        </View>
      </View>
    </AnimatedListItem>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      data={campaign.calls}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderCall}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {/* title + status */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {campaign.name}
            </Text>
            <StatusBadge status={campaign.status} />
          </View>

          {/* vendor attribution */}
          <Pressable
            onPress={() => router.push(`/admin/vendor/${campaign.vendorId}` as any)}
            style={styles.vendorRow}
          >
            <Feather name="user" size={13} color={colors.primary} />
            <Text style={[styles.vendorLink, { color: colors.primary }]}>
              {campaign.vendorName ?? `Vendor #${campaign.vendorId}`}
            </Text>
          </Pressable>

          {/* stats */}
          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: colors.foreground }]}>
                  {campaign.stats.totalCalls}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Calls</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: '#22C55E' }]}>
                  {campaign.stats.answeredCalls}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Answered</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: colors.foreground }]}>
                  {campaign.stats.answerRate}%
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rate</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: colors.foreground }]}>
                  {campaign.stats.avgDurationSeconds}s
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avg</Text>
              </View>
            </View>
          </Card>

          {/* script preview */}
          <Card style={styles.scriptCard}>
            <Text style={[styles.scriptLabel, { color: colors.mutedForeground }]}>Script</Text>
            <Text style={[styles.scriptText, { color: colors.foreground }]} numberOfLines={6}>
              {campaign.script}
            </Text>
          </Card>

          {campaign.calls.length > 0 && (
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
              Calls ({campaign.calls.length})
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Feather name="phone-off" size={36} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No calls yet</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  content: { padding: 16, gap: 0 },
  header: { gap: 12, marginBottom: 8 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: { flex: 1, fontSize: 22, fontFamily: 'Inter_700Bold', lineHeight: 28 },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendorLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  statsCard: { padding: 12 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  scriptCard: { gap: 6 },
  scriptLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scriptText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  sectionHeader: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 4,
  },
  callRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  callMain: { flex: 1, gap: 2 },
  callName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  callPhone: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  callTrailing: { alignItems: 'flex-end', gap: 3 },
  callStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  callStatusText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  callMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  empty: { alignItems: 'center', paddingTop: 24 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  errorText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  retryBtn: { padding: 8 },
});
