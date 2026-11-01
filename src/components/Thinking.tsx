import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useTheme } from '../theme/Theme';
import { MOTION, SPACING } from '../theme/tokens';
import { useReducedMotion } from './Motion';
import { useUI } from './UI';
export function Thinking({ label = 'Thinking', writing = false }: { label?: string; writing?: boolean }) {
  const t = useTheme(), s = useUI(), reduced = useReducedMotion(), opacity = useRef(new Animated.Value(1)).current;
  const reveal = useRef(new Animated.Value(1)).current;
  useEffect(() => { reveal.setValue(reduced ? 1 : 0); const animation = Animated.timing(reveal, { toValue: 1, duration: reduced ? 0 : MOTION.durationMs, useNativeDriver: Platform.OS !== 'web' }); animation.start(); return () => animation.stop(); }, [label, reduced, reveal]);
  useEffect(() => {
    if (reduced) { opacity.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 0.35, duration: MOTION.thinkingMs, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(opacity, { toValue: 1, duration: MOTION.thinkingMs, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => animation.stop();
  }, [reduced]);
  return <Animated.View accessibilityLabel={label} accessibilityLiveRegion="polite" style={[s.activity, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [MOTION.screenOffset, 0] }) }] }]}><Animated.View style={[s.hstack, { opacity }]}>{(writing ? [0] : [0, 1, 2]).map(index => <View key={index} style={{ width: MOTION.dotSize, height: MOTION.dotSize, borderRadius: MOTION.dotSize, backgroundColor: t.accent }} />)}</Animated.View><Text numberOfLines={2} style={[s.caption, s.flex]}>{label}</Text></Animated.View>;
}
