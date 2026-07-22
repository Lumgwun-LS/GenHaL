/**
 * AI Video Compose — mobile screen for creating an AI-generated video post.
 *
 * Flow:
 *  1. Vendor enters a prompt, picks scene count, motion template, and
 *     (optionally) music mood.
 *  2. Tapping "Generate Scenes" calls /ai/generate-video-scenes and shows
 *     the scene preview images — no aiVideos quota is spent yet.
 *  3. Vendor reviews scenes, edits prompts, and regenerates individual
 *     scenes as desired.
 *  4. Tapping "Render Video" calls /ai/render-video with the confirmed
 *     scene image URLs and the chosen music settings.  This is the only
 *     step that spends aiVideos quota.
 *  5. The rendered video URL is passed back to the new-post screen via
 *     router.push so the vendor can caption and submit it.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GradientButton } from '@/components/GradientButton';
import { useAuth } from '@/context/AuthContext';
import {
  useGenerateAiVideoScenes,
  useRegenerateAiVideoScene,
  useRenderAiVideo,
} from '@workspace/api-client-react';

// ── Types ────────────────────────────────────────────────────────────────────

type MotionTemplate = 'auto' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'zoom-pan';
type MusicMood = 'upbeat' | 'calm' | 'corporate' | 'festive' | 'dramatic' | 'romantic';
type SceneCount = 1 | 2 | 3;

interface ScenePreview {
  id: number;
  prompt: string;
  imageUrl: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_LEN = 500;

const MOTION_OPTIONS: { value: MotionTemplate; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'zoom-in', label: 'Zoom in' },
  { value: 'zoom-out', label: 'Zoom out' },
  { value: 'pan-left', label: 'Pan left' },
  { value: 'pan-right', label: 'Pan right' },
  { value: 'zoom-pan', label: 'Zoom + pan' },
];

const MUSIC_MOOD_OPTIONS: { value: MusicMood; label: string; emoji: string }[] = [
  { value: 'upbeat', label: 'Upbeat', emoji: '⚡' },
  { value: 'calm', label: 'Calm', emoji: '🌿' },
  { value: 'corporate', label: 'Corporate', emoji: '💼' },
  { value: 'festive', label: 'Festive', emoji: '🎉' },
  { value: 'dramatic', label: 'Dramatic', emoji: '🎬' },
  { value: 'romantic', label: 'Romantic', emoji: '💫' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

/** Horizontal scrolling chip row for picking a single value from a list. */
function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: { value: T; label: string; emoji?: string }[];
  selected: T;
  onSelect: (v: T) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            {opt.emoji ? (
              <Text style={styles.chipEmoji}>{opt.emoji}</Text>
            ) : null}
            <Text
              style={[
                styles.chipText,
                { color: active ? '#FFFFFF' : colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Counter control for scene count (1 / 2 / 3). */
function SceneCountPicker({
  value,
  onChange,
  colors,
}: {
  value: SceneCount;
  onChange: (v: SceneCount) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.counterRow}>
      {([1, 2, 3] as SceneCount[]).map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[
              styles.counterBtn,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.counterBtnText,
                { color: active ? '#FFFFFF' : colors.mutedForeground },
              ]}
            >
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AiVideoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { vendor } = useAuth();
  const vendorId = vendor?.id ?? 0;

  // ── Setup state ─────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('');
  const [sceneCount, setSceneCount] = useState<SceneCount>(1);
  const [motionTemplate, setMotionTemplate] = useState<MotionTemplate>('auto');
  const [includeMusic, setIncludeMusic] = useState(false);
  /** undefined = "Auto" (server derives from content). Defined only when includeMusic is on. */
  const [musicMood, setMusicMood] = useState<MusicMood | undefined>(undefined);

  // ── Scene preview state ──────────────────────────────────────────────────────
  const [scenes, setScenes] = useState<ScenePreview[] | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);

  // ── Render result state ──────────────────────────────────────────────────────
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);

  // ── Error state ──────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);

  // ── API hooks ────────────────────────────────────────────────────────────────
  const { mutateAsync: generateScenes, isPending: generatingScenes } =
    useGenerateAiVideoScenes();
  const { mutateAsync: regenerateScene, isPending: regeneratingScene } =
    useRegenerateAiVideoScene();
  const { mutateAsync: renderVideo, isPending: renderingVideo } =
    useRenderAiVideo();

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleGenerateScenes = async () => {
    setError(null);
    if (!prompt.trim()) {
      setError('Enter a description for your video first.');
      return;
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      setError(`Prompt must be ${MAX_PROMPT_LEN} characters or fewer.`);
      return;
    }
    try {
      const result = await generateScenes({
        data: { vendorId, prompt: prompt.trim(), sceneCount },
      });
      const failed = result.scenes.find((s) => s.status === 'failed');
      if (failed) {
        setError(failed.result ?? 'Scene generation failed — please try again.');
        return;
      }
      setScenes(
        result.scenes.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          imageUrl: s.result ?? '',
        })),
      );
      setRenderedVideoUrl(null);
    } catch {
      setError('Failed to generate scene previews. Please try again.');
    }
  };

  const handleRegenerateScene = async (idx: number) => {
    if (!scenes) return;
    const scene = scenes[idx];
    if (scene.prompt.length > MAX_PROMPT_LEN) {
      setError(`Scene ${idx + 1} prompt is too long — shorten it to ${MAX_PROMPT_LEN} characters or fewer.`);
      return;
    }
    setError(null);
    setRegeneratingIdx(idx);
    try {
      const result = await regenerateScene({
        data: { vendorId, prompt: scene.prompt },
      });
      if (result.status === 'failed') {
        setError(result.result ?? 'Scene regeneration failed.');
        return;
      }
      setScenes((prev) =>
        prev
          ? prev.map((s, i) =>
              i === idx
                ? { id: result.id, prompt: result.prompt, imageUrl: result.result ?? '' }
                : s,
            )
          : prev,
      );
    } catch {
      setError('Failed to regenerate scene. Please try again.');
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleRenderVideo = async () => {
    if (!scenes || scenes.length === 0) return;
    setError(null);
    try {
      const result = await renderVideo({
        data: {
          vendorId,
          prompt: prompt.trim(),
          sceneImageUrls: scenes.map((s) => s.imageUrl),
          captionText: prompt.trim(),
          motionTemplate,
          includeMusic,
          // Pass the chosen mood only when the vendor picked one explicitly;
          // undefined = "Auto" and lets the server derive the mood from content.
          ...(includeMusic && musicMood ? { musicMood } : {}),
        },
      });
      if (result.status === 'failed') {
        setError(result.result ?? 'Video rendering failed — please try again.');
        return;
      }
      setRenderedVideoUrl(result.result ?? null);
      setScenes(null);
    } catch {
      setError('Failed to render video. Please try again.');
    }
  };

  const handleDiscardScenes = () => {
    Alert.alert('Discard scenes?', 'The AI image credits already spent cannot be recovered.', [
      { text: 'Keep scenes', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setScenes(null) },
    ]);
  };

  const handleUseVideo = () => {
    if (!renderedVideoUrl) return;
    // Pass the video URL back to the new-post screen via URL params so the
    // vendor can write a caption and submit it for review.
    router.push({
      pathname: '/social/new',
      params: { videoUrl: renderedVideoUrl },
    } as any);
  };

  // ── UI helpers ────────────────────────────────────────────────────────────────

  const isSetupDisabled = generatingScenes || renderingVideo;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>AI Video</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Prompt ── */}
      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.primary }]}>Video description</Text>
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {prompt.length} / {MAX_PROMPT_LEN}
          </Text>
        </View>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Describe your product or the story you want the video to tell…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          maxLength={MAX_PROMPT_LEN}
          textAlignVertical="top"
          editable={!isSetupDisabled}
          style={[
            styles.textarea,
            {
              borderColor: colors.border,
              color: colors.foreground,
              backgroundColor: colors.card,
              opacity: isSetupDisabled ? 0.6 : 1,
            },
          ]}
        />
      </View>

      {/* ── Scene count ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Scenes</Text>
        <SceneCountPicker value={sceneCount} onChange={setSceneCount} colors={colors} />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          More scenes = more visual variety. Each scene preview spends one AI image credit.
        </Text>
      </View>

      {/* ── Motion template ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Camera motion</Text>
        <ChipRow
          options={MOTION_OPTIONS}
          selected={motionTemplate}
          onSelect={setMotionTemplate}
          colors={colors}
        />
      </View>

      {/* ── Background music ── */}
      <View
        style={[
          styles.section,
          styles.musicSection,
          {
            borderColor: includeMusic ? colors.primary + '50' : colors.border,
            backgroundColor: includeMusic ? colors.primary + '08' : colors.card,
          },
        ]}
      >
        {/* Toggle row */}
        <Pressable
          onPress={() => setIncludeMusic((v) => !v)}
          style={styles.musicToggleRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: includeMusic }}
        >
          <View style={styles.musicToggleLeft}>
            <Feather
              name="music"
              size={16}
              color={includeMusic ? colors.primary : colors.mutedForeground}
            />
            <View>
              <Text
                style={[
                  styles.musicToggleTitle,
                  { color: includeMusic ? colors.primary : colors.foreground },
                ]}
              >
                Background music
              </Text>
              {!includeMusic && (
                <Text style={[styles.musicToggleSubtitle, { color: colors.mutedForeground }]}>
                  Add a short instrumental track to the video
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={includeMusic}
            onValueChange={setIncludeMusic}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={includeMusic ? colors.primary : colors.mutedForeground}
          />
        </Pressable>

        {/* Mood picker — only shown when music is on */}
        {includeMusic && (
          <View style={styles.moodPickerWrap}>
            <Text style={[styles.moodLabel, { color: colors.mutedForeground }]}>
              Music mood
            </Text>
            {/* "Auto" chip — clears any explicit selection */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {/* Auto option */}
              <Pressable
                onPress={() => setMusicMood(undefined)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: musicMood === undefined ? colors.primary : colors.card,
                    borderColor: musicMood === undefined ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={styles.chipEmoji}>✨</Text>
                <Text
                  style={[
                    styles.chipText,
                    { color: musicMood === undefined ? '#FFFFFF' : colors.mutedForeground },
                  ]}
                >
                  Auto
                </Text>
              </Pressable>

              {MUSIC_MOOD_OPTIONS.map((opt) => {
                const active = musicMood === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setMusicMood(opt.value)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? '#FFFFFF' : colors.mutedForeground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[styles.moodHint, { color: colors.mutedForeground }]}>
              {musicMood === undefined
                ? 'Auto: AI picks the best mood based on your video content.'
                : `${MUSIC_MOOD_OPTIONS.find((o) => o.value === musicMood)?.label} mood selected.`}
            </Text>
          </View>
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

      {/* ── Generate scenes button ── */}
      {!scenes && !renderedVideoUrl && (
        <GradientButton
          onPress={handleGenerateScenes}
          label={generatingScenes ? 'Generating scenes…' : 'Generate Scenes'}
          loading={generatingScenes}
          disabled={generatingScenes}
          style={styles.primaryBtn}
        />
      )}

      {generatingScenes && (
        <Text style={[styles.loadingHint, { color: colors.mutedForeground }]}>
          Generating {sceneCount} scene preview{sceneCount > 1 ? 's' : ''} with AI imagery — this
          can take a moment. No video credit is spent until you render.
        </Text>
      )}

      {/* ── Scene previews ── */}
      {scenes && scenes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sceneHeader}>
            <Text style={[styles.label, { color: colors.primary }]}>
              Review scenes
            </Text>
            <Pressable
              onPress={handleDiscardScenes}
              disabled={renderingVideo}
              style={({ pressed }) => [{ opacity: pressed || renderingVideo ? 0.5 : 1 }]}
            >
              <Text style={[styles.discardText, { color: colors.mutedForeground }]}>
                Discard
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Edit a scene's prompt and tap ↺ to regenerate it. Rendering is the only step that
            spends an AI video credit.
          </Text>

          {scenes.map((scene, idx) => {
            const isRegenerating = regeneratingIdx === idx;
            const promptTooLong = scene.prompt.length > MAX_PROMPT_LEN;
            return (
              <View
                key={scene.id}
                style={[styles.sceneCard, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                {/* Badge */}
                <View style={[styles.sceneBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.sceneBadgeText}>Scene {idx + 1}</Text>
                </View>

                {/* Preview image */}
                <Image
                  source={{ uri: scene.imageUrl }}
                  style={styles.sceneImage}
                  resizeMode="cover"
                />

                {/* Regenerate button overlay */}
                <Pressable
                  onPress={() => handleRegenerateScene(idx)}
                  disabled={regeneratingScene || renderingVideo || promptTooLong}
                  style={({ pressed }) => [
                    styles.regenBtn,
                    {
                      backgroundColor: colors.card + 'EE',
                      borderColor: colors.border,
                      opacity: pressed || regeneratingScene || renderingVideo ? 0.6 : 1,
                    },
                  ]}
                >
                  {isRegenerating ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="refresh-cw" size={14} color={colors.primary} />
                  )}
                </Pressable>

                {/* Prompt editor */}
                <View style={styles.scenePromptWrap}>
                  <TextInput
                    value={scene.prompt}
                    onChangeText={(v) =>
                      setScenes((prev) =>
                        prev ? prev.map((s, i) => (i === idx ? { ...s, prompt: v } : s)) : prev,
                      )
                    }
                    multiline
                    maxLength={MAX_PROMPT_LEN + 50}
                    placeholder="Edit prompt to steer the next regeneration…"
                    placeholderTextColor={colors.mutedForeground}
                    editable={!regeneratingScene && !renderingVideo}
                    textAlignVertical="top"
                    style={[
                      styles.scenePromptInput,
                      {
                        borderColor: promptTooLong ? colors.destructive : colors.border,
                        color: colors.foreground,
                        backgroundColor: colors.background,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.promptCount,
                      {
                        color: promptTooLong ? colors.destructive : colors.mutedForeground,
                      },
                    ]}
                  >
                    {scene.prompt.length} / {MAX_PROMPT_LEN}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Render button */}
          <GradientButton
            onPress={handleRenderVideo}
            label={renderingVideo ? 'Rendering video…' : 'Render Video'}
            loading={renderingVideo}
            disabled={renderingVideo || regeneratingScene || regeneratingIdx !== null}
            style={styles.primaryBtn}
          />
          {renderingVideo && (
            <Text style={[styles.loadingHint, { color: colors.mutedForeground }]}>
              Stitching your scenes into a video
              {includeMusic ? ' and generating background music' : ''}
              — this can take up to a minute.
            </Text>
          )}
        </View>
      )}

      {/* ── Rendered video result ── */}
      {renderedVideoUrl && (
        <View style={styles.section}>
          <View
            style={[
              styles.resultCard,
              { borderColor: colors.primary + '50', backgroundColor: colors.primary + '08' },
            ]}
          >
            <Feather name="check-circle" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: colors.primary }]}>
                Video ready!
              </Text>
              <Text style={[styles.resultSubtitle, { color: colors.mutedForeground }]}>
                Tap "Use this video" to create a post with it.
              </Text>
            </View>
          </View>

          <GradientButton
            onPress={handleUseVideo}
            label="Use this video in a post"
            style={styles.primaryBtn}
          />

          <Pressable
            onPress={() => {
              setRenderedVideoUrl(null);
              setScenes(null);
            }}
            style={({ pressed }) => [styles.startOverBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.startOverText, { color: colors.mutedForeground }]}>
              Start over with a new video
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
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
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 110,
    lineHeight: 22,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipEmoji: {
    fontSize: 13,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  counterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  counterBtn: {
    width: 52,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  // ── Music section ────────────────────────────────────────────────────────────
  musicSection: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  musicToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  musicToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  musicToggleTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  musicToggleSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    lineHeight: 16,
  },
  moodPickerWrap: {
    marginTop: 16,
    gap: 8,
  },
  moodLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  moodHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  // ── Error ────────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  // ── Buttons ──────────────────────────────────────────────────────────────────
  primaryBtn: {
    marginTop: 8,
  },
  loadingHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
  },
  // ── Scene cards ──────────────────────────────────────────────────────────────
  sceneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  discardText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  sceneCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 14,
    position: 'relative',
  },
  sceneBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sceneBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  sceneImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  regenBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenePromptWrap: {
    padding: 12,
    gap: 4,
  },
  scenePromptInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    minHeight: 70,
    lineHeight: 19,
  },
  promptCount: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
  },
  // ── Result card ──────────────────────────────────────────────────────────────
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  resultSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    lineHeight: 17,
  },
  startOverBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  startOverText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
