import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { useWork } from '../work/WorkContext';
import { isWorkTerminal, type WorkStatus } from '../work/records';
import { useTheme } from '../theme/Theme';
import { METRICS, RADIUS, SPACING } from '../theme/tokens';
import { Button, Icon, useUI } from './UI';
import { OutputCard } from './OutputCard';

const statusText: Record<WorkStatus, string> = { queued: 'Queued', running: 'Working', interrupted: 'Needs your attention', completed: 'Completed', failed: 'Could not finish', cancelled: 'Cancelled' };
const local = StyleSheet.create({ card: { borderWidth: METRICS.hairline, borderRadius: RADIUS.button, padding: SPACING.md, gap: SPACING.md }, heading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: METRICS.touch }, title: { fontWeight: '600' }, status: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs }, result: { paddingTop: SPACING.sm, borderTopWidth: METRICS.hairline, gap: SPACING.md }, compact: { gap: SPACING.xs }, compactRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm }, compactHeading: { flexGrow: 1, flexShrink: 1, flexBasis: '70%', minHeight: METRICS.touch, paddingVertical: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, compactCopy: { flex: 1, flexShrink: 1 }, compactAction: { minHeight: METRICS.touch, justifyContent: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm } });
export function WorkCard({ id, compact = false }: { id: string; compact?: boolean }) {
  const app = useApp(), work = useWork(), theme = useTheme(), s = useUI();
  const job = app.state.work.jobs.find(item => item.id === id);
  const [expanded, setExpanded] = useState(work.selectedId === id), [removing, setRemoving] = useState(false), [acting, setActing] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (work.selectedId === id) setExpanded(true); }, [work.selectedId, id]);
  if (!job) return null;
  const connected = app.state.work.connection.enabled;
  const attention = job.status === 'failed' || job.status === 'interrupted';
  const color = attention ? theme.danger : job.status === 'completed' ? theme.success : theme.muted;
  const action = async (operation: () => Promise<void>) => { setActing(true); setError(''); try { await operation(); } catch { setError('This work could not be updated. Check the worker connection and try again.'); } finally { setActing(false); } };
  const disabled = acting || work.pending;
  if (compact) {
    const canCancel = job.status === 'queued' || job.status === 'running';
    const actionDisabled = disabled || !connected || !!job.cancelRequested;
    const status = job.cancelRequested ? 'Cancellation pending' : job.status === 'queued' && !job.submitted ? 'Waiting to submit' : job.status === 'completed' && !job.delivered ? 'Result ready on worker' : statusText[job.status];
    return <View style={local.compact}>
      <View style={local.compactRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View work: ${job.title}`} accessibilityHint={`${status}. Open Persistent work to manage this request.`} onPress={() => work.open(id)} style={({ pressed }) => [local.compactHeading, pressed && s.navigationPressed]}>
          <Icon small name={job.status === 'completed' ? 'checkmark-circle-outline' : attention ? 'alert-circle-outline' : 'time-outline'} color={color} />
          <Text style={[s.caption, local.compactCopy]}>{job.title} · {status}</Text><Icon small name="chevron-forward" color={theme.muted} />
        </Pressable>
        {(canCancel || attention) && <Pressable accessibilityRole="button" accessibilityLabel={job.cancelRequested ? 'Cancellation pending' : canCancel ? 'Cancel work' : 'Resume work'} accessibilityState={{ disabled: actionDisabled, busy: acting }} disabled={actionDisabled} onPress={() => void action(() => canCancel ? work.cancel(id) : work.resume(id))} style={({ pressed }) => [local.compactAction, { opacity: actionDisabled ? METRICS.disabledOpacity : pressed ? METRICS.opacityPressed : 1 }]}><Text style={s.caption}>{acting ? 'Updating…' : job.cancelRequested ? 'Cancellation pending' : canCancel ? 'Cancel' : 'Resume'}</Text></Pressable>}
      </View>
      {job.cancelRequested && <Text style={s.caption}>Cancellation requested. Waiting for the worker to confirm it has stopped.</Text>}
      {!!job.lastConnectionError && <Text accessibilityRole="alert" style={s.error}>{job.lastConnectionError}</Text>}
      {!!job.error && <Text accessibilityRole="alert" style={s.error}>{job.error}</Text>}
      {!connected && !isWorkTerminal(job.status) && <Text style={s.caption}>Connect your worker in Persistent work to manage this request.</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>;
  }
  return <View style={[local.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'View'} work: ${job.title}`} accessibilityState={{ expanded }} style={local.heading} onPress={() => { if (!expanded) work.open(id); setExpanded(!expanded); }}>
      <Icon name={job.status === 'completed' ? 'checkmark-circle-outline' : attention ? 'alert-circle-outline' : 'time-outline'} color={color} small />
      <View style={s.flex}><Text style={[s.body, local.title]}>{job.title}</Text><Text style={s.tiny}>{new Date(job.updatedAt).toLocaleString()}</Text></View><Icon name={expanded ? 'chevron-up' : 'chevron-down'} small color={theme.muted} />
    </Pressable>
    <View style={[local.status, { backgroundColor: theme.elevated }]}><Text style={[s.caption, { color }]}>{statusText[job.status]}{job.status === 'queued' && !job.submitted ? ' · waiting to submit' : ''}</Text></View>
    {!!job.progress && <Text style={s.caption}>{job.progress}</Text>}
    {job.cancelRequested && <Text style={s.caption}>Cancellation requested. Reconnect to confirm the worker has stopped this request.</Text>}
    {!!job.lastConnectionError && <Text style={s.error}>{job.lastConnectionError}</Text>}
    {job.status === 'interrupted' && <Text style={s.caption}>The worker stopped before finishing. Resume from its saved checkpoint when the worker is available.</Text>}
    {job.status === 'completed' && !job.delivered && <Text style={s.caption}>The result is ready on the worker. Refresh to save it on this device.</Text>}
    {expanded && <View style={[local.result, { borderColor: theme.border }]}>
      <Text style={s.fieldLabel}>Request</Text><Text selectable style={s.body}>{job.request.prompt}</Text>
      {!!job.error && <Text accessibilityRole="alert" style={s.error}>{job.error}</Text>}
      {!!job.reply && <><Text style={s.fieldLabel}>Result</Text><Text selectable style={s.body}>{job.reply}</Text></>}
      {job.artifacts.map(item => { const saved = app.state.assistant.artifacts.find(artifact => artifact.id === item.id); return saved ? <OutputCard key={item.id} artifact={saved} /> : <Text key={item.id} style={s.caption}>{job.delivered ? 'This output has been removed from Finished outputs.' : 'This output is waiting to be saved on this device.'}</Text>; })}
      {app.state.conversations.some(chat => chat.id === job.conversationId) && <Button title="Open conversation" secondary disabled={disabled} onPress={() => app.openChat(job.conversationId)} />}
    </View>}
    {(job.status === 'queued' || job.status === 'running') && <Button title={job.cancelRequested ? 'Cancellation pending' : 'Cancel work'} secondary disabled={disabled || !connected || job.cancelRequested} loading={acting} onPress={() => void action(() => work.cancel(id))} />}
    {attention && <Button title="Resume work" secondary disabled={disabled || !connected || job.cancelRequested} loading={acting} onPress={() => void action(() => work.resume(id))} />}
    {!connected && !isWorkTerminal(job.status) && <Text style={s.caption}>Connect your worker in Persistent work to manage this request.</Text>}
    {isWorkTerminal(job.status) && (removing ? <><Text style={s.caption}>Remove this work record from the worker and this device? Its conversation and saved outputs remain available.</Text><Button title="Remove work record" secondary disabled={disabled || !connected} onPress={() => void action(() => work.remove(id))} /><Button title="Keep work record" secondary disabled={disabled} onPress={() => setRemoving(false)} /></> : <Button title="Remove work" secondary disabled={disabled} onPress={() => setRemoving(true)} />)}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
