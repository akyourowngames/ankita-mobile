import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { useWork } from '../work/WorkContext';
import { METRICS, SPACING } from '../theme/tokens';
import { Button, Header, IconButton, useUI } from './UI';

const local = StyleSheet.create({ preview: { maxHeight: METRICS.previewHeight }, file: { paddingVertical: SPACING.xs } });
/** Content for the composer's single sheet; there is no nested modal. */
export function WorkLauncher({ text, fileIds, onQueued, onClose }: { text: string; fileIds: string[]; onQueued: () => void; onClose: () => void }) {
  const app = useApp(), work = useWork(), s = useUI();
  const [error, setError] = useState(''), [sending, setSending] = useState(false);
  const files = [...new Set(fileIds)].map(id => app.state.assistant.library.find(item => item.id === id)).filter(item => !!item);
  const close = () => { if (!sending) onClose(); };
  const queue = async () => {
    setSending(true); setError('');
    try { if (await work.queue(text, files.map(item => item.id))) onQueued(); else setError('The request was not queued. Your draft is still here. Check the connection and try again.'); }
    catch { setError('Could not queue this request. Your draft is still here. Check the worker connection and try again.'); }
    finally { setSending(false); }
  };
  return <>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss persistent work request" style={s.flex} onPress={close} />
      <View style={s.sheet}><View style={s.sheetHandle} /><Header title="Run in background" right={<IconButton name="close" label="Close work request" disabled={sending} onPress={close} />} />
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.body}>Keep working after you close the app.</Text><Text style={s.caption}>Your paired PC or server must stay running. Your request, selected content, conversation context and provider credentials will be sent to this worker.</Text>
          <Text style={s.fieldLabel}>Worker</Text><Text selectable style={s.body}>{app.state.work.connection.baseUrl}</Text>
          <Text style={s.fieldLabel}>Your request</Text><ScrollView style={local.preview} nestedScrollEnabled><Text selectable style={s.body}>{text.trim() || 'Work with the selected files.'}</Text></ScrollView>
          {!!files.length && <View><Text style={s.fieldLabel}>Selected content · {files.length}</Text>{files.map(file => <View key={file.id} style={local.file}><Text style={s.body}>{file.title}</Text><Text style={s.caption}>{file.asset ? `${file.asset.mimeType} · ${file.asset.bytes.toLocaleString()} bytes` : `${file.content.length.toLocaleString()} characters`}</Text></View>)}</View>}
          <Text style={s.caption}>The worker can research, calculate and create files. Results return to this conversation and Finished outputs after reconnecting.</Text>
          {(!!error || !!work.error) && <Text accessibilityRole="alert" style={s.error}>{error || work.error}</Text>}
          <Button title="Start background work" loading={sending} disabled={work.pending || !app.state.work.connection.enabled} onPress={() => void queue()} /><Button title="Keep editing" secondary disabled={sending} onPress={close} />
        </ScrollView>
      </View>
  </>;
}
