import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { useWork } from '../work/WorkContext';
import { WorkCard } from '../components/WorkCard';
import { Button, Field, Group, Header, Icon, Row, Section, useUI } from '../components/UI';
import { useTheme } from '../theme/Theme';
import { METRICS, RADIUS, SPACING } from '../theme/tokens';
import type { WorkNotice } from '../work/records';

const local = StyleSheet.create({ hero: { gap: SPACING.sm }, connection: { padding: SPACING.md, gap: SPACING.md, borderWidth: METRICS.hairline, borderRadius: RADIUS.button }, status: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, notice: { gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.button, borderWidth: METRICS.hairline } });
const noticeLabel = (notice: WorkNotice) => ({ pending: 'Delivery pending', sending: 'Delivery request in progress', unknown: 'Delivery result unknown', scheduled: 'Local alert scheduled', push: 'Push delivery handed to worker', disabled: 'Alerts disabled', failed: 'Alert delivery failed' }[notice.delivery]);
export function WorkScreen() {
  const app = useApp(), work = useWork(), theme = useTheme(), s = useUI(), state = app.state.work;
  const scroll = useRef<ScrollView>(null);
  const [base, setBase] = useState(state.connection.baseUrl), [key, setKey] = useState(''), [projectId, setProjectId] = useState(state.notifications.projectId), [localPending, setLocalPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => setBase(state.connection.baseUrl), [state.connection.baseUrl]);
  useEffect(() => setProjectId(state.notifications.projectId), [state.notifications.projectId]);
  useEffect(() => { if (work.selectedId) scroll.current?.scrollTo({ y: 0, animated: true }); }, [work.selectedId]);
  const busy = work.pending || localPending;
  const run = async (operation: () => Promise<void>, success = '') => { setLocalPending(true); setError(''); setNotice(''); try { await operation(); if (success) setNotice(success); } catch { setError('This action could not be completed. Check the worker address, pairing key and network, then try again.'); } finally { setLocalPending(false); } };
  const unread = state.notices.filter(item => !item.read).length;
  const selected = state.jobs.find(job => job.id === work.selectedId);
  return <View style={s.flex}><Header title="Persistent work" back={() => app.navigate('settings')} /><ScrollView ref={scroll} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={local.hero}><Text style={s.title}>Pick it up when it is ready.</Text><Text style={s.secondary}>Queue research and finished files on a trusted PC or server, then return to the result here.</Text><Text style={s.caption}>The worker must stay running and reachable. Your phone alone cannot keep AI work running after the app is suspended.</Text></View>
    {selected && <Section title="Selected work"><WorkCard key={selected.id} id={selected.id} /></Section>}
    <Section title="Your worker"><View style={[local.connection, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={local.status}><Icon name={state.connection.enabled ? 'link-outline' : 'unlink-outline'} small color={state.connection.enabled ? theme.success : theme.muted} /><Text style={s.body}>{state.connection.enabled ? 'Paired worker' : 'Connect a worker'}</Text></View>
      <Text style={s.caption}>Start the included worker on your PC or trusted server, then enter its address and pairing key. {Platform.OS === 'web' ? 'The key stays in this browser tab session.' : 'The key is kept in this device’s secure storage.'} Only pair a machine you trust with your prompts, selected files and AI provider credentials.</Text>
      <Field label="Worker address" value={base} onChangeText={setBase} placeholder="https://your-worker.example" autoCapitalize="none" keyboardType="url" textContentType="URL" maxLength={2000} editable={!busy} />
      <Field label="Pairing key" value={key} onChangeText={setKey} placeholder={state.connection.enabled ? 'Enter key to pair again' : 'Paste your worker pairing key'} secureTextEntry autoCapitalize="none" autoComplete="off" textContentType="password" maxLength={1000} editable={!busy} />
      <Button title={state.connection.enabled ? 'Test and pair worker' : 'Connect worker'} loading={localPending} disabled={busy || !base.trim() || !key.trim()} onPress={() => void run(async () => { await work.connect(base.trim(), key.trim()); setKey(''); }, 'Worker connection checked and pairing saved.')} />
      {state.connection.enabled && <><Button title="Refresh work" secondary disabled={busy} onPress={() => void run(work.refresh)} /><Button title="Disconnect worker" secondary disabled={busy} onPress={() => void run(work.disconnect, 'Worker disconnected. Saved work records remain on this device.')} /></>}
      <Text style={s.caption}>Disconnecting preserves saved jobs. Reconnect to the same worker to recover work that continued there.</Text>
    </View></Section>
    <Section title="Completion alerts"><Group><Row title="Completion notifications" subtitle={Platform.OS === 'web' ? 'Available in the installed phone app. Your notification inbox works here.' : 'Request permission when switching on. Notification text hides the request and result.'} right={<Switch accessibilityLabel="Completion notifications" value={state.notifications.enabled} disabled={busy || (Platform.OS === 'web' && !state.notifications.enabled)} onValueChange={enabled => void run(() => work.enableNotifications(enabled))} trackColor={{ true: theme.accent }} />} /></Group>
      {state.notifications.revokePending && <Text style={s.error}>Push revocation is waiting for the worker to reconnect. Local alerts are off; remote alerts may still arrive until revocation succeeds.</Text>}
      <Text style={s.caption}>{Platform.OS === 'web' ? 'Background browser notification delivery is unavailable. Reopen this page and refresh to see updates in the inbox.' : 'Local alerts can appear after this app reconnects. To receive pushes while it is closed, register a real Expo project configured for this app.'}</Text>
      {Platform.OS !== 'web' && <View style={s.gap}><Field label="Expo project ID" value={projectId} onChangeText={setProjectId} placeholder="Project UUID" autoCapitalize="none" autoCorrect={false} maxLength={120} editable={!busy} /><Button title={state.notifications.registered ? 'Update push registration' : 'Register background push'} secondary disabled={busy || !state.notifications.enabled || !state.connection.enabled || !projectId.trim()} onPress={() => void run(() => work.registerPush(projectId.trim()))} /><Text style={s.caption}>{state.notifications.registered ? 'A push token is registered with this worker. Actual delivery still depends on platform credentials, device permission and the push service.' : 'Push is not registered. No background device delivery is promised.'}</Text></View>}
      <Button title="Test notification" secondary disabled={busy || !state.notifications.enabled || Platform.OS === 'web'} onPress={() => void run(work.testNotification, 'Notification test requested. Check this device; service acceptance does not confirm display.')} />
    </Section>
    {(!!error || !!work.error) && <Text accessibilityRole="alert" style={s.error}>{work.error || error}</Text>}{!!notice && <Text accessibilityLiveRegion="polite" style={s.caption}>{notice}</Text>}
    <Section title={`Your work · ${state.jobs.length}`}>{!state.jobs.length ? <View style={s.notice}><Text style={s.body}>Ready for your next request</Text><Text style={s.caption}>Write a request in chat and choose Run persistent work. You will review what is sent before it starts.</Text></View> : state.jobs.filter(job => job.id !== selected?.id).map(job => <WorkCard key={job.id} id={job.id} />)}{selected && state.jobs.length === 1 && <Text style={s.caption}>Your selected request is shown above.</Text>}</Section>
    <Section title={`Notification inbox${unread ? ` · ${unread} unread` : ''}`}>{!state.notices.length && <Text style={s.caption}>Completed work will appear here, including any delivery errors.</Text>}{state.notices.map(item => {
      const jobExists = state.jobs.some(job => job.id === item.workId);
      return <View key={item.id} style={[local.notice, { backgroundColor: item.read ? theme.surface : theme.elevated, borderColor: theme.border }]}><Text style={s.body}>{item.title}{item.read ? '' : ' · Unread'}</Text><Text style={s.caption}>{new Date(item.createdAt).toLocaleString()} · {noticeLabel(item)}</Text>{!!item.error && <Text style={s.error}>{item.error}</Text>}{jobExists ? <Button title="View work" secondary disabled={busy} onPress={() => { work.open(item.workId); scroll.current?.scrollTo({ y: 0, animated: true }); if (!item.read) void run(() => work.markRead(item.id)); }} /> : <Text style={s.caption}>This work record is no longer on this device.</Text>}{!item.read && <Button title="Mark as read" secondary disabled={busy} onPress={() => void run(() => work.markRead(item.id))} />}</View>;
    })}</Section>
  </ScrollView></View>;
}
