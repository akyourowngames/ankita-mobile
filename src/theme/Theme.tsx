import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { Settings } from '../core/state';
import { ACCENTS, PALETTES } from './tokens';

export type Theme = { background: string; surface: string; elevated: string; text: string; muted: string; border: string; inverse: string; success: string; danger: string; overlay: string; navigation: string; accent: string; dark: boolean; large: boolean };
const ThemeContext = createContext<Theme>({ ...PALETTES.dark, accent: ACCENTS.lavender.dark, dark: true, large: false });
export function ThemeProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const system = useColorScheme();
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && system !== 'light');
  const theme = useMemo(() => ({ ...PALETTES[dark ? 'dark' : 'light'], accent: ACCENTS[settings.accent][dark ? 'dark' : 'light'], dark, large: settings.textSize === 'large' }), [dark, settings.accent, settings.textSize]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
