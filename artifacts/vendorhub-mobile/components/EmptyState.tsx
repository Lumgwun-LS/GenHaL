import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';

export function EmptyState({
  icon = 'inbox',
  title,
  message,
}: {
  icon?: React.ComponentProps<typeof Feather>['name'];
  title: string;
  message?: string;
}) {
  const colors = useColors();
  const floatY = useSharedValue(0);

  useEffect(() => {
    // Gentle float loop
    floatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 1400 }),
        withTiming(0, { duration: 1400 }),
      ),
      -1,
      true,
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        style={floatStyle}
        entering={FadeInUp.delay(100).springify().damping(16)}
      >
        <LinearGradient
          colors={['#7F50FF25', '#FF7F5025']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.iconWrap, { borderColor: colors.primary + '35' }]}
        >
          <Feather name={icon} size={30} color={colors.primary} />
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={styles.textBlock}
        entering={FadeInUp.delay(200).springify().damping(16)}
      >
        <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>
        {message ? (
          <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
    gap: 16,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});
