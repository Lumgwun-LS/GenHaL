import React, { useMemo } from 'react';
import {
  Image,
  Linking,
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { Card } from '@/components/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import { StatusBadge } from '@/components/StatusBadge';
import {
  useGetPost,
  useListPostPublications,
  getGetPostQueryKey,
  getListPostPublicationsQueryKey,
} from '@workspace/api-client-react';
import type { PostPublication } from '@workspace/api-client-react';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function platformLabel(platform: string) {
  if (platform === 'twitter') return 'X / Twitter';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

async function openUrl(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  } catch {
    // silently ignore if URL cannot be opened
  }
}

// ── Publication row ──────────────────────────────────────────────────────────────

function PublicationRow({ pub }: { pub: PostPublication }) {
  const colors = useColors();

  return (
    <View style={[styles.pubRow, { borderColor: colors.border }]}>
      <View style={styles.pubLeft}>
        <Text style={[styles.pubPlatform, { color: colors.foreground }]}>
          {platformLabel(pub.platform)}
        </Text>

        {pub.externalUrl ? (
          <Pressable
            onPress={() => openUrl(pub.externalUrl!)}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <Text style={[styles.pubUrl, { color: colors.primary }]} numberOfLines={1}>
              View on {platformLabel(pub.platform)} ↗
            </Text>
          </Pressable>
        ) : null}

        {pub.errorMessage ? (
          <Text style={[styles.pubError, { color: colors.destructive }]} numberOfLines={3}>
            {pub.errorMessage}
          </Text>
        ) : null}

        {pub.publishedAt ? (
          <Text style={[styles.pubDate, { color: colors.mutedForeground }]}>
            {formatDate(pub.publishedAt)}
          </Text>
        ) : null}
      </View>
      <StatusBadge status={pub.status} />
    </View>
  );
}

// ── Meta row ────────────────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.metaRow}>
      <Feather name={icon} size={14} color={colors.primary} style={styles.metaIcon} />
      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);

  const {
    data: post,
    isLoading: postLoading,
    isError: postError,
    refetch: refetchPost,
  } = useGetPost(postId, {
    query: { queryKey: getGetPostQueryKey(postId), enabled: postId > 0 },
  });

  const {
    data: publications,
    isLoading: pubsLoading,
    refetch: refetchPubs,
  } = useListPostPublications(postId, {
    query: {
      queryKey: getListPostPublicationsQueryKey(postId),
      enabled: postId > 0,
    },
  });

  const handleRefetch = () => {
    refetchPost();
    refetchPubs();
  };

  const platformsList = useMemo(
    () => (post?.platforms ?? []).map(platformLabel).join(', '),
    [post?.platforms],
  );

  const scheduledDate = formatDate(post?.scheduledAt);
  const publishedDate = formatDate(post?.publishedAt);
  const createdDate = formatDate(post?.createdAt);

  if (postLoading) return <LoadingView />;
  if (postError || !post) return <ErrorView onRetry={handleRefetch} />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={handleRefetch} tintColor={colors.primary} />
      }
    >
      {/* ── Back button + status ── */}
      <Animated.View
        entering={FadeInDown.delay(0).duration(300)}
        style={[styles.backRow, { paddingTop: insets.top + 8 }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={18} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Posts</Text>
        </Pressable>
        <StatusBadge status={post.status} />
      </Animated.View>

      {/* ── Media gallery ── */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <Animated.View entering={FadeInDown.delay(60).springify().damping(18)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaRow}
          >
            {post.mediaUrls.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.media} resizeMode="cover" />
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* ── Caption ── */}
      <Animated.View entering={FadeInDown.delay(100).springify().damping(18)} style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Caption</Text>
        <Card style={styles.captionCard}>
          <Text style={[styles.captionText, { color: colors.foreground }]}>
            {post.caption || '(no caption)'}
          </Text>
        </Card>
      </Animated.View>

      {/* ── Auto-publish failure banner ── */}
      {post.autoPublishFailed && (
        <Animated.View
          entering={FadeInDown.delay(130).springify().damping(18)}
          style={[
            styles.failedBanner,
            { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' },
          ]}
        >
          <Feather name="alert-triangle" size={14} color={colors.destructive} />
          <Text style={[styles.failedBannerText, { color: colors.destructive }]}>
            Auto-publish failed — the post was reverted to approved. Review and retry publishing.
          </Text>
        </Animated.View>
      )}

      {/* ── Post metadata ── */}
      <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>Details</Text>
        <Card style={styles.metaCard}>
          <MetaRow icon="layers" label="Platforms" value={platformsList || '—'} />
          {post.mediaType ? (
            <MetaRow icon="file" label="Media type" value={post.mediaType} />
          ) : null}
          {scheduledDate ? (
            <MetaRow icon="clock" label="Scheduled for" value={scheduledDate} />
          ) : null}
          {publishedDate ? (
            <MetaRow icon="check-circle" label="Published at" value={publishedDate} />
          ) : null}
          {createdDate ? (
            <MetaRow icon="calendar" label="Created" value={createdDate} />
          ) : null}
          {post.aiGenerated ? (
            <MetaRow icon="zap" label="Source" value="AI generated" />
          ) : null}
        </Card>
      </Animated.View>

      {/* ── Per-platform publication statuses ── */}
      <Animated.View entering={FadeInDown.delay(200).springify().damping(18)} style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.primary }]}>
          Publication status
        </Text>

        {pubsLoading ? (
          <Card style={styles.pubCard}>
            <Text style={[styles.pubsLoading, { color: colors.mutedForeground }]}>
              Loading platform statuses…
            </Text>
          </Card>
        ) : !publications || publications.length === 0 ? (
          <Card style={styles.pubCard}>
            <Text style={[styles.pubsEmpty, { color: colors.mutedForeground }]}>
              No platform publication records yet.
            </Text>
          </Card>
        ) : (
          <Card style={styles.pubCard}>
            {publications.map((pub, i) => (
              <PublicationRow key={pub.id ?? i} pub={pub} />
            ))}
          </Card>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 4,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  mediaRow: {
    gap: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  media: {
    width: 220,
    height: 180,
    borderRadius: 14,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  captionCard: {
    padding: 14,
  },
  captionText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  failedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  failedBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  metaCard: {
    padding: 14,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaIcon: {
    width: 18,
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    width: 90,
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  pubCard: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pubsLoading: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 12,
    textAlign: 'center',
  },
  pubsEmpty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 12,
    textAlign: 'center',
  },
  pubRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  pubLeft: {
    flex: 1,
    gap: 3,
  },
  pubPlatform: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  pubUrl: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  pubError: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  pubDate: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
