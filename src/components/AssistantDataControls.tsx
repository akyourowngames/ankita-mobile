import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { ASSISTANT_SECRET_IDS } from '../assistant/config';
import { ASSISTANT_EXPORT, exportAssistantRecords } from '../assistant/privacy';
import composio from '../constants/composio.json';
import { getKey } from '../storage/persistence';
import { Button, Group, Header, IconButton, Row, Section, SheetModal, useUI } from './UI';
export function AssistantDataControls() {
  const app = useApp(), s = useUI(), [confirm, setConfirm] = useState(false), [working, setWorking] = useState(false), [notice, setNotice] = useState('');
  const exportData = async () => {
    setWorking(true); setNotice('');
    try {
      const secrets = await Promise.all([...app.state.providers.map(provider => provider.id), composio.secretId, ...Object.values(ASSISTANT_SECRET_IDS)].map(getKey));
      const content = exportAssistantRecords(app.state.assistant, secrets, Date.now());
      if (Platform.OS === 'web') { const url = URL.createObjectURL(new Blob([content], { type: ASSISTANT_EXPORT.mime })), link = document.createElement('a'); link.href = url; link.download = ASSISTANT_EXPORT.filename; link.click(); URL.revokeObjectURL(url); setNotice('Assistant data exported.'); }
      else {
        const fs = await import('expo-file-system/legacy'), sharing = await import('expo-sharing');
        if (!fs.cacheDirectory || !await sharing.isAvailableAsync()) throw new Error('Sharing unavailable');
        const uri = `${fs.cacheDirectory}${ASSISTANT_EXPORT.filename}`;
        await fs.writeAsStringAsync(uri, content); await sharing.shareAsync(uri, { mimeType: ASSISTANT_EXPORT.mime, dialogTitle: 'Export assistant data' }); setNotice('Assistant data is ready to share.');
      }
    } catch { setNotice('Export could not finish. Check device storage and sharing availability.'); }
    finally { setWorking(false); }
  };
  return <Section title="Assistant data" note="Export includes personal facts, tasks, notes, suggestions, imported files and finished outputs. Configured connection credentials are excluded; your own documents may contain private information."><Group><Row title="Saved personal data" subtitle={`${app.state.assistant.memories.length} memories · ${app.state.assistant.tasks.length} tasks · ${app.state.assistant.library.length} documents`} /><Row title="Export assistant data" icon="share-outline" onPress={() => { if (!working) void exportData(); }} divider /><Row title="Clear assistant data" icon="trash-outline" danger onPress={() => { if (!working) setConfirm(true); }} /></Group>{!!notice && <Text accessibilityRole="alert" style={s.caption}>{notice}</Text>}<SheetModal visible={confirm} close={() => { if (!working) setConfirm(false); }}><Pressable style={s.flex} accessibilityLabel="Dismiss assistant data confirmation" onPress={() => { if (!working) setConfirm(false); }} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title="Clear assistant data?" right={<IconButton name="close" label="Close assistant data confirmation" disabled={working} onPress={() => setConfirm(false)} />} /><View style={s.scroll}><Text style={s.secondary}>This permanently removes memories, suggestions, tasks, notes, incoming shares and finished outputs, and cancels phone reminders. Pending persistent work may deliver new outputs after reconnecting. Your chats and connections stay available.</Text><Button title="Clear personal assistant data" loading={working} onPress={() => { setWorking(true); void app.clearAssistantRecords().then(() => { setConfirm(false); setNotice('Assistant data cleared and phone reminders cancelled.'); }).catch(() => setNotice('Could not finish clearing assistant data. Check device storage and retry.')).finally(() => setWorking(false)); }} /><Button title="Keep assistant data" secondary disabled={working} onPress={() => setConfirm(false)} /></View></View></SheetModal></Section>;
}
