import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteOutput, editOutput, outputData, type OutputArtifact, type OutputCalendar, type OutputChecklist, type OutputTable } from '../assistant/outputs';
import { ToolFault } from '../assistant/schema';
import { useApp } from '../core/AppContext';
import { makeId } from '../core/state';
import { createOutputDraft, outputDraftChanged, outputSourceChanged, saveOutputDraft, type OutputDraft } from '../outputs/editor';
import { deliverOutput, outputDeliveryLabel } from '../outputs/delivery';
import { outputFormats, outputPlainText, type OutputFormat } from '../outputs/formats';
import { useTheme } from '../theme/Theme';
import { METRICS, RADIUS, SPACING } from '../theme/tokens';
import { MessageBody } from './MessageBody';
import { useModalAnimation } from './Motion';
import { OutputEditor } from './OutputEditor';
import { Button, Header, Icon, IconButton, useUI } from './UI';

const clock = { id: makeId, now: Date.now };
const local = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  content: { padding: SPACING.lg, gap: SPACING.lg, width: '100%', maxWidth: METRICS.contentWidth, alignSelf: 'center' },
  body: { minWidth: 0, maxWidth: '100%', gap: SPACING.md },
  footer: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm, borderTopWidth: METRICS.hairline },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  action: { flex: 1, minWidth: METRICS.previewWidth - SPACING.md },
  panel: { padding: SPACING.md, borderRadius: RADIUS.button, borderWidth: METRICS.hairline, gap: SPACING.md },
  format: { minHeight: METRICS.touch, paddingHorizontal: SPACING.md, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderWidth: METRICS.hairline },
  table: { maxWidth: '100%', minWidth: 0 },
  tableRow: { flexDirection: 'row' },
  cell: { width: METRICS.previewWidth, padding: SPACING.sm, borderWidth: METRICS.hairline },
  heading: { fontWeight: '600' },
  check: { flexDirection: 'row', gap: SPACING.sm, minHeight: METRICS.touch, alignItems: 'center' },
  event: { paddingBottom: SPACING.md, gap: SPACING.sm, borderBottomWidth: METRICS.hairline },
});

function OutputBody({ artifact, busy, toggle }: { artifact: OutputArtifact; busy: boolean; toggle: (index: number) => void }) {
  const s = useUI(), t = useTheme(), data = outputData(artifact);
  if (artifact.kind === 'document') return <MessageBody content={artifact.content} />;
  if (artifact.kind === 'table') {
    const table = data as OutputTable;
    return <View style={local.body}><Text style={s.caption}>Swipe horizontally to see every column.</Text><ScrollView horizontal nestedScrollEnabled style={local.table} accessibilityLabel="Output table"><View>{[table.columns, ...table.rows].map((row, index) => <View key={index} style={local.tableRow}>{row.map((cell, column) => <Text key={column} selectable style={[s.body, local.cell, { borderColor: t.border }, index === 0 && local.heading]}>{cell}</Text>)}</View>)}</View></ScrollView></View>;
  }
  if (artifact.kind === 'checklist') return <View style={local.body}>{(data as OutputChecklist).items.map((item, index) => <Pressable key={index} accessibilityRole="checkbox" accessibilityLabel={item.text} accessibilityState={{ checked: item.checked, disabled: busy }} disabled={busy} onPress={() => toggle(index)} style={local.check}><Icon name={item.checked ? 'checkbox-outline' : 'square-outline'} /><Text style={[s.body, { flex: 1, minWidth: 0 }]}>{item.text}</Text></Pressable>)}</View>;
  if (artifact.kind === 'calendar') return <View style={local.body}>{(data as OutputCalendar).events.map((event, index) => <View key={index} style={[local.event, { borderColor: t.border }]}><Text selectable style={[s.body, local.heading]}>{event.title}</Text><Text selectable style={s.body}>{new Date(event.start).toLocaleString()}{event.end ? ` — ${new Date(event.end).toLocaleString()}` : ''}</Text>{!!event.location && <Text selectable style={s.caption}>{event.location}</Text>}{!!event.description && <Text selectable style={s.body}>{event.description}</Text>}</View>)}</View>;
  return <ScrollView horizontal nestedScrollEnabled style={local.table}><Text selectable style={s.codeText}>{outputPlainText(artifact)}</Text></ScrollView>;
}

