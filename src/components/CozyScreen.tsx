import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { useUI } from './UI';

// Shared cozy screen wrapper: warm dark bg, safe padding. No literals — all from tokens.
export function CozyScreen({ children }: { children: ReactNode }) {
  const styles = useUI(); // Shared theme tokens follow global appearance preferences.
  return <View style={[styles.root, styles.scroll]}>{children}</View>;
}
