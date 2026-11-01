import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HistoryScreen } from '../screens/HistoryScreen';
import { useApp } from '../core/AppContext';
import { METRICS } from '../theme/tokens';
import { useUI } from './UI';
import { useModalAnimation } from './Motion';

const NavigationContext = createContext({ wide: false, open: () => {} });
export const useWorkspaceNavigation = () => useContext(NavigationContext);

export function WorkspaceNavigation({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions(), app = useApp(), s = useUI();
  const wide = width >= METRICS.navigationBreakpoint;
  const [visible, setVisible] = useState(false);
  const animation = useModalAnimation(visible && !wide, 'fade');
  const close = () => setVisible(false);
  useEffect(() => { setVisible(false); }, [wide, app.screen]);
  useEffect(() => { if (Platform.OS !== 'web' || !visible || wide) return; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setVisible(false); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [visible, wide]);
  return <NavigationContext.Provider value={{ wide, open: () => { Keyboard.dismiss(); setVisible(true); } }}>
    <View style={s.workspace}>
      {wide && <View role="navigation" accessibilityLabel="Conversation history" style={s.navigationRail}><HistoryScreen drawer /></View>}
      <View role="main" style={s.workspaceMain}>{children}</View>
    </View>
    <Modal visible={visible && !wide} transparent animationType={animation} onRequestClose={close}>
      <View style={s.drawerOverlay}>
        <SafeAreaView role="navigation" accessibilityLabel="Conversation history" style={s.drawer}><HistoryScreen drawer onClose={close} /></SafeAreaView>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sidebar" style={s.flex} onPress={close} />
      </View>
    </Modal>
  </NavigationContext.Provider>;
}
