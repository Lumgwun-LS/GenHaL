import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetPost,
  useListPostPublications,
  useUpdatePost,
  getGetPostQueryKey,
  getListPostPublicationsQueryKey,
  getListPostsQueryKey,
  ApiError,
} from '@workspace/api-client-react';
import type { PostPublication } from '@workspace/api-client-react';

// ── Schedule-field helpers (mirrors new.tsx) ──────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

interface ScheduleFields {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function initScheduleFields(date: Date): ScheduleFields {
  return {
    year: String(date.getFullYear()),
    month: pad2(date.getMonth() + 1),
    day: pad2(date.getDate()),
    hour: pad2(date.getHours()),
    minute: pad2(date.getMinutes()),
  };
}

function parseScheduleDate(fields: ScheduleFields): Date | null {
  const year = parseInt(fields.year, 10);
  const month = parseInt(fields.month, 10);
  const day = parseInt(fields.day, 10);
  const hour = parseInt(fields.hour, 10);
  const minute = parseInt(fields.minute, 10);

  if (
    isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return null;
  }
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ── Inline date/time picker ───────────────────────────────────────────────────

function ScheduleDatePicker({
  fields,
  onChange,
  colors,
}: {
  fields: ScheduleFields;
  onChange: (updated: ScheduleFields) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const fieldStyle = [
    styles.scheduleField,
    { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
  ];
  const labelStyle = [styles.scheduleFieldLabel, { color: colors.mutedForeground }];

  return (
    <View style={styles.schedulePicker}>
      <View style={styles.scheduleRow}>
        <View style={styles.scheduleFieldWrap}>
          <Text style={labelStyle}>Year</Text>
          <TextInput
            style={fieldStyle}
            value={fields.year}
            onChangeText={(v) => onChange({ ...fields, year: v })}
            keyboardType="numeric"
            maxLength={4}
            selectTextOnFocus
          />
        </View>
        <Text style={[styles.scheduleSep, { color: colors.mutedForeground }]}>/</Text>
        <View style={styles.scheduleFieldWrap}>
          <Text style={labelStyle}>Month</Text>
          <TextInput
            style={fieldStyle}
            value={fields.month}
            onChangeText={(v) => onChange({ ...fields, month: v })}
            keyboardType="numeric"
            maxLength={2}
            selectTextOnFocus
          />
        </View>
        <Text style={[styles.scheduleSep, { color: colors.mutedForeground }]}>/</Text>
        <View style={styles.scheduleFieldWrap}>
          <Text style={labelStyle}>Day</Text>
          <TextInput
            style={fieldStyle}
            value={fields.day}
            onChangeText={(v) => onChange({ ...fields, day: v })}
            keyboardType="numeric"
            maxLength={2}
            selectTextOnFocus
          />
        </View>
        <Text style={[styles.scheduleSep, { color: colors.mutedForeground }]}> </Text>
        <View style={styles.scheduleFieldWrap}>
          <Text style={labelStyle}>Hour</Text>
          <TextInput
            style={fieldStyle}
            value={fields.hour}
            onChangeText={(v) => onChange({ ...fields, hour: v })}
            keyboardType="numeric"
            maxLength={2}
            selectTextOnFocus
          />
        </View>
        <Text style={[styles.scheduleSep, { color: colors.mutedForeground }]}>:</Text>
        <View style={styles.scheduleFieldWrap}>
          <Text style={labelStyle}>Min</Text>
          <TextInput
            style={fieldStyle}
            value={fields.minute}
            onChangeText={(v) => onChange({ ...fields, minute: v })}
            keyboardType="numeric"
            maxLength={2}
            selectTextOnFocus
          />
        </View>
      </View>
      <Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>
        24-hour clock · your device's local time · must be in the future
      </Text>
    </View>
  );
}

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

// ── Available platforms ───────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'linkedin', label: 'LinkedIn' },
] as const;

// ── Edit caption + platforms section ─────────────────────────────────────────

function EditPostSection({ postId, initialCaption, initialPlatforms }: {
  postId: number;
  initialCaption: string;
  initialPlatforms: string[];
}) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [caption, setCaption] = useState(initialCaption);
  const [platforms, setPlatforms] = useState<string[]>(initialPlatforms);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { mutateAsync: updatePost } = useUpdatePost();

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
    setSuccess(false);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    if (!caption.trim()) {
      setError('Caption cannot be empty.');
      return;
    }
    if (platforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePost({ id: postId, data: { caption, platforms } });
      await queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
      await queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save changes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(210).springify().damping(18)} style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Edit Post</Text>
      <Card style={styles.editCard}>
        {/* Caption */}
        <Text style={[styles.editFieldLabel, { color: colors.mutedForeground }]}>Caption</Text>
        <TextInput
          style={[
            styles.editCaptionInput,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
          ]}
          value={caption}
          onChangeText={(v) => { setCaption(v); setSuccess(false); }}
          multiline
          placeholder="Write your caption…"
          placeholderTextColor={colors.mutedForeground}
        />

        {/* Platforms */}
        <Text style={[styles.editFieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Platforms</Text>
        <View style={styles.platformsRow}>
          {PLATFORM_OPTIONS.map((p) => {
            const selected = platforms.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => togglePlatform(p.id)}
                style={({ pressed }) => [
                  styles.platformChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.platformChipText, { color: selected ? '#fff' : colors.foreground }]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Success banner */}
        {success && (
          <View style={[styles.warningBanner, { backgroundColor: '#16A34A12', borderColor: '#16A34A35' }]}>
            <Feather name="check-circle" size={14} color="#16A34A" />
            <Text style={[styles.warningBannerText, { color: '#16A34A' }]}>Changes saved successfully.</Text>
          </View>
        )}

        {/* Error */}
        {error ? (
          <View style={[styles.warningBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.warningBannerText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}

        {/* Save */}
        <Pressable
          onPress={handleSave}
          disabled={submitting}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.7 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>
      </Card>
    </Animated.View>
  );
}

// ── Reschedule section ────────────────────────────────────────────────────────

interface RescheduleWarning {
  platform: string;
  message: string;
}

function RescheduleSection({ postId }: { postId: number }) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState<ScheduleFields>(() =>
    initScheduleFields(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<RescheduleWarning[]>([]);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { mutateAsync: updatePost } = useUpdatePost();

  const doReschedule = async (scheduledAt: string, force: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      await updatePost({ id: postId, data: { scheduledAt, ...(force ? { force: true } : {}) } });
      // Invalidate so the detail screen and list both show the new time.
      await queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
      await queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      setWarnings([]);
      setPendingDate(null);
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Server returned warnings — store them and the date so the vendor
        // can confirm ("Reschedule anyway") after reviewing.
        const body = err.data as { error?: string; warnings?: RescheduleWarning[] };
        setWarnings(body.warnings ?? []);
        setPendingDate(scheduledAt);
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : 'Could not reschedule. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setWarnings([]);
    setPendingDate(null);
    setSuccess(false);

    const date = parseScheduleDate(fields);
    if (!date) {
      setError('Enter a valid date and time (e.g. month 1–12, day 1–31, hour 0–23).');
      return;
    }
    if (date.getTime() <= Date.now()) {
      setError('Scheduled time must be in the future.');
      return;
    }
    await doReschedule(date.toISOString(), false);
  };

  const handleForce = async () => {
    if (!pendingDate) return;
    await doReschedule(pendingDate, true);
  };

  const handleDismissWarnings = () => {
    setWarnings([]);
    setPendingDate(null);
  };

  return (
    <Animated.View entering={FadeInDown.delay(220).springify().damping(18)} style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>Reschedule</Text>
      <Card style={styles.rescheduleCard}>
        <ScheduleDatePicker fields={fields} onChange={setFields} colors={colors} />

        {/* Success banner */}
        {success && (
          <View
            style={[
              styles.warningBanner,
              { backgroundColor: '#16A34A12', borderColor: '#16A34A35' },
            ]}
          >
            <Feather name="check-circle" size={14} color="#16A34A" />
            <Text style={[styles.warningBannerText, { color: '#16A34A' }]}>
              Post rescheduled successfully.
            </Text>
          </View>
        )}

        {/* Validation / API error */}
        {error ? (
          <View
            style={[
              styles.warningBanner,
              { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '35' },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.warningBannerText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}

        {/* Connection warnings (409 response) */}
        {warnings.length > 0 && (
          <View
            style={[
              styles.warningBox,
              { backgroundColor: '#F59E0B0F', borderColor: '#F59E0B40' },
            ]}
          >
            <View style={styles.warningBoxHeader}>
              <Feather name="alert-triangle" size={14} color="#D97706" />
              <Text style={[styles.warningBoxTitle, { color: '#D97706' }]}>
                Platform connection issue
              </Text>
            </View>
            {warnings.map((w, i) => (
              <Text key={i} style={[styles.warningBoxItem, { color: colors.foreground }]}>
                <Text style={{ fontFamily: 'Inter_600SemiBold' }}>
                  {w.platform.charAt(0).toUpperCase() + w.platform.slice(1)}:{' '}
                </Text>
                {w.message}
              </Text>
            ))}
            <Text style={[styles.warningBoxFooter, { color: colors.mutedForeground }]}>
              The post won't publish unless the connection is fixed before the scheduled time. You can reschedule anyway and fix the connection later.
            </Text>
            <View style={styles.warningBoxActions}>
              <Pressable
                onPress={handleDismissWarnings}
                style={({ pressed }) => [
                  styles.outlineBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleForce}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.forceBtn,
                  { backgroundColor: '#D97706', opacity: pressed || submitting ? 0.7 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.forceBtnText}>Reschedule anyway</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Save button (hidden while warnings are shown so the vendor acts on them first) */}
        {warnings.length === 0 && (
          <Pressable
            onPress={handleSave}
            disabled={submitting}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary, opacity: pressed || submitting ? 0.7 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save new schedule</Text>
            )}
          </Pressable>
        )}
      </Card>
    </Animated.View>
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

      {/* ── Edit caption + platforms (scheduled posts only) ── */}
      {post.status === 'scheduled' && (
        <EditPostSection
          postId={postId}
          initialCaption={post.caption ?? ''}
          initialPlatforms={post.platforms ?? []}
        />
      )}

      {/* ── Reschedule (scheduled posts only) ── */}
      {post.status === 'scheduled' && <RescheduleSection postId={postId} />}

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

  // ── Edit post styles ─────────────────────────────────────────────────────────
  editCard: {
    padding: 14,
    gap: 10,
  },
  editFieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editCaptionInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  platformsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  platformChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  platformChipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },

  // ── Reschedule styles ────────────────────────────────────────────────────────
  rescheduleCard: {
    padding: 14,
    gap: 12,
  },
  schedulePicker: {
    gap: 8,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scheduleFieldWrap: {
    alignItems: 'center',
    gap: 3,
  },
  scheduleFieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  scheduleField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 7,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    width: 48,
  },
  scheduleSep: {
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
    paddingBottom: 6,
  },
  scheduleHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  saveBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  warningBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  warningBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  warningBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningBoxTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  warningBoxItem: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  warningBoxFooter: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  warningBoxActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  forceBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forceBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
