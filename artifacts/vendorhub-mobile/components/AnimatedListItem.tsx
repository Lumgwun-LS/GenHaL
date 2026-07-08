import React from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface Props {
  index?: number;
  baseDelay?: number;
  children: React.ReactNode;
  style?: object;
}

/**
 * Wraps a list item in a staggered fade-in-up entering animation.
 * Use `index` to offset each item so they cascade in sequence.
 */
export function AnimatedListItem({ index = 0, baseDelay = 0, children, style }: Props) {
  return (
    <Animated.View
      entering={FadeInDown.delay(baseDelay + index * 65)
        .springify()
        .damping(18)
        .stiffness(140)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
