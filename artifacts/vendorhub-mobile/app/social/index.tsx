import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { StatusBadge } from '@/components/StatusBadge';
import { GradientButton } from '@/components/GradientButton';
import { useListPosts, getListPostsQueryKey } from '@workspace/api-client-react';
import type { Post } from '@workspace/api-client-react';

// ── Filter tabs ────────────────────────────────────────────────────────────────

type Filter = 'all' | 'draft' | 'pending_review' | 'scheduled' | 'published' | 'failed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'pending_review', label: 'In Review' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'failed', label: 'Failed' },
];

// ── Platform pill ───────────────────────────────────────────────────────────────

function PlatformPill({ platform }: { platform: string }) {
  const colors = useColors();
  const label = platform === 'twitter' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
  return (
    <View style={[styles.pill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '35' }]}>
      <Text style={[styles.pillText, { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

// ── Post card ───────────────────────────────────────────────────────────────────

function PostCard({ post, index }: { post: Post; index: number }) {
  const colors = useColors();

  const timeLabel = useMemo(() => {
    const d = new Date(post.scheduledAt ?? post.publishedAt ?? post.createdAt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [post.scheduledAt, post.publishedAt, post.createdAt]);

  const thumbnail = post.mediaUrls?.[0];

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18).stiffness(120)}>
      <Pressable
        onPress={() => router.push(`/social/${post.id}` as any)}
        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      >
        <Card style={styles.postCard}>
          {/* Left: optional thumbnail */}
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View
              style={[
                styles.thumbnailPlaceholder,
                { backgroundColor: colors.primary + '12', borderColor: colors.primary + '25' },
              ]}
            >
              <Feather name="image" size={18} color={colors.primary + '70'} />
            </View>
          )}

          {/* Right: text */}
          <View style={styles.postContent}>
            {/* Caption */}
            <Text
              style={[styles.caption, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {post.caption || '(no caption)'}
            </Text>

            {/* Platform pills */}
            <View style={styles.platforms}>
              {(post.platforms ?? []).slice(0, 4).map((p) => (
                <PlatformPill key={p} platform={p} />
              ))}
              {(post.platforms ?? []).length > 4 && (
                <Text style={[styles.morePlatforms, { color: colors.mutedForeground }]}>
                  +{(post.platforms ?? []).length - 4}
                </Text>
              )}
            </View>

            {/* Footer row */}
            <View style={styles.postFooter}>
              <StatusBadge status={post.status} />
              {timeLabel ? (
                <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{timeLabel}</Text>
              ) : null}
            </View>

            {/* Auto-publish failed notice */}
            {post.autoPublishFailed && (
              <View style={[styles.failedNote, { backgroundColor: colors.destructive + '12' }]}>
                <Feather name="alert-triangle" size={11} color={colors.destructive} />
                <Text style={[styles.failedNoteText, { color: colors.destructive }]}>
                  Auto-publish failed
                </Text>
              </View>
            )}
          </View>

          {/* Chevron */}
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={styles.chevron} />
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────────

export default function SocialPostsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { vendor } = useAuth();
  const vendorId = vendor?.id ?? 0;

  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const params = useMemo(
    () => ({
      vendorId,
      ...(activeFilter !== 'all' ? { status: activeFilter } : {}),
    }),
    [vendorId, activeFilter],
  );

  const { data, isLoading, isError, refetch } = useListPosts(params, {
    query: { queryKey: getListPostsQueryKey(params), enabled: vendorId > 0 },
  });

  const posts = data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const headerComponent = (
    <>
      {/* Filter chips */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { paddingTop: insets.top + 12 }]}
        entering={FadeInDown.delay(0).duration(300)}
      >
        {FILTERS.map((f) => {
          const active = f.id === activeFilter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setActiveFilter(f.id)}
              style={({ pressed }) => [
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? '#FFFFFF' : colors.mutedForeground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </>
  );

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item, index }) => <PostCard post={item} index={index} />}
        ListEmptyComponent={
          <EmptyState
            icon="send"
            title="No posts yet"
            message={
              activeFilter === 'all'
                ? 'Create your first post to start reaching your audience.'
                : `No ${FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase() ?? ''} posts.`
            }
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      {/* Compose FAB */}
      <Animated.View
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        entering={FadeInDown.delay(200).springify().damping(14)}
      >
        <GradientButton
          onPress={() => router.push('/social/new' as any)}
          label="New Post"
          style={styles.fabBtn}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  postCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
  },
  thumbnail: {
    width: 62,
    height: 62,
    borderRadius: 10,
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  postContent: {
    flex: 1,
    gap: 6,
  },
  caption: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  platforms: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  morePlatforms: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    alignSelf: 'center',
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  failedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  failedNoteText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  chevron: {
    marginTop: 2,
    flexShrink: 0,
  },
  fab: {
    position: 'absolute',
    right: 20,
    shadowColor: '#7F50FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  fabBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
});
