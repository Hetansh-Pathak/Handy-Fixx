import { useEffect, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";

/**
 * Motion for stickers. Transforms and opacity only (smooth on a low-end phone); never a blur filter.
 * `reduced` = reduced motion: the sticker is simply there, at rest.
 */

/** Springy, with a little overshoot when it lands. */
const SPRING = { damping: 9, stiffness: 140, mass: 0.9 } as const;
const SETTLE = { damping: 11, stiffness: 160 } as const;

/**
 * The "slap": drops in from above, tilted and large, lands at `restRotate` with an overshoot, optionally shakes as if stuck on.
 * `far` is the opening screen (translateY -260, 20 deg, scale 1.4); `near` is the shorter version for the login poster.
 */
export function StickerSlap({ children, restRotate, delay = 0, far = false, shakeAt, reduced }: {
  children: ReactNode;
  /** Degrees at rest (the sticker's tilt). */
  restRotate: number;
  /** Milliseconds before it starts. */
  delay?: number;
  far?: boolean;
  /** Milliseconds from mount at which the short shake starts (omit for none). */
  shakeAt?: number;
  reduced: boolean;
}) {
  const fromY = far ? -260 : -90;
  const fromRotate = far ? 20 : restRotate + 14;
  const fromScale = far ? 1.4 : 1.2;
  const y = useSharedValue(reduced ? 0 : fromY);
  const rotate = useSharedValue(reduced ? restRotate : fromRotate);
  const scale = useSharedValue(reduced ? 1 : fromScale);
  const opacity = useSharedValue(reduced ? 1 : 0);
  const shakeRotate = useSharedValue(0);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    y.value = withDelay(delay, withSpring(0, SPRING));
    rotate.value = withDelay(delay, withSpring(restRotate, SPRING));
    scale.value = withDelay(delay, withSpring(1, SETTLE));
    opacity.value = withDelay(delay, withTiming(1, { duration: 80 }));
    if (shakeAt !== undefined) {
      // rest -5 deg -> -1 -> -8 -> -5, with a small shift sideways
      shakeRotate.value = withDelay(shakeAt, withSequence(withTiming(4, { duration: 70 }), withTiming(-3, { duration: 90 }), withTiming(0, { duration: 90 })));
      shakeX.value = withDelay(shakeAt, withSequence(withTiming(3, { duration: 70 }), withTiming(-3, { duration: 90 }), withTiming(0, { duration: 90 })));
    }
  }, [reduced, delay, restRotate, shakeAt, y, rotate, scale, opacity, shakeRotate, shakeX]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shakeX.value }, { translateY: y.value }, { rotate: `${rotate.value + shakeRotate.value}deg` }, { scale: scale.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The small stickers of the poster: pop in (scale 0 to 1, springy) one after another. */
export function StickerPop({ children, restRotate, delay = 0, reduced }: { children: ReactNode; restRotate: number; delay?: number; reduced: boolean }) {
  const scale = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    scale.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 170 }));
  }, [reduced, delay, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${restRotate}deg` }, { scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
