import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { getGetExternalVoiceCampaignQueryKey, useGetExternalVoiceCampaign } from '@workspace/api-client-react';
import type { ExternalVoiceCampaignCall } from '@workspace/api-client-react';

const CALL_STATUS_ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  completed: 'check-circle',
  'no-answer': 'x-circle',
  busy: 'alert-circle',
  failed: 'x-circle',
  canceled: 'x-circle',
  ringing: 'phone',
  queued: 'clock',
};

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

export default function VoiceCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const campaignId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: campaign, isLoading, isError, refetch } = useGetExternalVoiceCampaign(campaignId, {
    query: {
      queryKey: getGetExternalVoiceCampaignQueryKey(campaignId),
      enabled: Number.isInteger(campaignId),
      refetchInterval: (query) => (query.state.data?.status === 'running' ? 5000 : false),
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <LoadingView />;
  if (isError || !campaign) return <ErrorView onRetry={() => refetch()} />;

  const renderCall = ({ item, index }: { item: ExternalVoiceCampaignCall; index: number }) => (
    <AnimatedListItem index={index} baseDelay={40}>
      <View style={[styles.callRow, { borderBottomColor: colors.border }]}>
        <View style={styles.callMain}>
          <Text style={[styles.callName, { color: colors.foreground }]} numberOfLines={1}>
            {item.leadName}
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
              color={item.status === 'completed' ? colors.success : colors.mutedForeground}
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>{campaign.name}</Text>
            <StatusBadge status={campaign.status} />
          </View>
          <Text style={[styles.createdAt, { color: colors.mutedForeground }]}>
            Created {formatDate(campaign.createdAt)}
          </Text>

          <View style={styles.statsGrid}>
            <StatTile
              icon="phone"
              label="Total calls"
              value={String(campaign.stats.totalCalls)}
              colors={colors}
            />
            <StatTile
              icon="check-circle"
              label="Answered"
              value={String(campaign.stats.answeredCalls)}
              colors={colors}
            />
            <StatTile
              icon="percent"
              label="Answer rate"
              value={`${campaign.stats.answerRate}%`}
              colors={colors}
            />
            <StatTile
              icon="clock"
              label="Avg duration"
              value={campaign.stats.avgDurationSeconds > 0 ? `${campaign.stats.avgDurationSeconds}s` : '—'}
              colors={colors}
            />
          </View>

          <Card style={styles.scriptCard}>
            <View style={styles.scriptHeader}>
              <Feather name="mic" size={14} color={colors.primary} />
              <Text style={[styles.scriptTitle, { color: colors.primary }]}>Call script</Text>
            </View>
            <Text style={[styles.scriptText, { color: colors.mutedForeground }]}>"{campaign.script}"</Text>
          </Card>

          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Individual calls</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="phone-off"
          title="No calls placed yet"
          message="Calls will show up here once this campaign is launched."
        />
      }
    />
  );
}

function StatTile({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Card style={styles.statTile}>
      <View style={styles.statTop}>
        <Feather name={icon} size={13} color={colors.mutedForeground} />
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    flexShrink: 1,
  },
  createdAt: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 12,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  scriptCard: {
    marginTop: 14,
  },
  scriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  scriptTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  scriptText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginTop: 20,
    marginBottom: 8,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  callMain: {
    flex: 1,
  },
  callName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  callPhone: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  callTrailing: {
    alignItems: 'flex-end',
    gap: 3,
  },
  callStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  callStatusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  callMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
