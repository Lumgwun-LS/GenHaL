import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GradientButton } from '@/components/GradientButton';
import { LoadingView } from '@/components/LoadingView';
import { ErrorView } from '@/components/ErrorView';
import {
  useUpdateExternalVoiceCampaign,
  useGetExternalVoiceCampaign,
  getGetExternalVoiceCampaignQueryKey,
  getListExternalVoiceCampaignsQueryKey,
} from '@workspace/api-client-react';

/** Format an ISO date string as the "YYYY-MM-DD HH:MM" string the field expects */
function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditVoiceCampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const campaignId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: campaign, isLoading, isError, refetch } = useGetExternalVoiceCampaign(campaignId, {
    query: {
      queryKey: getGetExternalVoiceCampaignQueryKey(campaignId),
      enabled: Number.isInteger(campaignId),
    },
  });

  // Local form state — seeded from the campaign once loaded
  const [name, setName] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: updateCampaign, isPending } = useUpdateExternalVoiceCampaign();

  // Seed form state from loaded campaign (only once)
  if (campaign && name === null && script === null && scheduledAt === null) {
    setName(campaign.name);
    setScript(campaign.script);
    setScheduledAt(isoToLocal(campaign.scheduledAt));
  }

  const handleSave = async () => {
    setError(null);

    const trimmedName = (name ?? '').trim();
    const trimmedScript = (script ?? '').trim();
    const trimmedScheduledAt = (scheduledAt ?? '').trim();

    if (!trimmedName) {
      setError('Campaign name is required.');
      return;
    }
    if (!trimmedScript) {
      setError('Call script is required.');
      return;
    }

    let isoScheduledAt: string | null | undefined;
    if (trimmedScheduledAt) {
      const parsed = new Date(trimmedScheduledAt);
      if (isNaN(parsed.getTime())) {
        setError('Scheduled date is not a valid date. Use format: YYYY-MM-DD HH:MM');
        return;
      }
      if (parsed <= new Date()) {
        setError('Scheduled date must be in the future.');
        return;
      }
      isoScheduledAt = parsed.toISOString();
    } else {
      // Explicitly clear the scheduled time → revert to draft
      isoScheduledAt = null;
    }

    try {
      await updateCampaign({
        id: campaignId,
        data: {
          name: trimmedName,
          script: trimmedScript,
          scheduledAt: isoScheduledAt,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getGetExternalVoiceCampaignQueryKey(campaignId) });
      await queryClient.invalidateQueries({ queryKey: getListExternalVoiceCampaignsQueryKey() });

      router.back();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Could not save changes. Please try again.';
      setError(msg);
    }
  };

  const handleCancel = () => {
    const hasChanges =
      campaign &&
      ((name ?? '').trim() !== campaign.name ||
        (script ?? '').trim() !== campaign.script ||
        (scheduledAt ?? '').trim() !== isoToLocal(campaign.scheduledAt));

    if (hasChanges) {
      Alert.alert('Discard changes?', 'Your unsaved edits will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  if (isLoading || name === null) return <LoadingView />;
  if (isError || !campaign) return <ErrorView onRetry={() => refetch()} />;

  const currentScript = script ?? '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Name ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Campaign name</Text>
        <TextInput
          value={name ?? ''}
          onChangeText={setName}
          placeholder="e.g. Summer sale outreach"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
          ]}
          maxLength={200}
          returnKeyType="next"
        />
      </View>

      {/* ── Script ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Call script</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Use {'{{name}}'} to personalise with each lead's name.
        </Text>
        <TextInput
          value={currentScript}
          onChangeText={setScript}
          placeholder="Hi {{name}}, this is a message from our store..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={6}
          style={[
            styles.input,
            styles.scriptInput,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
          ]}
          maxLength={2000}
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
          {currentScript.length} / 2000
        </Text>
      </View>

      {/* ── Schedule (optional) ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>
          Schedule for later{' '}
          <Text style={[styles.optionalTag, { color: colors.mutedForeground }]}>(optional)</Text>
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Clear this field to save as a draft you can launch manually.
        </Text>
        <View
          style={[
            styles.inputRow,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
          <TextInput
            value={scheduledAt ?? ''}
            onChangeText={setScheduledAt}
            placeholder="YYYY-MM-DD HH:MM"
            placeholderTextColor={colors.mutedForeground}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            style={[styles.inputInner, { color: colors.foreground }]}
          />
          {(scheduledAt ?? '').trim().length > 0 && (
            <Pressable onPress={() => setScheduledAt('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
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
        <GradientButton
          onPress={handleSave}
          label={isPending ? 'Saving…' : 'Save changes'}
          loading={isPending}
          disabled={isPending}
          style={styles.saveBtn}
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
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  optionalTag: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    lineHeight: 17,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  scriptInput: {
    minHeight: 130,
    paddingTop: 11,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputInner: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
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
    fontFamily: 'Inter_500Medium',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  saveBtn: {
    flex: 1.6,
  },
});
