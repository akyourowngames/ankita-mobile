import React, { useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useTheme } from '../theme/Theme';
import { GLASS, MOTION } from '../theme/tokens';
export function Glass({ children, style, contentStyle }: { children: ReactNode; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const theme = useTheme(), target = useRef<View | null>(null);
  return <View style={[style, { overflow: 'hidden' }]}><BlurTargetView ref={target} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}><View style={[StyleSheet.absoluteFill, { backgroundColor: theme.accent, opacity: 0.08 }]} /></BlurTargetView><BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" tint={theme.dark ? 'dark' : 'light'} intensity={MOTION.blurIntensity} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} /><View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', backgroundColor: GLASS[theme.dark ? 'dark' : 'light'] }]} /><View style={[contentStyle, { position: 'relative', zIndex: 1 }]}>{children}</View></View>;
}
