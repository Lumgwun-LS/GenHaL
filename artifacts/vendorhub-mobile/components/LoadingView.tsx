import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

export function LoadingView() {
  const colors = useColors();
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(0.85);
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withTiming(1.05, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Staggered dot bounce
    const D = 320;
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: D }), withTiming(0.3, { duration: D })),
      -1,
    );
    dot2.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: D / 2 }),
        withTiming(1, { duration: D }),
        withTiming(0.3, { duration: D / 2 }),
      ),
      -1,
    );
    dot3.value = withRepeat(
      withSequence(withTiming(0.3, { duration: D }), withTiming(1, { duration: D })),
      -1,
    );
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const d1 = useAnimatedStyle(() => ({
    opacity: dot1.value,
    transform: [{ scale: 0.6 + dot1.value * 0.4 }],
  }));
  const d2 = useAnimatedStyle(() => ({
    opacity: dot2.value,
    transform: [{ scale: 0.6 + dot2.value * 0.4 }],
  }));
  const d3 = useAnimatedStyle(() => ({
    opacity: dot3.value,
    transform: [{ scale: 0.6 + dot3.value * 0.4 }],
  }));

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <Animated.View style={pulseStyle}>
        <View style={[styles.ring, { borderColor: colors.primary + '25' }]}>
          <Animated.View
            style={[
              styles.arc,
              {
                borderTopColor: colors.primary,
                borderRightColor: colors.accent,
              },
              spinStyle,
            ]}
          />
          <View style={[styles.center, { backgroundColor: colors.primary + '18' }]} />
        </View>
      </Animated.View>

      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, d1]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, d2]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, d3]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingVertical: 56,
  },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  center: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
