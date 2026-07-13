import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { GradientButton } from '@/components/GradientButton';

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    vendor,
    features,
    updateProfile,
    logout,
    pushAlertsEnabled,
    isLoadingPushPreference,
    isTogglingPushAlerts,
    setPushAlertsEnabled,
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingCategory, setIsTogglingCategory] = useState<
    'payments' | 'voiceCampaigns' | null
  >(null);

  const paymentAlertsEnabled = vendor?.pushPaymentAlertsEnabled ?? true;
  const voiceCampaignAlertsEnabled = vendor?.pushVoiceCampaignAlertsEnabled ?? true;

  const handleToggleCategory = async (
    key: 'payments' | 'voiceCampaigns',
    next: boolean,
  ) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setIsTogglingCategory(key);
    try {
      await updateProfile(
        key === 'payments'
          ? { pushPaymentAlertsEnabled: next }
          : { pushVoiceCampaignAlertsEnabled: next },
      );
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setIsTogglingCategory(null);
    }
  };
  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [gender, setGender] = useState(vendor?.gender ?? '');
  const [country, setCountry] = useState(vendor?.country ?? '');
  const [state, setState] = useState(vendor?.state ?? '');
  const [city, setCity] = useState(vendor?.city ?? '');
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setName(vendor?.name ?? '');
    setPhone(vendor?.phone ?? '');
    setAddress(vendor?.address ?? '');
    setGender(vendor?.gender ?? '');
    setCountry(vendor?.country ?? '');
    setState(vendor?.state ?? '');
    setCity(vendor?.city ?? '');
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        gender: gender.trim(),
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
      });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setIsEditing(false);
    } catch {
      setError('Could not save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'You will need to sign in again to manage your store.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const initials = (vendor?.name ?? '?').charAt(0).toUpperCase();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Profile header ── */}
      <Animated.View style={styles.profileHeader} entering={FadeInDown.delay(60).springify()}>
        <LinearGradient
          colors={['#7F50FF', '#FF7F50']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarGradient}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </LinearGradient>

        <Text style={[styles.vendorName, { color: colors.primary }]}>{vendor?.name}</Text>
        <Text style={[styles.vendorEmail, { color: colors.mutedForeground }]}>{vendor?.email}</Text>
        {vendor?.status ? (
          <View style={styles.badgeRow}>
            <StatusBadge status={vendor.status} />
          </View>
        ) : null}
      </Animated.View>

      {/* ── Store details ── */}
      <AnimatedListItem index={0} baseDelay={120}>
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Store details</Text>
            {!isEditing && (
              <Pressable onPress={startEditing} hitSlop={8}>
                <View style={[styles.editBtn, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="edit-2" size={13} color={colors.primary} />
                </View>
              </Pressable>
            )}
          </View>

          {isEditing ? (
            <Animated.View style={styles.form} entering={FadeInUp.springify().damping(18)}>
              {[
                { label: 'Store name', value: name, onChange: setName, keyboard: 'default' },
                { label: 'Phone', value: phone, onChange: setPhone, keyboard: 'phone-pad' },
                { label: 'Address', value: address, onChange: setAddress, keyboard: 'default' },
                { label: 'Gender', value: gender, onChange: setGender, keyboard: 'default' },
                { label: 'Country', value: country, onChange: setCountry, keyboard: 'default' },
                { label: 'State', value: state, onChange: setState, keyboard: 'default' },
                { label: 'City', value: city, onChange: setCity, keyboard: 'default' },
              ].map(({ label, value, onChange, keyboard }) => (
                <View key={label} style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.primary }]}>{label}</Text>
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    keyboardType={keyboard as any}
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.foreground,
                        backgroundColor: colors.background,
                      },
                    ]}
                  />
                </View>
              ))}
              {error ? (
                <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
              ) : null}
              <View style={styles.formActions}>
                <Pressable
                  onPress={() => setIsEditing(false)}
                  style={[
                    styles.cancelButton,
                    { backgroundColor: colors.secondary, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.mutedForeground }]}>
                    Cancel
                  </Text>
                </Pressable>
                <GradientButton
                  onPress={handleSave}
                  label="Save"
                  loading={isSaving}
                  disabled={isSaving}
                  style={styles.saveButtonWrap}
                />
              </View>
            </Animated.View>
          ) : (
            <View style={styles.detailList}>
              <DetailRow icon="phone" label="Phone" value={vendor?.phone || 'Not set'} colors={colors} />
              <DetailRow icon="map-pin" label="Address" value={vendor?.address || 'Not set'} colors={colors} />
              <DetailRow icon="briefcase" label="Industry" value={vendor?.industry || 'Not set'} colors={colors} />
              <DetailRow
                icon="dollar-sign"
                label="Currency"
                value={vendor?.defaultCurrency || 'USD'}
                colors={colors}
              />
              <DetailRow icon="user" label="Gender" value={vendor?.gender || 'Not set'} colors={colors} />
              <DetailRow icon="globe" label="Country" value={vendor?.country || 'Not set'} colors={colors} />
              <DetailRow icon="map" label="State" value={vendor?.state || 'Not set'} colors={colors} />
              <DetailRow icon="navigation" label="City" value={vendor?.city || 'Not set'} colors={colors} last />
            </View>
          )}
        </Card>
      </AnimatedListItem>

      {/* ── Enabled features ── */}
      <AnimatedListItem index={1} baseDelay={120}>
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 12 }]}>
            Enabled features
          </Text>
          <View style={styles.featureWrap}>
            {features.length === 0 ? (
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                No features enabled for this account type.
              </Text>
            ) : (
              features.map((f) => (
                <LinearGradient
                  key={f}
                  colors={['#7F50FF20', '#FF7F5020']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.featurePill, { borderColor: colors.primary + '30' }]}
                >
                  <Text style={[styles.featurePillText, { color: colors.primary }]}>{f}</Text>
                </LinearGradient>
              ))
            )}
          </View>
        </Card>
      </AnimatedListItem>

      {/* ── Notifications ── */}
      <AnimatedListItem index={2} baseDelay={120}>
        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 4 }]}>
            Notifications
          </Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                Phone push alerts
              </Text>
              <Text style={[styles.toggleSubLabel, { color: colors.mutedForeground }]}>
                Get notified on this device about payment updates.
              </Text>
            </View>
            {isLoadingPushPreference ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={pushAlertsEnabled}
                onValueChange={(next) => {
                  if (Platform.OS !== 'web') {
                    Haptics.selectionAsync().catch(() => {});
                  }
                  void setPushAlertsEnabled(next);
                }}
                disabled={isTogglingPushAlerts}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFFFFF"
              />
            )}
          </View>

          {pushAlertsEnabled && (
            <>
              <View
                style={[
                  styles.toggleRow,
                  styles.toggleSubRow,
                  { borderTopColor: colors.border },
                ]}
              >
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                    Payment alerts
                  </Text>
                  <Text style={[styles.toggleSubLabel, { color: colors.mutedForeground }]}>
                    Get notified when a payment is received, fails, or is refunded.
                  </Text>
                </View>
                {isTogglingCategory === 'payments' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={paymentAlertsEnabled}
                    onValueChange={(next) => void handleToggleCategory('payments', next)}
                    disabled={isTogglingCategory !== null}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
                    Voice campaign alerts
                  </Text>
                  <Text style={[styles.toggleSubLabel, { color: colors.mutedForeground }]}>
                    Get notified when one of your voice campaigns finishes.
                  </Text>
                </View>
                {isTogglingCategory === 'voiceCampaigns' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={voiceCampaignAlertsEnabled}
                    onValueChange={(next) => void handleToggleCategory('voiceCampaigns', next)}
                    disabled={isTogglingCategory !== null}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
            </>
          )}
        </Card>
      </AnimatedListItem>

      {/* ── Sign out ── */}
      <AnimatedListItem index={3} baseDelay={120}>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: colors.destructive, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
      </AnimatedListItem>
    </ScrollView>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.detailIconWrap, { backgroundColor: colors.primary + '15' }]}>
        <Feather name={icon} size={13} color={colors.primary} />
      </View>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarGradient: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#7F50FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  vendorName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  vendorEmail: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 3,
  },
  badgeRow: {
    marginTop: 10,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailList: {
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 8,
  },
  detailIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    width: 72,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
  },
  form: {
    marginTop: 14,
    gap: 14,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  error: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  saveButtonWrap: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  toggleSubRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleSubLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  featureWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featurePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  featurePillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
