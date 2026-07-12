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

type Mode = 'signin' | 'trust' | 'forgot-email' | 'forgot-code' | 'forgot-password';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [trustCode, setTrustCode] = useState('');

  const [mode, setMode] = useState<Mode>('signin');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const isSubmitting = fetchStatus === 'fetching';
  const canSubmit = emailAddress.trim().length > 0 && password.length > 0 && !isSubmitting;

  // If a previous, unfinished sign-in attempt left the client stuck in an
  // intermediate state (e.g. needs_client_trust), reflect that on load
  // instead of silently forcing the normal form and hiding the real state.
  useEffect(() => {
    if (signIn.status === 'needs_client_trust' && mode === 'signin') {
      setMode('trust');
    }
  }, [signIn.status]);

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

  const resetToSignIn = async () => {
    await signIn.reset();
    setGenericError(null);
    setTrustCode('');
    setResetCode('');
    setNewPassword('');
    setMode('signin');
  };

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
    } else if (signIn.status === 'needs_client_trust') {
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (factor) => factor.strategy === 'email_code',
      );
      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode();
      }
      setMode('trust');
    } else if (signIn.status === 'needs_second_factor') {
      setGenericError('This account requires a second factor that this app does not yet support.');
    } else {
      setGenericError('Sign-in requires an additional step that this app does not yet support.');
    }
  };

  const handleVerifyTrustCode = async () => {
    if (!trustCode.trim() || isSubmitting) return;
    setGenericError(null);
    await signIn.mfa.verifyEmailCode({ code: trustCode.trim() });
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: () => router.replace('/') });
    } else {
      setGenericError('That code didn\u2019t work. Please try again.');
    }
  };

  const handleSendResetCode = async () => {
    if (!forgotEmail.trim() || isSubmitting) return;
    setGenericError(null);
    // Establish the sign-in attempt against this identifier (no strategy
    // yet) so a reset code can be sent for it.
    await signIn.create({ identifier: forgotEmail.trim() });
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    if (error) {
      setGenericError(error.message ?? 'Could not send a reset code to that email.');
      return;
    }
    setMode('forgot-code');
  };

  const handleVerifyResetCode = async () => {
    if (!resetCode.trim() || isSubmitting) return;
    setGenericError(null);
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: resetCode.trim() });
    if (error) {
      setGenericError(error.message ?? 'That code didn\u2019t work. Please try again.');
      return;
    }
    if (signIn.status === 'needs_new_password') {
      setMode('forgot-password');
    } else {
      setGenericError('That code didn\u2019t work. Please try again.');
    }
  };

  const handleSubmitNewPassword = async () => {
    if (newPassword.length < 8 || isSubmitting) return;
    setGenericError(null);
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
      signOutOfOtherSessions: true,
    });
    if (error) {
      setGenericError(error.message ?? 'Could not set your new password.');
      return;
    }
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: () => router.replace('/') });
    } else {
      setGenericError('Could not finish resetting your password. Please try again.');
    }
  };

  const heroSubtitle =
    mode === 'trust'
      ? 'Confirm it\u2019s you'
      : mode === 'forgot-email'
        ? 'Reset your password'
        : mode === 'forgot-code'
          ? 'Enter the code we emailed you'
          : mode === 'forgot-password'
            ? 'Choose a new password'
            : 'Sign in to manage your store';

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
        <Animated.Text
          key={heroSubtitle}
          style={styles.heroSubtitle}
          entering={FadeInDown.delay(280).springify()}
        >
          {heroSubtitle}
        </Animated.Text>
      </LinearGradient>

      {/* ── Form sheet ── */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 32 },
        ]}
      >
        {mode === 'signin' ? (
          <>
            {/* Email */}
            <Animated.View
              style={styles.field}
              entering={FadeInUp.delay(320).springify().damping(18)}
            >
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
            <Animated.View
              style={styles.field}
              entering={FadeInUp.delay(390).springify().damping(18)}
            >
              <Text style={[styles.label, { color: colors.primary }]}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      borderColor: colors.border,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  style={styles.passwordToggle}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
              {errors.fields.password ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {errors.fields.password.message}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  setGenericError(null);
                  setForgotEmail(emailAddress);
                  setMode('forgot-email');
                }}
                style={styles.forgotLink}
              >
                <Text style={[styles.link, { color: colors.accent, fontSize: 13 }]}>
                  Forgot password?
                </Text>
              </Pressable>
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
                label="Sign in"
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
          </>
        ) : null}

        {mode === 'trust' ? (
          <>
            <Animated.View style={styles.field} entering={FadeInUp.springify().damping(18)}>
              <Text style={[styles.label, { color: colors.primary }]}>Verification code</Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                We sent a code to your email to confirm it's really you on this device.
              </Text>
              <TextInput
                value={trustCode}
                onChangeText={setTrustCode}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                  },
                ]}
              />
              {errors.fields.code ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {errors.fields.code.message}
                </Text>
              ) : null}
              <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={styles.resendLink}>
                <Text style={[styles.link, { color: colors.accent, fontSize: 13 }]}>
                  Resend code
                </Text>
              </Pressable>
            </Animated.View>

            {genericError ? (
              <Animated.Text
                style={[styles.error, { color: colors.destructive, textAlign: 'center' }]}
                entering={FadeInUp.springify()}
              >
                {genericError}
              </Animated.Text>
            ) : null}

            <Animated.View entering={FadeInUp.delay(120).springify().damping(18)}>
              <GradientButton
                onPress={handleVerifyTrustCode}
                label="Verify"
                loading={isSubmitting}
                disabled={trustCode.trim().length === 0 || isSubmitting}
                style={styles.submitWrap}
              />
            </Animated.View>

            <Pressable onPress={resetToSignIn} style={styles.startOverLink}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                Not you? Start over
              </Text>
            </Pressable>
          </>
        ) : null}

        {mode === 'forgot-email' ? (
          <>
            <Animated.View style={styles.field} entering={FadeInUp.springify().damping(18)}>
              <Text style={[styles.label, { color: colors.primary }]}>Email</Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Enter your account email and we'll send you a code to reset your password.
              </Text>
              <TextInput
                value={forgotEmail}
                onChangeText={setForgotEmail}
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
            </Animated.View>

            {genericError ? (
              <Animated.Text
                style={[styles.error, { color: colors.destructive, textAlign: 'center' }]}
                entering={FadeInUp.springify()}
              >
                {genericError}
              </Animated.Text>
            ) : null}

            <Animated.View entering={FadeInUp.delay(120).springify().damping(18)}>
              <GradientButton
                onPress={handleSendResetCode}
                label="Send code"
                loading={isSubmitting}
                disabled={forgotEmail.trim().length === 0 || isSubmitting}
                style={styles.submitWrap}
              />
            </Animated.View>

            <Pressable onPress={resetToSignIn} style={styles.startOverLink}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                Back to sign in
              </Text>
            </Pressable>
          </>
        ) : null}

        {mode === 'forgot-code' ? (
          <>
            <Animated.View style={styles.field} entering={FadeInUp.springify().damping(18)}>
              <Text style={[styles.label, { color: colors.primary }]}>Verification code</Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Enter the code we sent to {forgotEmail}.
              </Text>
              <TextInput
                value={resetCode}
                onChangeText={setResetCode}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                  },
                ]}
              />
              <Pressable
                onPress={() => signIn.resetPasswordEmailCode.sendCode()}
                style={styles.resendLink}
              >
                <Text style={[styles.link, { color: colors.accent, fontSize: 13 }]}>
                  Resend code
                </Text>
              </Pressable>
            </Animated.View>

            {genericError ? (
              <Animated.Text
                style={[styles.error, { color: colors.destructive, textAlign: 'center' }]}
                entering={FadeInUp.springify()}
              >
                {genericError}
              </Animated.Text>
            ) : null}

            <Animated.View entering={FadeInUp.delay(120).springify().damping(18)}>
              <GradientButton
                onPress={handleVerifyResetCode}
                label="Verify"
                loading={isSubmitting}
                disabled={resetCode.trim().length === 0 || isSubmitting}
                style={styles.submitWrap}
              />
            </Animated.View>

            <Pressable onPress={resetToSignIn} style={styles.startOverLink}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                Back to sign in
              </Text>
            </Pressable>
          </>
        ) : null}

        {mode === 'forgot-password' ? (
          <>
            <Animated.View style={styles.field} entering={FadeInUp.springify().damping(18)}>
              <Text style={[styles.label, { color: colors.primary }]}>New password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showNewPassword}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      borderColor: colors.border,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => setShowNewPassword((prev) => !prev)}
                  accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  style={styles.passwordToggle}
                  hitSlop={8}
                >
                  <Feather
                    name={showNewPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Use at least 8 characters.
              </Text>
            </Animated.View>

            {genericError ? (
              <Animated.Text
                style={[styles.error, { color: colors.destructive, textAlign: 'center' }]}
                entering={FadeInUp.springify()}
              >
                {genericError}
              </Animated.Text>
            ) : null}

            <Animated.View entering={FadeInUp.delay(120).springify().damping(18)}>
              <GradientButton
                onPress={handleSubmitNewPassword}
                label="Set new password"
                loading={isSubmitting}
                disabled={newPassword.length < 8 || isSubmitting}
                style={styles.submitWrap}
              />
            </Animated.View>
          </>
        ) : null}
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
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    lineHeight: 18,
  },
  resendLink: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  forgotLink: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  startOverLink: {
    marginTop: 18,
    alignSelf: 'center',
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
