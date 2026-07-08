import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSignIn } from '@clerk/expo';
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
import { GradientButton } from '@/components/GradientButton';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [genericError, setGenericError] = useState<string | null>(null);

  const isSubmitting = fetchStatus === 'fetching';
  const canSubmit = emailAddress.trim().length > 0 && password.length > 0 && !isSubmitting;

  // Logo pulsing glow
  const glow = useSharedValue(1);
  const logoRotate = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    logoRotate.value = withSpring(1, { damping: 12, stiffness: 90 });
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
    opacity: 0.6 + (glow.value - 1) * 2,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoRotate.value }, { rotate: `${(1 - logoRotate.value) * 20}deg` }],
  }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setGenericError(null);
    const { error } = await signIn.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) return;

    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: () => router.replace('/') });
    } else {
      setGenericError('Sign-in requires an additional step that this app does not yet support.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Gradient hero header ── */}
      <LinearGradient
        colors={['#7F50FF', '#C070FF', '#FF7F50']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 40 }]}
      >
        {/* Glow halo behind logo */}
        <Animated.View style={[styles.glowHalo, glowStyle]} />

        <Animated.View style={logoStyle} entering={ZoomIn.delay(100).springify().damping(14)}>
          <View style={styles.logoWrap}>
            <Feather name="shopping-bag" size={32} color="#FFFFFF" />
          </View>
        </Animated.View>

        <Animated.Text style={styles.heroTitle} entering={FadeInDown.delay(200).springify()}>
          VendorHub
        </Animated.Text>
        <Animated.Text style={styles.heroSubtitle} entering={FadeInDown.delay(280).springify()}>
          Sign in to manage your store
        </Animated.Text>
      </LinearGradient>

      {/* ── Form sheet ── */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 32 },
        ]}
      >
        {/* Email */}
        <Animated.View style={styles.field} entering={FadeInUp.delay(320).springify().damping(18)}>
          <Text style={[styles.label, { color: colors.primary }]}>Email</Text>
          <TextInput
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="jane@example.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
              },
            ]}
          />
          {errors.fields.identifier ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {errors.fields.identifier.message}
            </Text>
          ) : null}
        </Animated.View>

        {/* Password */}
        <Animated.View style={styles.field} entering={FadeInUp.delay(390).springify().damping(18)}>
          <Text style={[styles.label, { color: colors.primary }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
              },
            ]}
          />
          {errors.fields.password ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {errors.fields.password.message}
            </Text>
          ) : null}
        </Animated.View>

        {genericError ? (
          <Animated.Text
            style={[styles.error, { color: colors.destructive, textAlign: 'center' }]}
            entering={FadeInUp.springify()}
          >
            {genericError}
          </Animated.Text>
        ) : null}

        <Animated.View entering={FadeInUp.delay(460).springify().damping(18)}>
          <GradientButton
            onPress={handleSubmit}
            label="Continue"
            loading={isSubmitting}
            disabled={!canSubmit}
            style={styles.submitWrap}
          />
        </Animated.View>

        <Animated.View style={styles.linkRow} entering={FadeInUp.delay(530).springify()}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
            Don't have an account?{' '}
          </Text>
          <Link href="/sign-up">
            <Text style={[styles.link, { color: colors.accent }]}>Sign up</Text>
          </Link>
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
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 7,
    letterSpacing: 0.2,
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
    marginTop: 6,
  },
  submitWrap: {
    marginTop: 4,
    marginBottom: 4,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
  },
  link: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
