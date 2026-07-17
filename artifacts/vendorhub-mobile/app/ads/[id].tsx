/**
 * Ad Campaign detail screen.
 * Shows creative preview (headline, body, image) and action row: Publish, Pause, Delete.
 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { GradientButton } from '@/components/GradientButton';
import {
  getGetAdCampaignQueryKey,
  getListAdCampaignsQueryKey,
  useDeleteAdCampaign,
  useGetAdCampaign,
  usePublishAdCampaign,
  useUpdateAdCampaign,
} from '@workspace/api-client-react';
import type { AdCreative } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const PLATFORM_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  x: 'twitter',
  linkedin: 'linkedin',
  google: 'search',
  tiktok: 'music',
};

function platformIcon(p: string): keyof typeof Feather.glyphMap {
  return PLATFORM_ICON[p.toLowerCase()] ?? 'radio';
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status: string, colors: ReturnType<typeof useColors>) {
  switch (status.toLowerCase()) {
    case 'active': return colors.success;
    case 'paused': return colors.warning;
    case 'ended': case 'completed': return colors.mutedForeground;
    default: return colors.primary;
  }
}

function CreativePreview({ creative }: { creative: AdCreative }) {
  const colors = useColors();
  return (
    <Card style={styles.creativeCard}>
      {creative.imageUrl ? (
        <Image
          source={{ uri: creative.imageUrl }}
          style={styles.creativeImage}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={['#7F50FF20', '#FF7F5020']}
          style={[styles.creativeImagePlaceholder, { borderColor: colors.border }]}
        >
          <Feather name="image" size={28} color={colors.mutedForeground} />
          <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>No image</Text>
        </LinearGradient>
      )}

      <View style={styles.creativeBody}>
        {creative.headline && (
          <Text style={[styles.creativeHeadline, { color: colors.foreground }]}>
            {creative.headline}
          </Text>
        )}
        {creative.body && (
          <Text style={[styles.creativeBodyText, { color: colors.mutedForeground }]}>
            {creative.body}
          </Text>
        )}
        {creative.cta && (
          <View style={[styles.ctaBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '35' }]}>
            <Text style={[styles.ctaText, { color: colors.primary }]}>{creative.cta}</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const campaignId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [busyAction, setBusyAction] = useState<'publish' | 'pause' | 'delete' | null>(null);

  const { data, isLoading, isError, refetch } = useGetAdCampaign(campaignId, {
    query: { queryKey: getGetAdCampaignQueryKey(campaignId) },
  });

  const publishMutation = usePublishAdCampaign();
  const updateMutation = useUpdateAdCampaign();
  const deleteMutation = useDeleteAdCampaign();

  const invalidateLists = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAdCampaignsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAdCampaignQueryKey(campaignId) }),
    ]);
  }, [queryClient, campaignId]);

  const handlePublish = useCallback(async () => {
    setBusyAction('publish');
    try {
      const result = await publishMutation.mutateAsync({ id: campaignId });
      await invalidateLists();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (result.status === 'not_connected') {
        Alert.alert(
          'Platform not connected',
          result.message ?? 'Connect this platform from the web dashboard, then try again.',
        );
      } else {
        Alert.alert('Published!', result.message ?? 'Your campaign is now live.');
        refetch();
      }
    } catch (err) {
      Alert.alert('Publish failed', err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusyAction(null);
    }
  }, [publishMutation, campaignId, invalidateLists, refetch]);

  const handlePause = useCallback(async () => {
    setBusyAction('pause');
    try {
      await updateMutation.mutateAsync({ id: campaignId, data: { status: 'paused' } });
      await invalidateLists();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refetch();
    } catch (err) {
      Alert.alert('Pause failed', err instanceof Error ? err.message : 'Could not pause campaign.');
    } finally {
      setBusyAction(null);
    }
  }, [updateMutation, campaignId, invalidateLists, refetch]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete campaign',
      'This will permanently delete the campaign and all its creatives. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyAction('delete');
            try {
              await deleteMutation.mutateAsync({ id: campaignId });
              await invalidateLists();
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              router.back();
            } catch (err) {
              Alert.alert('Delete failed', err instanceof Error ? err.message : 'Could not delete campaign.');
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }, [deleteMutation, campaignId, invalidateLists]);

  if (isLoading) return <LoadingView />;
  if (isError || !data) return <ErrorView onRetry={() => refetch()} />;

  const campaign = data;
  const creatives = campaign.creatives ?? [];
  const status = campaign.status;
  const sc = statusColor(status, colors);

  const canPublish = status === 'draft' || status === 'paused';
  const canPause = status === 'active';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Campaign overview card */}
      <Card style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <LinearGradient
            colors={['#7F50FF22', '#FF7F5022']}
            style={[styles.platformIcon, { borderColor: colors.primary + '30', borderWidth: 1 }]}
          >
            <Feather name={platformIcon(campaign.platform)} size={20} color={colors.primary} />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={[styles.campaignName, { color: colors.foreground }]}>{campaign.name}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.platform, { color: colors.primary }]}>
                {campaign.platform.charAt(0).toUpperCase() + campaign.platform.slice(1)}
              </Text>
              <Text style={[styles.dot, { color: colors.border }]}>·</Text>
              <Text style={[styles.objective, { color: colors.mutedForeground }]}>
                {campaign.objective}
              </Text>
            </View>
          </View>

          <View style={[styles.statusChip, { backgroundColor: sc + '18', borderColor: sc + '35' }]}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.statusText, { color: sc }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
        </View>

        {/* Budget & dates */}
        <View style={[styles.detailGrid, { borderTopColor: colors.border }]}>
          <View style={styles.detailItem}>
            <Feather name="dollar-sign" size={13} color={colors.accent} />
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Budget</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>
              {campaign.budgetAmount
                ? `${campaign.budgetCurrency} ${Number(campaign.budgetAmount).toLocaleString()}`
                : '—'}
            </Text>
          </View>
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <View style={styles.detailItem}>
            <Feather name="calendar" size={13} color={colors.accent} />
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Start</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>
              {fmtDate(campaign.startDate)}
            </Text>
          </View>
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <View style={styles.detailItem}>
            <Feather name="calendar" size={13} color={colors.accent} />
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>End</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>
              {fmtDate(campaign.endDate)}
            </Text>
          </View>
        </View>

        {campaign.lastPublishError && (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '12' }]}>
            <Feather name="alert-circle" size={13} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {campaign.lastPublishError}
            </Text>
          </View>
        )}
      </Card>

      {/* Creatives */}
      {creatives.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>
            Creative{creatives.length > 1 ? 's' : ''}
          </Text>
          {creatives.map((c) => (
            <CreativePreview key={c.id} creative={c} />
          ))}
        </View>
      )}

      {creatives.length === 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Creative</Text>
          <Card style={styles.noCreativeCard}>
            <Feather name="image" size={22} color={colors.mutedForeground} />
            <Text style={[styles.noCreativeText, { color: colors.mutedForeground }]}>
              No creative added yet. Add one from the web dashboard.
            </Text>
          </Card>
        </View>
      )}

      {/* Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>Actions</Text>

        <View style={styles.actionRow}>
          {canPublish && (
            <GradientButton
              label={busyAction === 'publish' ? 'Publishing…' : 'Publish'}
              loading={busyAction === 'publish'}
              disabled={busyAction !== null}
              onPress={handlePublish}
              style={{ flex: 1 }}
            />
          )}

          {canPause && (
            <Pressable
              onPress={handlePause}
              disabled={busyAction !== null}
              style={({ pressed }) => [
                styles.outlineBtn,
                {
                  borderColor: colors.warning,
                  backgroundColor: colors.warning + '12',
                  opacity: pressed || busyAction !== null ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="pause-circle" size={16} color={colors.warning} />
              <Text style={[styles.outlineBtnText, { color: colors.warning }]}>
                {busyAction === 'pause' ? 'Pausing…' : 'Pause'}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={handleDelete}
          disabled={busyAction !== null}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              borderColor: colors.destructive + '50',
              backgroundColor: colors.destructive + '0E',
              opacity: pressed || busyAction !== null ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={15} color={colors.destructive} />
          <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Campaign</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Overview card
  overviewCard: { marginBottom: 0 },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  campaignName: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  platform: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dot: { fontSize: 12 },
  objective: { fontSize: 12, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: 'Inter_700Bold' },

  // Detail grid
  detailGrid: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailItem: { flex: 1, alignItems: 'center', gap: 4 },
  detailDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  detailLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  detailValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  errorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Section
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginBottom: 10,
    letterSpacing: 0.1,
  },

  // Creative
  creativeCard: { padding: 0, overflow: 'hidden', marginBottom: 10 },
  creativeImage: { width: '100%', height: 180 },
  creativeImagePlaceholder: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeholderText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  creativeBody: { padding: 14, gap: 8 },
  creativeHeadline: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  creativeBodyText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  ctaBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  noCreativeCard: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  noCreativeText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outlineBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deleteBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
