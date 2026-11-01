import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OUTPUT_LIMITS, type OutputCalendar } from '../assistant/outputs';
import { changeOutputList, resizeOutputTable, type OutputDraft } from '../outputs/editor';
import { FONT_SIZE, METRICS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { useTheme } from '../theme/Theme';
import { DuePicker } from './DuePicker';
import { Button, Field, Icon, useUI } from './UI';

const local = StyleSheet.create({
  section: { gap: SPACING.md, minWidth: 0 },
  card: { padding: SPACING.md, gap: SPACING.sm, borderWidth: METRICS.hairline, borderRadius: RADIUS.button },
  table: { gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  cell: { width: METRICS.previewWidth, gap: SPACING.xs },
  text: { minHeight: METRICS.previewHeight, textAlignVertical: 'top' },
  code: { fontFamily: TYPE.code, fontSize: FONT_SIZE.caption },
  check: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: METRICS.touch },
});

export function OutputEditor({ draft, onChange, busy }: { draft: OutputDraft; onChange: (draft: OutputDraft) => void; busy: boolean }) {
  const s = useUI(), t = useTheme();
  const eventField = (index: number, patch: Partial<OutputCalendar['events'][number]>) => {
    if (draft.kind !== 'calendar') return;
    onChange({ ...draft, data: { events: draft.data.events.map((event, i) => {
      if (i !== index) return event;
      const next = { ...event, ...patch };
      if (next.end === undefined) delete next.end;
      return next;
    }) } });
  };
  return <View style={local.section}>
    <Field label="Output title" value={draft.title} onChangeText={title => onChange({ ...draft, title })} maxLength={OUTPUT_LIMITS.titleChars} editable={!busy} />
    {'text' in draft && <Field label={draft.kind === 'json' ? 'JSON content' : 'Output text'} value={draft.text} onChangeText={text => onChange({ ...draft, text })} multiline maxLength={OUTPUT_LIMITS.contentChars} style={[local.text, draft.kind === 'json' && local.code]} editable={!busy} />}
    {draft.kind === 'table' && <>
      <Text style={s.caption}>Edit headers and cells. Swipe horizontally to reach more columns.</Text>
      <ScrollView horizontal nestedScrollEnabled accessibilityLabel="Table editor" style={{ maxWidth: '100%' }}><View style={local.table}>
        <View style={local.row}>{draft.data.columns.map((column, index) => <View key={index} style={local.cell}>
          <Field label={`Column ${index + 1} heading`} value={column} editable={!busy} maxLength={OUTPUT_LIMITS.cellChars} onChangeText={value => onChange({ ...draft, data: { ...draft.data, columns: draft.data.columns.map((text, i) => i === index ? value : text) } })} />
          <Button title={`Remove column ${index + 1}`} secondary disabled={busy || draft.data.columns.length <= 1} onPress={() => onChange({ ...draft, data: resizeOutputTable(draft.data, 'remove-column', index) })} />
        </View>)}</View>
        {draft.data.rows.map((row, rowIndex) => <View key={rowIndex} style={local.row}>{row.map((cell, columnIndex) => <View key={columnIndex} style={local.cell}><Field label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`} value={cell} multiline editable={!busy} maxLength={OUTPUT_LIMITS.cellChars} onChangeText={value => onChange({ ...draft, data: { ...draft.data, rows: draft.data.rows.map((cells, i) => i === rowIndex ? cells.map((text, j) => j === columnIndex ? value : text) : cells) } })} /></View>)}<Button title={`Remove row ${rowIndex + 1}`} secondary disabled={busy} onPress={() => onChange({ ...draft, data: resizeOutputTable(draft.data, 'remove-row', rowIndex) })} /></View>)}
      </View></ScrollView>
      <Button title="Add row" secondary disabled={busy || draft.data.rows.length >= OUTPUT_LIMITS.rows} onPress={() => onChange({ ...draft, data: resizeOutputTable(draft.data, 'add-row') })} />
      <Button title="Add column" secondary disabled={busy || draft.data.columns.length >= OUTPUT_LIMITS.columns} onPress={() => onChange({ ...draft, data: resizeOutputTable(draft.data, 'add-column') })} />
    </>}
    {draft.kind === 'checklist' && <>
      {draft.data.items.map((item, index) => <View key={index} style={[local.card, { borderColor: t.border }]}>
        <Field label={`Item ${index + 1}`} value={item.text} editable={!busy} maxLength={OUTPUT_LIMITS.cellChars} onChangeText={text => onChange({ ...draft, data: { items: draft.data.items.map((value, i) => i === index ? { ...value, text } : value) } })} />
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Item ${index + 1} complete`} accessibilityState={{ checked: item.checked, disabled: busy }} disabled={busy} style={local.check} onPress={() => onChange({ ...draft, data: { items: draft.data.items.map((value, i) => i === index ? { ...value, checked: !value.checked } : value) } })}><Icon name={item.checked ? 'checkbox-outline' : 'square-outline'} /><Text style={s.body}>Complete</Text></Pressable>
        <Button title={`Remove item ${index + 1}`} secondary disabled={busy || draft.data.items.length <= 1} onPress={() => onChange({ ...draft, data: { items: changeOutputList(draft.data.items, 'remove', index, OUTPUT_LIMITS.checklist) } })} />
      </View>)}
      <Button title="Add item" secondary disabled={busy || draft.data.items.length >= OUTPUT_LIMITS.checklist} onPress={() => onChange({ ...draft, data: { items: changeOutputList(draft.data.items, 'add', { text: '', checked: false }, OUTPUT_LIMITS.checklist) } })} />
    </>}
    {draft.kind === 'calendar' && <>
      {draft.data.events.map((event, index) => <View key={index} style={[local.card, { borderColor: t.border }]}>
        <Field label={`Event ${index + 1} title`} value={event.title} editable={!busy} maxLength={OUTPUT_LIMITS.titleChars} onChangeText={title => eventField(index, { title })} />
        <View pointerEvents={busy ? 'none' : 'auto'}><DuePicker label={`Event ${index + 1} start`} value={event.start ? Date.parse(event.start) : null} onChange={value => eventField(index, { start: value === null ? '' : new Date(value).toISOString() })} /></View>
        <View pointerEvents={busy ? 'none' : 'auto'}><DuePicker label={`Event ${index + 1} end (optional)`} value={event.end ? Date.parse(event.end) : null} onChange={value => eventField(index, { end: value === null ? undefined : new Date(value).toISOString() })} /></View>
        <Field label={`Event ${index + 1} location`} value={event.location ?? ''} editable={!busy} maxLength={OUTPUT_LIMITS.cellChars} onChangeText={location => eventField(index, { location })} />
        <Field label={`Event ${index + 1} description`} value={event.description ?? ''} multiline editable={!busy} maxLength={OUTPUT_LIMITS.cellChars} onChangeText={description => eventField(index, { description })} />
        <Button title={`Remove event ${index + 1}`} secondary disabled={busy || draft.data.events.length <= 1} onPress={() => onChange({ ...draft, data: { events: changeOutputList(draft.data.events, 'remove', index, OUTPUT_LIMITS.events) } })} />
      </View>)}
      <Button title="Add event" secondary disabled={busy || draft.data.events.length >= OUTPUT_LIMITS.events} onPress={() => onChange({ ...draft, data: { events: changeOutputList(draft.data.events, 'add', { title: '', start: new Date().toISOString() }, OUTPUT_LIMITS.events) } })} />
    </>}
  </View>;
}
