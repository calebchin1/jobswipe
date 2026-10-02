import React, { useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

export type SwipeDirection = 'left' | 'right';

/**
 * One swipeable deck card. Built on PanResponder/Animated (no extra native modules), so it runs in
 * Expo Go, development builds and the web export. It only claims clearly horizontal drags, so the
 * surrounding ScrollView keeps vertical scrolling. Buttons beside the card remain the accessible path.
 */
export function SwipeCard({
  children,
  onSwipe,
  canSwipe = () => true,
  leftLabel = 'Pass',
  rightLabel = 'Apply',
  label,
}: {
  children: React.ReactNode;
  onSwipe: (direction: SwipeDirection) => void;
  canSwipe?: (direction: SwipeDirection) => boolean;
  leftLabel?: string;
  rightLabel?: string;
  label: string;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(360);
  const latest = useRef({ onSwipe, canSwipe });
  latest.current = { onSwipe, canSwipe };

  const responder = useMemo(() => {
    const reset = () =>
      Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(g.dx),
      onPanResponderRelease: async (_, g) => {
        const threshold = Math.min(110, width.current * 0.28);
        const direction: SwipeDirection | null =
          g.dx > threshold || g.vx > 0.8
            ? 'right'
            : g.dx < -threshold || g.vx < -0.8
              ? 'left'
              : null;
        if (!direction || !latest.current.canSwipe(direction)) return reset();
        const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
        if (reduced) {
          x.setValue(0);
          latest.current.onSwipe(direction);
          return;
        }
        Animated.timing(x, {
          toValue: (direction === 'right' ? 1 : -1) * (width.current + 160),
          duration: 180,
          useNativeDriver: false,
        }).start(() => {
          x.setValue(0);
          latest.current.onSwipe(direction);
        });
      },
      onPanResponderTerminate: reset,
    });
  }, [x]);

  const rotate = x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const right = x.interpolate({ inputRange: [0, 110], outputRange: [0, 1], extrapolate: 'clamp' });
  const left = x.interpolate({ inputRange: [-110, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={(event) => (width.current = event.nativeEvent.layout.width || 360)}
      accessibilityLabel={`${label}. Swipe right to ${rightLabel.toLowerCase()}, left to ${leftLabel.toLowerCase()}, or use the buttons below.`}
      style={[styles.card, { transform: [{ translateX: x }, { rotate }] }]}
    >
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.right, { opacity: right }]}>
        <Text style={[styles.stampText, { color: '#295C46' }]}>{rightLabel}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.left, { opacity: left }]}>
        <Text style={[styles.stampText, { color: '#9A5B46' }]}>{leftLabel}</Text>
      </Animated.View>
      <View>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative' },
  stamp: {
    position: 'absolute',
    top: 16,
    zIndex: 2,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFFF0',
  },
  right: { left: 16, borderColor: '#295C46', transform: [{ rotate: '-8deg' }] },
  left: { right: 16, borderColor: '#9A5B46', transform: [{ rotate: '8deg' }] },
  stampText: { fontSize: 14, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});