export function OutputPreview({ outputId, close }: { outputId: string; close: () => void }) {
  const app = useApp(), s = useUI(), t = useTheme(), animation = useModalAnimation(true, 'slide');
  const artifact = app.state.assistant.artifacts.find(item => item.id === outputId);
  const [draft, setDraft] = useState<OutputDraft | null>(null), [exporting, setExporting] = useState(false), [options, setOptions] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [discard, setDiscard] = useState<'close' | 'edit' | null>(null);
  const [selectedFormat, setFormat] = useState<OutputFormat | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const running = useRef(false), scroll = useRef<ScrollView>(null);
  const formats = artifact ? outputFormats(artifact) : [], format = selectedFormat && formats.includes(selectedFormat) ? selectedFormat : formats[0];
  const conflict = !!(draft && artifact && outputSourceChanged(draft.original, artifact));
  const run = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (reason) {
      setError(reason instanceof ToolFault ? reason.message : reason instanceof Error && /^(This browser|File sharing|The output file)/.test(reason.message) ? reason.message : 'Could not complete this action. Check device storage and try again. Your edits are still here.');
    } finally { running.current = false; setBusy(false); }
  };
  const finishExit = (target: 'close' | 'edit') => { setDiscard(null); setDraft(null); setError(''); if (target === 'close') close(); };
  const requestExit = (target: 'close' | 'edit') => { if (running.current) return; if (draft && outputDraftChanged(draft)) setDiscard(target); else finishExit(target); };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); requestExit('close'); } };
    // Capture the same keyup event RN Web uses, so closing this modal cannot
    // also dismiss an underlying sheet or bypass the unsaved-draft guard.
    window.addEventListener('keyup', escape, true);
    return () => window.removeEventListener('keyup', escape, true);
  });
  const save = () => { if (!draft) return; void run(async () => { await app.commitAssistant(state => ({ ...state, artifacts: saveOutputDraft(state.artifacts, draft, clock).artifacts })); setDraft(null); setNotice('Changes saved.'); }); };
  const toggle = (index: number) => void run(async () => { await app.commitAssistant(state => {
    const current = state.artifacts.find(item => item.id === outputId);
    if (!current || current.kind !== 'checklist') throw new ToolFault('not_found', 'This checklist is no longer available.');
    if (!artifact || outputSourceChanged(artifact, current)) throw new ToolFault('invalid_arguments', 'This checklist changed. Review its latest items and try again.');
    const data = outputData(current) as OutputChecklist;
    return { ...state, artifacts: editOutput(state.artifacts, current.id, { content: JSON.stringify({ items: data.items.map((item, i) => i === index ? { ...item, checked: !item.checked } : item) }) }, clock).artifacts };
  }); });
  const reveal = (target: 'export' | 'options') => { if (target === 'export') { setExporting(!exporting); setOptions(false); } else { setOptions(!options); setExporting(false); } setConfirmDelete(false); setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0); };

  return <Modal visible animationType={animation} presentationStyle="fullScreen" onRequestClose={() => requestExit('close')}><SafeAreaView accessibilityViewIsModal style={[local.root, { backgroundColor: t.background }]} edges={['top', 'bottom', 'left', 'right']}><KeyboardAvoidingView style={local.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Header title={draft ? 'Edit output' : artifact?.title ?? 'Output unavailable'} right={<View style={s.hstack}>{!draft && artifact && <IconButton name="ellipsis-horizontal" label="Output options" disabled={busy} onPress={() => reveal('options')} />}<IconButton name="close" label="Close output" disabled={busy} onPress={() => requestExit('close')} /></View>} />
    {discard && <View style={[local.panel, { marginHorizontal: SPACING.md, borderColor: t.border, backgroundColor: t.surface }]}><Text accessibilityRole="alert" style={s.body}>Discard your unsaved changes?</Text><Button title="Discard changes" secondary onPress={() => finishExit(discard)} /><Button title="Keep editing" onPress={() => setDiscard(null)} /></View>}
    <ScrollView ref={scroll} style={local.root} contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
      {!artifact ? <Text accessibilityRole="alert" style={s.body}>This output was deleted. Close this preview to return to your work.</Text> : <>
        {conflict && <Text accessibilityRole="alert" style={s.error}>This output changed while you were editing. Cancel to review its latest version. Your draft is still here.</Text>}
        {draft ? <OutputEditor draft={draft} onChange={value => { if (!running.current) { setDraft(value); setError(''); } }} busy={busy} /> : <OutputBody artifact={artifact} busy={busy} toggle={toggle} />}
        {!draft && exporting && <View style={[local.panel, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Text style={s.fieldLabel}>File format</Text><View style={local.actions}>{formats.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Export as ${value.toUpperCase()}`} accessibilityState={{ selected: value === format, disabled: busy }} disabled={busy} onPress={() => setFormat(value)} style={[local.format, { borderColor: value === format ? t.accent : t.border, backgroundColor: value === format ? t.elevated : t.surface }]}><Text style={s.caption}>{value.toUpperCase()}</Text></Pressable>)}</View>
          <Button title={outputDeliveryLabel} loading={busy} onPress={() => void run(async () => setNotice(await deliverOutput(artifact, format)))} />
          {Platform.OS === 'web' && <Button title="Share file" secondary disabled={busy} onPress={() => void run(async () => setNotice(await deliverOutput(artifact, format, true)))} />}
        </View>}
        {!draft && options && <View style={[local.panel, { borderColor: t.border, backgroundColor: t.surface }]}>{confirmDelete ? <><Text style={s.body}>Delete this output? Files you already saved will remain.</Text><Button title="Delete output permanently" secondary disabled={busy} onPress={() => void run(async () => { await app.commitAssistant(state => ({ ...state, artifacts: deleteOutput(state.artifacts, outputId) })); close(); })} /><Button title="Keep output" secondary disabled={busy} onPress={() => setConfirmDelete(false)} /></> : <Button title="Delete output" secondary disabled={busy} onPress={() => setConfirmDelete(true)} />}</View>}
      </>}
    </ScrollView>
    <View style={[local.footer, { borderColor: t.border }]}>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice && <Text accessibilityLiveRegion="polite" style={s.caption}>{notice}</Text>}
      {artifact && !discard && <View style={local.actions}>{draft ? <><View style={local.action}><Button title="Save output changes" loading={busy} disabled={conflict} onPress={save} /></View><View style={local.action}><Button title="Cancel editing" secondary disabled={busy} onPress={() => requestExit('edit')} /></View></> : <><View style={local.action}><Button title="Edit output" secondary disabled={busy} onPress={() => { setDraft(createOutputDraft(artifact)); setExporting(false); setOptions(false); setError(''); setNotice(''); scroll.current?.scrollTo({ y: 0, animated: false }); }} /></View><View style={local.action}><Button title="Save / Share" disabled={busy} onPress={() => reveal('export')} /></View></>}</View>}
    </View>
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}
