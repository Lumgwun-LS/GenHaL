import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useAuth, AwajimaaUserType } from '@/context/AuthContext';
import { ApiError } from '@workspace/api-client-react';
import { GradientButton } from '@/components/GradientButton';

const USER_TYPES: {
  value: AwajimaaUserType;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { value: 'business', label: 'Business', icon: 'briefcase' },
  { value: 'individual', label: 'Individual', icon: 'user' },
  { value: 'state', label: 'State', icon: 'flag' },
  { value: 'hospital', label: 'Hospital', icon: 'plus-square' },
  { value: 'emergency', label: 'Emergency', icon: 'alert-circle' },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { completeOnboarding } = useAuth();

  const [userType, setUserType] = useState<AwajimaaUserType>('business');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const glow = useSharedValue(1);
  const logoScale = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withSpring(1, { damping: 12, stiffness: 90 });
    glow.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
    opacity: 0.55 + (glow.value - 1) * 1.5,
  }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await completeOnboarding({ userType, phone: phone.trim() || undefined });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not set up your account. Please try again.');
      } else {
        setError('Could not set up your account. Check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Gradient hero ── */}
      <LinearGradient
        colors={['#7F50FF', '#A060FF', '#FF7F50']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 40 }]}
      >
        <Animated.View style={[styles.glowHalo, glowStyle]} />

        <Animated.View style={logoStyle} entering={ZoomIn.delay(80).springify().damping(14)}>
          <View style={styles.logoWrap}>
            <Feather name="shopping-bag" size={32} color="#FFFFFF" />
          </View>
        </Animated.View>

        <Animated.Text style={styles.heroTitle} entering={FadeInDown.delay(180).springify()}>
          {user?.firstName ? `Welcome, ${user.firstName}!` : 'Welcome!'}
        </Animated.Text>
        <Animated.Text style={styles.heroSubtitle} entering={FadeInDown.delay(260).springify()}>
          Tell us about your vendor account
        </Animated.Text>
      </LinearGradient>

      {/* ── Form sheet ── */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 32 },
        ]}
      >
        {/* Account type */}
        <Animated.View style={styles.section} entering={FadeInUp.delay(320).springify().damping(18)}>
          <Text style={[styles.label, { color: colors.primary }]}>Account type</Text>
          <View style={styles.chipRow}>
            {USER_TYPES.map((t, idx) => {
              const active = t.value === userType;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setUserType(t.value)}
                  style={{ opacity: 1 }}
                >
                  {active ? (
                    <LinearGradient
                      colors={['#7F50FF', '#FF7F50']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.chip}
                    >
                      <Feather name={t.icon} size={14} color="#FFFFFF" />
                      <Text style={[styles.chipText, { color: '#FFFFFF' }]}>{t.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
                      ]}
                    >
                      <Feather name={t.icon} size={14} color={colors.mutedForeground} />
                      <Text style={[styles.chipText, { color: colors.mutedForeground }]}>{t.label}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Phone */}
        <Animated.View style={styles.section} entering={FadeInUp.delay(400).springify().damping(18)}>
          <Text style={[styles.label, { color: colors.primary }]}>Phone (optional)</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+234 800 000 0000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
            ]}
          />
        </Animated.View>

        {error ? (
          <Animated.Text
            style={[styles.error, { color: colors.destructive }]}
            entering={FadeInUp.springify()}
          >
            {error}
          </Animated.Text>
        ) : null}

        <Animated.View entering={FadeInUp.delay(480).springify().damping(18)}>
          <GradientButton
            onPress={handleSubmit}
            label="Set up my store"
            loading={isSubmitting}
            disabled={isSubmitting}
          />
        </Animated.View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingBottom: 44,
    paddingHorizontal: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  glowHalo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FFFFFF',
    opacity: 0.08,
    top: 30,
    alignSelf: 'center',
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.78)',
    marginTop: 6,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    paddingTop: 32,
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 22,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginBottom: 14,
    textAlign: 'center',
  },
});
