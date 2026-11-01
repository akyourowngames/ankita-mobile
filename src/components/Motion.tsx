import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { MOTION } from '../theme/tokens';
const MotionContext = createContext(true);
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { let mounted = true; void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }); const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced); const lifecycle = AppState.addEventListener('change', state => setActive(state === 'active')); return () => { mounted = false; listener.remove(); lifecycle.remove(); }; }, []);
  return <MotionContext.Provider value={reduced || !active}>{children}</MotionContext.Provider>;
}
export const useReducedMotion = () => useContext(MotionContext);
// Keep a presentation's animation stable through dismissal. Changing RN Web's
// animationType during an exit cancels animationend and can strand its overlay.
// Read the current accessibility preference again for the next presentation.
export function useModalAnimation(visible: boolean, kind: 'slide' | 'fade') {
  const reduced = useReducedMotion();
  const [presentation, setPresentation] = useState<{ visible: boolean; animation: 'none' | 'slide' | 'fade' }>({ visible, animation: reduced ? 'none' : kind });
  if (presentation.visible !== visible) setPresentation({ visible, animation: visible ? reduced ? 'none' : kind : presentation.animation });
  return presentation.animation;
}
export function Scene({ children, scene }: { children: ReactNode; scene: string }) {
  const opacity = useRef(new Animated.Value(1)).current, reduced = useReducedMotion();
  useEffect(() => { opacity.setValue(reduced ? 1 : 0); const animation = Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : MOTION.durationMs, useNativeDriver: Platform.OS !== 'web' }); animation.start(); return () => animation.stop(); }, [scene, reduced]);
  return <Animated.View style={{ flex: 1, minHeight: 0, opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [MOTION.screenOffset, 0] }) }] }}>{children}</Animated.View>;
}
export function Tactile({ children, style, ...props }: Omit<PressableProps, 'children' | 'style'> & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current, reduced = useReducedMotion();
  useEffect(() => () => scale.stopAnimation(), [scale]);
  const animate = (value: number) => Animated.timing(scale, { toValue: value, duration: reduced ? 0 : MOTION.durationMs, useNativeDriver: Platform.OS !== 'web' }).start();
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable {...props} style={style} onPressIn={() => animate(MOTION.pressScale)} onPressOut={() => animate(1)}>{children}</Pressable></Animated.View>;
}
