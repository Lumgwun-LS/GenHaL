import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
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

  const handleSubmit = async (mode: 'draft' | 'review') => {
    setError(null);

    if (!caption.trim()) {
      setError('Please write a caption before posting.');
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
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

        <GradientButton
          onPress={() => handleSubmit('review')}
          label="Submit for Review"
          loading={submitting}
          disabled={submitting}
          style={styles.submitBtn}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 4,
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
