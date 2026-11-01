import React, { memo, useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { CHIEF_ID } from '../core/state';
import { MASCOT, METRICS, MOTION } from '../theme/tokens';
import { useReducedMotion } from './Motion';

// Native views, no canvas or idle render loop. Only the working mascot moves.
export const Mascot = memo(function Mascot({ identity = CHIEF_ID, size = METRICS.avatar, working = false }: { identity?: string; size?: number; working?: boolean }) {
  const reduced = useReducedMotion(), movement = useRef(new Animated.Value(0)).current;
  let hash: number = MASCOT.hashSeed;
  for (const character of identity) hash = (Math.imul(hash, MASCOT.hashMultiplier) + character.charCodeAt(0)) | 0;
  const color = identity === CHIEF_ID ? MASCOT.body : MASCOT.colors[Math.abs(hash) % MASCOT.colors.length];
  useEffect(() => {
    movement.setValue(0);
    if (!working || reduced) return;
    const animation = Animated.loop(Animated.sequence([Animated.timing(movement, { toValue: 1, duration: MOTION.mascotMs, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(movement, { toValue: 0, duration: MOTION.mascotMs, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => { animation.stop(); movement.setValue(0); };
  }, [working, reduced, movement]);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ pointerEvents: 'none', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View style={{ width: size, height: size * MASCOT.heightRatio, borderRadius: size * MASCOT.radiusRatio, backgroundColor: color, overflow: 'hidden', transform: [{ translateY: movement.interpolate({ inputRange: [0, 1], outputRange: [0, MOTION.mascotLift] }) }] }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: size * MASCOT.shadeInset, bottom: size * MASCOT.shadeInset, backgroundColor: color, borderTopWidth: size * MASCOT.shadeInset, borderLeftWidth: size * MASCOT.shadeInset, borderColor: MASCOT.highlight, borderRadius: size * MASCOT.radiusRatio }} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * MASCOT.eyeGap, transform: [{ translateX: size * MASCOT.eyeShift }, { translateY: size * MASCOT.eyeShift }] }}>{[0, 1].map(eye => <View key={eye} style={{ width: size * MASCOT.eyeWidth, height: size * MASCOT.eyeHeight, borderRadius: size, backgroundColor: MASCOT.eye }} />)}</View>
    </Animated.View>
  </View>;
});
