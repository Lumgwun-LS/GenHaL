import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { getListExternalVoiceCampaignsQueryKey, useListExternalVoiceCampaigns } from '@workspace/api-client-react';
import type { ExternalVoiceCampaignSummary } from '@workspace/api-client-react';

function formatScheduledAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function VoiceCampaignsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useListExternalVoiceCampaigns({
    query: {
      queryKey: getListExternalVoiceCampaignsQueryKey(),
      refetchInterval: (query) => {
        const campaigns = query.state.data ?? [];
        return campaigns.some((c) => c.status === 'running') ? 5000 : false;
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

  const campaigns = data ?? [];

  const renderItem = ({ item, index }: { item: ExternalVoiceCampaignSummary; index: number }) => {
    const scheduled = formatScheduledAt(item.scheduledAt);
    const answerRate = item.totalCalls > 0 ? Math.round((item.answeredCalls / item.totalCalls) * 100) : null;

    return (
      <AnimatedListItem index={index} baseDelay={60}>
        <Card style={styles.card} onPress={() => router.push(`/voice-campaigns/${item.id}`)}>
          <View style={styles.row}>
            <LinearGradient
              colors={['#7F50FF20', '#FF7F5020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.iconWrap, { borderColor: colors.primary + '30', borderWidth: 1 }]}
            >
              <Feather name="phone" size={18} color={colors.primary} />
            </LinearGradient>
            <View style={styles.main}>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {scheduled ? `Scheduled for ${scheduled}` : item.script}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <StatusBadge status={item.status} />
            <View style={styles.statsWrap}>
              <Feather name="phone-call" size={13} color={colors.mutedForeground} />
              {item.totalCalls > 0 ? (
                <Text style={[styles.statsText, { color: colors.mutedForeground }]}>
                  <Text style={{ color: colors.success }}>{item.answeredCalls}</Text>
                  {` / ${item.totalCalls} answered`}
                  {answerRate !== null ? ` (${answerRate}%)` : ''}
                </Text>
              ) : (
                <Text style={[styles.statsText, { color: colors.mutedForeground }]}>No calls yet</Text>
              )}
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
        campaigns.length === 0 && styles.emptyContent,
        { paddingBottom: insets.bottom + 32 },
      ]}
      data={campaigns}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      scrollEnabled={campaigns.length > 0}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="phone"
          title="No voice campaigns yet"
          message="Campaigns you create on the web will show up here once they start placing calls."
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
  name: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
