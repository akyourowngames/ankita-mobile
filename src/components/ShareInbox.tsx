import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { useComposerFiles } from './ComposerDrafts';
import { Button, Icon, SheetModal, useUI } from './UI';
import { mergeDraftAttachment, saveIncomingEntry, type IncomingEntry } from '../sharing/inbox';
import { dismissPendingIncomingShare, incomingShares, refreshIncomingShares } from '../sharing/platform';

export function ShareInbox() {
  const app = useApp(), t = useTheme(), ui = useUI(), insets = useSafeAreaInsets();
  const [inbox, setInbox] = useState(incomingShares.snapshot()), [visible, setVisible] = useState(false), [error, setError] = useState(''), [working, setWorking] = useState('');
  const [files, setFiles] = useComposerFiles(app.state.activeTeammateId, app.chatId);
  const known = useRef(new Set<string>()), refreshing = useRef(false), actionLock = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try { await refreshIncomingShares(); setError(''); }
    catch (error) { const message = error instanceof Error ? error.message : ''; setError(/^(Your share|The share|The shared)/.test(message) ? message : 'Could not read or store incoming shares. Check device storage, then retry.'); setVisible(true); }
    finally { refreshing.current = false; }
  }, []);
  useEffect(() => incomingShares.subscribe(() => {
    const next = incomingShares.snapshot(); setInbox(next);
    if (next.entries.some(entry => !known.current.has(entry.id))) setVisible(true);
    known.current = new Set(next.entries.map(entry => entry.id));
  }), []);
  useEffect(() => {
    if (!app.ready || !app.state.onboardingDone) return;
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delayed = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') delayed(); });
    const links = Linking.addEventListener('url', delayed);
    const focused = () => delayed();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', focused);
    return () => { subscription.remove(); links.remove(); if (timer) clearTimeout(timer); if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', focused); };
  }, [app.ready, app.state.onboardingDone, refresh]);
  const run = async (entry: IncomingEntry, action: 'save' | 'attach' | 'dismiss' | 'retry') => {
    if (actionLock.current) return;
    actionLock.current = true; setWorking(`${entry.id}:${action}`); setError('');
    try {
      if (action === 'dismiss') await incomingShares.dismiss(entry.id);
      else if (action === 'retry') await incomingShares.retry(entry.id);
      else {
        if (!entry.input) throw new Error('Retry this import before saving or attaching it.');
        const libraryId = `incoming-${entry.id}`;
        const selected = action === 'attach' ? mergeDraftAttachment(files, libraryId) : files;
        // Stable identity recovers safely if the app closes after library commit but before inbox acknowledgement.
        await app.commitAssistant(state => saveIncomingEntry(state, entry, { id: () => libraryId, now: Date.now }).state);
        if (action === 'attach') { setFiles(selected); app.navigate('chat'); }
        await incomingShares.dismiss(entry.id);
      }
      // Dismissed/now-readable native items can finally release the OS pending payload.
      await refresh();
      if (!incomingShares.snapshot().entries.length) setVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setError(/^(Remove|Retry|Document|The share|Your share)/.test(message) ? message : 'Could not finish saving this share. It remains in your inbox; check available storage and retry.');
    } finally { actionLock.current = false; setWorking(''); }
  };
  if (!app.ready || !app.state.onboardingDone || (!inbox.entries.length && !error)) return null;
  return <>
    {!visible && <Pressable accessibilityRole="button" accessibilityLabel={`Review ${inbox.entries.length} incoming shared items`} onPress={() => setVisible(true)} style={[styles.badge, { top: insets.top + 62, backgroundColor: t.elevated, borderColor: t.border }]}><Icon name="download-outline" color={t.accent} small /><Text style={[styles.badgeText, { color: t.text }]}>{inbox.entries.length} shared · Review</Text></Pressable>}
    <SheetModal visible={visible} close={() => { if (!working) setVisible(false); }}>
      <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.heading}><View style={styles.headingText}><Text style={ui.title}>Shared with Ankita</Text><Text style={ui.caption}>Preview first. Save locally or add to your current draft.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Review shares later" disabled={!!working} onPress={() => setVisible(false)} style={styles.close}><Icon name="close" /></Pressable></View>
        <Text style={[ui.caption, styles.notice]}>Nothing is sent until you press Send in chat. Shared content does not create personal memories.</Text>
        {!!error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Button title="Retry incoming shares" secondary onPress={() => void refresh()} disabled={!!working} /><Pressable accessibilityRole="button" accessibilityLabel="Dismiss unimported pending share" disabled={!!working} onPress={() => { dismissPendingIncomingShare(); setError(''); if (!inbox.entries.length) setVisible(false); }} style={styles.textButton}><Text style={[styles.actionText, { color: t.muted }]}>Dismiss unimported pending share</Text></Pressable></View>}
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {inbox.entries.map(entry => <View key={entry.id} style={[styles.card, { backgroundColor: t.elevated, borderColor: t.border }]}>
            <View style={styles.itemHeading}><Icon name={entry.input?.asset?.mimeType.startsWith('image/') ? 'image-outline' : entry.payload.shareType === 'url' ? 'link-outline' : 'document-text-outline'} color={t.accent} /><View style={styles.headingText}><Text style={[ui.label, styles.itemTitle]} numberOfLines={2}>{entry.input?.title || 'Shared item needs attention'}</Text><Text style={ui.caption}>{entry.input?.asset ? `${entry.input.asset.mimeType} · ${Math.ceil(entry.input.asset.bytes / 1024)} KiB` : entry.payload.shareType === 'url' ? 'URL · saved without opening the page' : entry.input ? `${entry.input.content.length.toLocaleString()} characters` : entry.payload.mimeType || entry.payload.shareType}</Text></View></View>
            {entry.input?.asset?.mimeType.startsWith('image/') && <Image accessibilityLabel="Shared image preview" resizeMode="contain" source={{ uri: `data:${entry.input.asset.mimeType};base64,${entry.input.asset.data}` }} style={styles.image} />}
            {!!entry.input?.content && <View style={[styles.preview, { backgroundColor: t.background }]}><ScrollView nestedScrollEnabled><Text selectable style={[styles.previewText, { color: t.text }]}>{entry.input.content}</Text></ScrollView></View>}
            {entry.input?.asset?.mimeType === 'application/pdf' && <Text style={ui.caption}>PDF file · verified file signature. This preview shows file details; pages are not rendered here.</Text>}
            {!!entry.error && <Text accessibilityRole="alert" style={ui.error}>{entry.error}</Text>}
            {!!entry.input && <View style={styles.actions}><Button title="Add to current draft" onPress={() => void run(entry, 'attach')} disabled={!!working} loading={working === `${entry.id}:attach`} /><Button title="Save to library" secondary onPress={() => void run(entry, 'save')} disabled={!!working} loading={working === `${entry.id}:save`} /></View>}
            <View style={styles.footer}>{!entry.input && <Pressable accessibilityRole="button" accessibilityLabel="Retry shared file import" disabled={!!working} onPress={() => void run(entry, 'retry')} style={styles.textButton}><Text style={[styles.actionText, { color: t.accent }]}>Retry import</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${entry.input?.title || 'shared item'}`} disabled={!!working} onPress={() => void run(entry, 'dismiss')} style={styles.textButton}><Text style={[styles.actionText, { color: t.muted }]}>Dismiss</Text></Pressable></View>
          </View>)}
        </ScrollView>
      </View>
    </SheetModal>
  </>;
}
const styles = StyleSheet.create({
  badge: { position: 'absolute', right: 18, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, zIndex: 20, elevation: 8 }, badgeText: { fontSize: 12, fontWeight: '600' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headingText: { flex: 1, gap: 5 }, close: { padding: 10, marginTop: -8, marginRight: -8 }, notice: { lineHeight: 18 },
  list: { gap: 14, paddingBottom: 16 }, card: { padding: 16, borderWidth: 1, borderRadius: 20, gap: 14 }, itemHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, itemTitle: { lineHeight: 21 },
  preview: { maxHeight: 220, padding: 12, borderRadius: 12 }, previewText: { fontSize: 13, lineHeight: 21 }, image: { width: '100%', height: 180, borderRadius: 12 }, actions: { gap: 9 }, footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }, textButton: { paddingVertical: 8, paddingHorizontal: 6, minHeight: 40, justifyContent: 'center' }, actionText: { fontSize: 13, fontWeight: '600' }, errorBox: { gap: 10 },
});
