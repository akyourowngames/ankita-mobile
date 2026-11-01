import { ConversationLibrary } from '../components/ConversationLibrary';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, Header, Icon, IconButton, Row, SheetModal, useUI } from '../components/UI';
import { useApp } from '../core/AppContext';
import type { Conversation } from '../core/state';
import { useTheme } from '../theme/Theme';
import { METRICS } from '../theme/tokens';
export function HistoryScreen({ drawer = false, onClose }: { drawer?: boolean; onClose?: () => void }) {
  const app = useApp(), t = useTheme(), s = useUI();
  const [selected, setSelected] = useState<Conversation | null>(null), [title, setTitle] = useState(''), [deleting, setDeleting] = useState(false);
  return <View style={s.flex}><ConversationLibrary drawer={drawer} onClose={onClose} options={item => { setSelected(item); setTitle(item.title); setDeleting(false); }} />
    <SheetModal visible={!!selected} close={() => setSelected(null)}><Pressable style={s.flex} accessibilityLabel="Dismiss conversation options" onPress={() => setSelected(null)} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title={deleting ? 'Delete conversation?' : 'Conversation'} right={<IconButton name="close" label="Close conversation options" onPress={() => setSelected(null)} />} /><View style={s.scroll}>{deleting ? <><Text style={s.secondary}>This removes the conversation from this device. This cannot be undone.</Text><Button title="Delete conversation" onPress={() => { if (selected) app.deleteChat(selected.id); setSelected(null); }} /><Button title="Keep conversation" secondary onPress={() => setDeleting(false)} /></> : <><Field label="Conversation name" value={title} onChangeText={setTitle} /><Button title="Save name" disabled={!title.trim()} onPress={() => { if (selected) app.renameChat(selected.id, title); setSelected(null); }} /><Row title={selected?.pinned ? 'Unpin conversation' : 'Pin conversation'} icon="pin-outline" onPress={() => { if (selected) app.pinChat(selected.id); setSelected(null); }} /><Row title="Delete conversation" icon="trash-outline" danger onPress={() => setDeleting(true)} /></>}</View></View></SheetModal>
  </View>;
}
