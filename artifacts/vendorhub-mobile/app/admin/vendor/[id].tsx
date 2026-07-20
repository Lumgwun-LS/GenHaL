/**
 * Admin Vendor Detail — mobile screen.
 *
 * Shows basic info about a vendor so field-admin staff can review the
 * account without switching to the web panel. Navigated to by tapping
 * a vendor name in the admin voice-backfill reconciliation list.
 *
 * Accessible only to vendors whose Clerk user ID is in ADMIN_USER_IDS.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { Card } from '@/components/Card';

// ─── types ────────────────────────────────────────────────────────────────────

interface VendorDetail {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  status: string | null;
  subscriptionTier: string | null;
  verificationLevel: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  createdAt: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/external`;

async function fetchVendor(id: number): Promise<VendorDetail> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}/admin/vendors/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<VendorDetail>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DetailRow({
  icon,
  label,
  value,
  colors,
  last,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <View style={styles.detailTextWrap}>
        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.foreground }]}>{value || 'Not set'}</Text>
      </View>
    </View>
  );
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function AdminVendorDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const vendorId = Number(id);

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!vendorId || isNaN(vendorId)) return;
    try {
      setIsError(false);
      const result = await fetchVendor(vendorId);
      setVendor(result);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [vendorId]);

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

  if (isError || !vendor) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          Could not load vendor.
        </Text>
        <Pressable onPress={() => { setIsLoading(true); void load(); }} style={styles.retryBtn}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const tierColor =
    vendor.subscriptionTier === 'pro'
      ? '#7F50FF'
      : vendor.subscriptionTier === 'growth'
      ? '#FF7F50'
      : colors.mutedForeground;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      {/* header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(vendor.name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.vendorName, { color: colors.foreground }]}>
          {vendor.name ?? `Vendor #${vendor.id}`}
        </Text>
        <View style={styles.badgeRow}>
          {vendor.subscriptionTier ? (
            <View style={[styles.badge, { backgroundColor: tierColor + '20' }]}>
              <Text style={[styles.badgeText, { color: tierColor }]}>
                {vendor.subscriptionTier.toUpperCase()}
              </Text>
            </View>
          ) : null}
          {vendor.status ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    vendor.status === 'active' ? '#22C55E20' : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: vendor.status === 'active' ? '#22C55E' : colors.mutedForeground },
                ]}
              >
                {vendor.status.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.vendorId, { color: colors.mutedForeground }]}>ID #{vendor.id}</Text>
      </View>

      {/* details */}
      <Card style={styles.card}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Contact</Text>
        <DetailRow icon="mail" label="Email" value={vendor.email ?? ''} colors={colors} />
        <DetailRow icon="phone" label="Phone" value={vendor.phone ?? ''} colors={colors} last />
      </Card>

      <Card style={styles.card}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account</Text>
        <DetailRow icon="briefcase" label="Industry" value={vendor.industry ?? ''} colors={colors} />
        <DetailRow
          icon="shield"
          label="Verification"
          value={vendor.verificationLevel ?? ''}
          colors={colors}
        />
        <DetailRow icon="calendar" label="Joined" value={formatDate(vendor.createdAt)} colors={colors} last />
      </Card>

      {(vendor.country || vendor.state || vendor.city) ? (
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Location</Text>
          <DetailRow icon="globe" label="Country" value={vendor.country ?? ''} colors={colors} />
          <DetailRow icon="map" label="State" value={vendor.state ?? ''} colors={colors} />
          <DetailRow icon="navigation" label="City" value={vendor.city ?? ''} colors={colors} last />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  content: { padding: 16, gap: 12 },
  header: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  vendorName: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  vendorId: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  card: { gap: 0 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTextWrap: { flex: 1, gap: 1 },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  detailValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  errorText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  retryBtn: { padding: 8 },
});
