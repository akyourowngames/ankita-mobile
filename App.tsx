import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { MotionProvider, Scene } from './src/components/Motion';
import { ComposerDraftProvider } from './src/components/ComposerDrafts';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Linking, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppProvider, useApp, type Screen } from './src/core/AppContext';
import { ThemeProvider, useTheme } from './src/theme/Theme';
import { Button, useUI } from './src/components/UI';
import { ChatScreen } from './src/screens/ChatScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ProvidersScreen } from './src/screens/ProvidersScreen';
import { TeammatesScreen } from './src/screens/TeammatesScreen';
import { PluginsScreen } from './src/screens/PluginsScreen';
import { AssistantScreen, MemoryScreen, TasksScreen, LibraryScreen, ToolsScreen } from './src/screens/AssistantScreen';
import { ApprovalSheet } from './src/components/AssistantActivity';
import { WorkspaceNavigation } from './src/components/WorkspaceNavigation';
import { ShareInbox } from './src/components/ShareInbox';
import { OutputLibrary } from './src/components/OutputLibrary';
import { OutputPreviewProvider } from './src/components/OutputPreviewHost';
import { WorkProvider } from './src/work/WorkContext';
import { WorkScreen } from './src/screens/WorkScreen';
import { AboutScreen, AppearanceScreen, BehaviorScreen, PrivacyScreen, ProfileScreen, SettingsScreen } from './src/screens/SettingsScreen';
import { DesktopPairingScreen } from './src/screens/DesktopPairingScreen';
import { parsePairingLink } from './src/assistant/pairingProtocol';

// Android hardware back target for each nested screen. Chat remains the root.
const SCREEN_PARENT: Partial<Record<Screen, Screen>> = { settings: 'chat', history: 'chat', assistant: 'settings', memory: 'assistant', tasks: 'assistant', library: 'assistant', tools: 'assistant', work: 'settings', outputs: 'settings', desktop: 'settings' };

export default function App() {
  return <SafeAreaProvider><AppProvider><MotionProvider><ComposerDraftProvider><ThemedApp /></ComposerDraftProvider></MotionProvider></AppProvider></SafeAreaProvider>;
}
function ThemedApp() { const app = useApp(); return <ThemeProvider settings={app.state.settings}><WorkProvider><OutputPreviewProvider><Shell /></OutputPreviewProvider></WorkProvider></ThemeProvider>; }
function Shell() {
  const app = useApp(), t = useTheme(), s = useUI();
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (app.screen === 'chat') return false; app.navigate(SCREEN_PARENT[app.screen] || 'settings'); return true; }); return () => sub.remove(); }, [app.screen]);
  useEffect(() => {
    const accept = (url: string | null) => { if (url && parsePairingLink(url)) { app.setPairingLink(url); app.navigate('desktop'); } };
    void Linking.getInitialURL().then(accept).catch(() => {});
    const subscription = Linking.addEventListener('url', event => accept(event.url));
    return () => subscription.remove();
  }, [app.setPairingLink, app.navigate]);
  const screens: Record<Screen, React.ReactNode> = { chat: <ChatScreen />, history: <HistoryScreen />, settings: <SettingsScreen />, providers: <ProvidersScreen />, appearance: <AppearanceScreen />, profile: <ProfileScreen />, behavior: <BehaviorScreen />, privacy: <PrivacyScreen />, about: <AboutScreen />, teammates: <TeammatesScreen />, plugins: <PluginsScreen />, assistant: <AssistantScreen />, memory: <MemoryScreen />, tasks: <TasksScreen />, library: <LibraryScreen />, tools: <ToolsScreen />, work: <WorkScreen />, outputs: <OutputLibrary />, desktop: <DesktopPairingScreen /> };
  return <SafeAreaView style={s.root}><StatusBar style={t.dark ? 'light' : 'dark'} /><View style={s.frame}>{!app.ready ? <View style={s.empty}>{app.loadError ? <><Text style={s.title}>Let’s get you back in.</Text><Text style={s.error}>{app.loadError}</Text><Button title="Try again" onPress={app.retryLoad} /><Button title="Reset local data" secondary onPress={() => void app.reset()} /></> : <ActivityIndicator color={t.accent} />}</View> : !app.state.onboardingDone && app.screen === 'chat' ? <OnboardingScreen /> : <WorkspaceNavigation><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' && app.screen !== 'chat' ? 'padding' : undefined}><Scene scene={app.screen}><View style={[s.flex, app.screen !== 'chat' && s.pageFrame]}>{screens[app.screen]}</View></Scene></KeyboardAvoidingView></WorkspaceNavigation>}{!!app.storageError && <View style={s.notice}><Text style={s.error}>{app.storageError}</Text></View>}<ApprovalSheet /><ShareInbox /></View></SafeAreaView>;
}
