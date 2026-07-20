import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GradientButton } from '@/components/GradientButton';
import { useAuth } from '@/context/AuthContext';
import {
  useCreatePost,
  useGetAiImageUploadUrl,
  useListSocialAccounts,
  useSubmitPostForReview,
  getListPostsQueryKey,
} from '@workspace/api-client-react';
import { getAuthToken } from '@/lib/auth-token';

type GatewayAvailability = { provider: string; available: boolean; reason: string | null };

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function fetchPaymentAvailability(vendorId: number): Promise<GatewayAvailability[]> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/api/vendors/${vendorId}/payment-availability`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to load payment availability');
  const data = await res.json();
  return (data.gateways ?? []) as GatewayAvailability[];
}

/**
 * Warns the vendor if any enabled payment gateway is unavailable.
 * Only shown when the vendor has at least one gateway configured.
 * Tapping "Fix in Payment Settings" navigates to the Payments tab.
 */
function CheckoutPaymentHealthWarning({ vendorId }: { vendorId: number }) {
  const colors = useColors();
  const { data: gateways } = useQuery({
    queryKey: ['vendor-payment-availability', vendorId],
    queryFn: () => fetchPaymentAvailability(vendorId),
    enabled: vendorId > 0,
    staleTime: 60_000,
  });

  if (!gateways || gateways.length === 0) return null;

  const unavailable = gateways.filter((g) => !g.available);
  if (unavailable.length === 0) return null;

  const allDown = unavailable.length === gateways.length;
  const borderColor = allDown ? colors.destructive + '50' : '#F59E0B80';
  const bgColor = allDown ? colors.destructive + '12' : '#F59E0B0F';
  const titleColor = allDown ? colors.destructive : '#D97706';
  const title = allDown ? 'No payment methods are working' : 'Some payment methods unavailable';

  return (
    <View style={[styles.paymentWarning, { borderColor, backgroundColor: bgColor }]}>
      <View style={styles.paymentWarningHeader}>
        <Feather name="alert-circle" size={14} color={titleColor} />
        <Text style={[styles.paymentWarningTitle, { color: titleColor }]}>{title}</Text>
      </View>
      {unavailable.map((g) => (
        <Text key={g.provider} style={[styles.paymentWarningDetail, { color: colors.mutedForeground }]}>
          <Text style={{ fontFamily: 'Inter_600SemiBold' }}>
            {g.provider.charAt(0).toUpperCase() + g.provider.slice(1)}:
          </Text>{' '}
          {g.reason ?? 'Credentials missing or not verified'}
        </Text>
      ))}
      <Pressable
        onPress={() => router.push('/(tabs)/payments' as any)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={[styles.paymentWarningLink, { color: titleColor }]}>
          Fix in Payment Settings →
        </Text>
      </Pressable>
    </View>
  );
}

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'tiktok', label: 'TikTok' },
] as const;

type PlatformId = (typeof PLATFORMS)[number]['id'];

function normalizePlatformKey(platform: string): PlatformId | string {
  const p = platform.trim().toLowerCase();
  if (p === 'x' || p === 'twitter' || p.startsWith('x (')) return 'twitter';
  return p;
}

/** Returns a Date 1 hour from now, rounded down to the minute. */
function defaultScheduleDate(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

/** Pads a number to 2 digits. */
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Parses a schedule field object into a Date, or returns null if invalid/past. */
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

/** Inline date/time picker made from labelled TextInputs — no native module required. */
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
      {/* Date row */}
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

export default function NewSocialPostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { vendor } = useAuth();
  const vendorId = vendor?.id ?? 0;

  const [caption, setCaption] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Scheduling state ────────────────────────────────────────────────────────
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFields, setScheduleFields] = useState<ScheduleFields>(() =>
    initScheduleFields(defaultScheduleDate())
  );

  const { mutateAsync: getUploadUrl } = useGetAiImageUploadUrl();
  const { mutateAsync: createPost } = useCreatePost();
  const { mutateAsync: submitForReview } = useSubmitPostForReview();
  const { data: socialAccounts } = useListSocialAccounts({ vendorId });

  const accountsForPlatform = (platformId: PlatformId) =>
    (socialAccounts ?? []).filter(
      (a) => normalizePlatformKey(a.platform) === platformId && a.status === 'active'
    );

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  /** Request permission then open the image library. */
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow access to your photo library to attach a photo to this post.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      await uploadPhoto(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  /** Request permission then open the camera. */
  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow camera access to take a photo for this post.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      await uploadPhoto(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  /** Upload picked photo via the presigned-URL flow identical to the web compose screen. */
  const uploadPhoto = async (uri: string, mimeType: string) => {
    setError(null);
    setUploadingPhoto(true);
    try {
      const { uploadUrl, imageUrl: publicUrl } = await getUploadUrl({ data: { vendorId } });

      // Fetch the local file as a blob and PUT it to the presigned URL.
      const localResponse = await fetch(uri);
      const blob = await localResponse.blob();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!putResponse.ok) throw new Error('Photo upload failed — please try again.');

      setImageUri(uri);
      setImageUrl(publicUrl);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not upload photo. Please try again.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setImageUri(null);
    setImageUrl(null);
  };

  const showPhotoOptions = () => {
    Alert.alert('Attach a photo', 'Choose a source', [
      { text: 'Photo library', onPress: pickFromLibrary },
      { text: 'Camera', onPress: pickFromCamera },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmit = async (mode: 'draft' | 'review' | 'schedule') => {
    setError(null);

    if (!caption.trim()) {
      setError('Please write a caption before posting.');
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    // Validate schedule date when scheduling.
    let scheduledDate: Date | null = null;
    if (mode === 'schedule') {
      scheduledDate = parseScheduleDate(scheduleFields);
      if (!scheduledDate) {
        setError('Enter a valid date and time for scheduling (e.g. month 1–12, day 1–31, hour 0–23).');
        return;
      }
      if (scheduledDate.getTime() <= Date.now()) {
        setError('Scheduled time must be in the future.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const socialAccountIds = selectedPlatforms.map((id) => {
        const accounts = accountsForPlatform(id);
        return accounts.length === 1 ? accounts[0].id : 0;
      });

      const post = await createPost({
        data: {
          vendorId,
          caption: caption.trim(),
          platforms: selectedPlatforms,
          socialAccountIds,
          productIds: [],
          linkMode: 'none',
          ...(imageUrl ? { mediaUrls: [imageUrl], mediaType: 'image' } : {}),
          ...(scheduledDate ? { scheduledAt: scheduledDate.toISOString() } : {}),
        },
      });

      if (mode === 'review') {
        await submitForReview({ id: post.id });
      }

      await queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      router.back();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Could not save post. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (caption.trim() || imageUri) {
      Alert.alert('Discard post?', 'Your unsaved post will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Payment health warning ── */}
      <CheckoutPaymentHealthWarning vendorId={vendorId} />

      {/* ── Platform chips ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Platforms</Text>
        <View style={styles.chips}>
          {PLATFORMS.map((p) => {
            const active = selectedPlatforms.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => togglePlatform(p.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? '#FFFFFF' : colors.mutedForeground },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {selectedPlatforms.some((id) => accountsForPlatform(id).length === 0) && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Some selected platforms have no connected account — the post will be saved as a draft.
          </Text>
        )}
      </View>

      {/* ── Caption ── */}
      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.primary }]}>Caption</Text>
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {caption.length} / 2200
          </Text>
        </View>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="What do you want to share?"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={6}
          maxLength={2200}
          textAlignVertical="top"
          style={[
            styles.textarea,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.card,
            },
          ]}
        />
      </View>

      {/* ── Photo ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Photo</Text>

        {imageUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            <Pressable
              onPress={handleRemovePhoto}
              style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
            >
              <Feather name="x" size={14} color="#FFFFFF" />
              <Text style={styles.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={showPhotoOptions}
            disabled={uploadingPhoto}
            style={({ pressed }) => [
              styles.photoPickerBtn,
              {
                borderColor: colors.border,
                backgroundColor: uploadingPhoto
                  ? colors.muted
                  : pressed
                    ? colors.muted
                    : colors.card,
              },
            ]}
          >
            {uploadingPhoto ? (
              <>
                <Feather name="upload-cloud" size={22} color={colors.primary} />
                <Text style={[styles.photoPickerText, { color: colors.primary }]}>
                  Uploading…
                </Text>
              </>
            ) : (
              <>
                <Feather name="image" size={22} color={colors.mutedForeground} />
                <Text style={[styles.photoPickerText, { color: colors.mutedForeground }]}>
                  Add photo from library or camera
                </Text>
                <Text style={[styles.photoPickerHint, { color: colors.mutedForeground }]}>
                  Max 20 MB · JPEG, PNG, HEIC
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* ── Schedule for later ── */}
      <View style={[styles.section, styles.scheduleSection, { borderColor: scheduleEnabled ? colors.primary + '50' : colors.border, backgroundColor: scheduleEnabled ? colors.primary + '08' : colors.card }]}>
        <Pressable
          onPress={() => setScheduleEnabled((v) => !v)}
          style={styles.scheduleToggleRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: scheduleEnabled }}
        >
          <View style={styles.scheduleToggleLeft}>
            <Feather
              name="clock"
              size={16}
              color={scheduleEnabled ? colors.primary : colors.mutedForeground}
            />
            <View>
              <Text
                style={[
                  styles.scheduleToggleTitle,
                  { color: scheduleEnabled ? colors.primary : colors.foreground },
                ]}
              >
                Schedule for later
              </Text>
              {!scheduleEnabled && (
                <Text style={[styles.scheduleToggleSubtitle, { color: colors.mutedForeground }]}>
                  Auto-publishes at the chosen time — no review needed
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={scheduleEnabled}
            onValueChange={setScheduleEnabled}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={scheduleEnabled ? colors.primary : colors.mutedForeground}
          />
        </Pressable>

        {scheduleEnabled && (
          <ScheduleDatePicker
            fields={scheduleFields}
            onChange={setScheduleFields}
            colors={colors}
          />
        )}
      </View>

      {/* ── Error ── */}
      {error ? (
        <View
          style={[
            styles.errorBox,
            { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' },
          ]}
        >
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => [
            styles.cancelBtn,
            { borderColor: colors.border, backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSubmit('draft')}
          disabled={submitting}
          style={({ pressed }) => [
            styles.draftBtn,
            { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed || submitting ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.draftBtnText, { color: colors.foreground }]}>Save Draft</Text>
        </Pressable>

        {scheduleEnabled ? (
          <GradientButton
            onPress={() => handleSubmit('schedule')}
            label="Schedule Post"
            loading={submitting}
            disabled={submitting}
            style={styles.submitBtn}
          />
        ) : (
          <GradientButton
            onPress={() => handleSubmit('review')}
            label="Submit for Review"
            loading={submitting}
            disabled={submitting}
            style={styles.submitBtn}
          />
        )}
      </View>

      {/* ── Schedule badge (confirmation hint) ── */}
      {scheduleEnabled && (() => {
        const d = parseScheduleDate(scheduleFields);
        if (!d || d.getTime() <= Date.now()) return null;
        return (
          <View style={[styles.scheduleBadge, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }]}>
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.scheduleBadgeText, { color: colors.primary }]}>
              Will auto-publish on{' '}
              {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
              at {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        );
      })()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 4,
  },
  paymentWarning: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
    gap: 6,
  },
  paymentWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentWarningTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  paymentWarningDetail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    paddingLeft: 20,
  },
  paymentWarningLink: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    paddingLeft: 20,
    marginTop: 2,
  },
  section: {
    marginBottom: 22,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    lineHeight: 17,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 140,
    lineHeight: 22,
  },
  photoPickerBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  photoPickerText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  photoPickerHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  removeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  // ── Schedule section ────────────────────────────────────────────────────────
  scheduleSection: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 22,
  },
  scheduleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  scheduleToggleTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  scheduleToggleSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  schedulePicker: {
    marginTop: 16,
    gap: 10,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scheduleFieldWrap: {
    alignItems: 'center',
    flex: 1,
  },
  scheduleFieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  scheduleField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    width: '100%',
  },
  scheduleSep: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    paddingBottom: 10,
    textAlign: 'center',
    minWidth: 8,
  },
  scheduleHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  scheduleBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    lineHeight: 17,
  },
  // ── Error ──────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  // ── Actions ────────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  cancelBtn: {
    flex: 1,
    minWidth: 80,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  draftBtn: {
    flex: 1,
    minWidth: 90,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  draftBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  submitBtn: {
    flex: 2,
    minWidth: 140,
  },
});
