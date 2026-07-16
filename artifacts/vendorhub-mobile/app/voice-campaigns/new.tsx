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
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GradientButton } from '@/components/GradientButton';
import {
  useCreateExternalVoiceCampaign,
  getListExternalVoiceCampaignsQueryKey,
} from '@workspace/api-client-react';

export default function NewVoiceCampaignScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [script, setScript] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: createCampaign, isPending } = useCreateExternalVoiceCampaign();

  const handleCreate = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (!script.trim()) {
      setError('Call script is required.');
      return;
    }

    // Validate optional scheduled date
    let isoScheduledAt: string | undefined;
    if (scheduledAt.trim()) {
      const parsed = new Date(scheduledAt.trim());
      if (isNaN(parsed.getTime())) {
        setError('Scheduled date is not a valid date. Use format: YYYY-MM-DD HH:MM');
        return;
      }
      if (parsed <= new Date()) {
        setError('Scheduled date must be in the future.');
        return;
      }
      isoScheduledAt = parsed.toISOString();
    }

    try {
      await createCampaign({
        data: {
          name: name.trim(),
          script: script.trim(),
          ...(isoScheduledAt ? { scheduledAt: isoScheduledAt } : {}),
        },
      });

      await queryClient.invalidateQueries({
        queryKey: getListExternalVoiceCampaignsQueryKey(),
      });

      router.back();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Could not create campaign. Please try again.';
      setError(msg);
    }
  };

  const handleCancel = () => {
    if (name.trim() || script.trim() || scheduledAt.trim()) {
      Alert.alert('Discard changes?', 'Your unsaved campaign will be lost.', [
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
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Name ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>Campaign name</Text>
        <TextInput
          value={name}
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
          value={script}
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
          {script.length} / 2000
        </Text>
      </View>

      {/* ── Schedule (optional) ── */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.primary }]}>
          Schedule for later{' '}
          <Text style={[styles.optionalTag, { color: colors.mutedForeground }]}>(optional)</Text>
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Leave blank to save as a draft you can launch manually.
        </Text>
        <View
          style={[
            styles.inputRow,
            { borderColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Feather name="calendar" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
          <TextInput
            value={scheduledAt}
            onChangeText={setScheduledAt}
            placeholder="YYYY-MM-DD HH:MM"
            placeholderTextColor={colors.mutedForeground}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            style={[styles.inputInner, { color: colors.foreground }]}
          />
        </View>
      </View>

      {/* ── Error ── */}
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
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
          onPress={handleCreate}
          label="Create campaign"
          loading={isPending}
          disabled={isPending}
          style={styles.createBtn}
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
  createBtn: {
    flex: 1.6,
  },
});
