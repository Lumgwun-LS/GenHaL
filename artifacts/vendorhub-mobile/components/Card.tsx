import React from 'react';
import { Pressable, StyleSheet, useColorScheme, ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface CardProps extends ViewProps {
  onPress?: () => void;
}

export function Card({ style, onPress, ...props }: CardProps) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cardViewStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius + 4,
    },
    isDark ? styles.shadowDark : styles.shadowLight,
    animatedStyle,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
        onPress={onPress}
      >
        <Animated.View {...props} style={cardViewStyle} />
      </Pressable>
    );
  }

  return <Animated.View {...props} style={cardViewStyle} />;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  shadowLight: {
    shadowColor: '#7F50FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
  },
  shadowDark: {
    shadowColor: '#7F50FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
});
