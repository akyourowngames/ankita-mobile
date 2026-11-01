import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { Button, Header, Icon, IconButton, SheetModal, useUI } from './UI';
import { METRICS, SPACING } from '../theme/tokens';

const local = StyleSheet.create({ link: { minHeight: METRICS.touch, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm }, copy: { flex: 1, flexShrink: 1 } });

/** Read current records by ID: forgotten memory text must never linger in a reply card. */
export function MemoryRecall({ ids }: { ids: readonly string[] }) {
  const app = useApp(), s = useUI(), t = useTheme(), [open, setOpen] = useState(false);
  const selected = [...new Set(ids)], close = () => setOpen(false);
  if (!selected.length) return null;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Inspect ${selected.length} memories used for this reply`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [local.link, pressed && s.navigationPressed]}>
      <Icon name="bookmark-outline" small color={t.muted} />
      <Text style={[s.caption, local.copy]}>{selected.length} {selected.length === 1 ? 'memory' : 'memories'} used</Text>
      <Icon name="chevron-forward" small color={t.muted} />
    </Pressable>
    <SheetModal visible={open} close={close}>
      <Pressable style={s.flex} accessibilityRole="button" accessibilityLabel="Dismiss remembered facts" onPress={close} />
      <View style={s.sheet} accessibilityViewIsModal>
        <View style={s.sheetHandle} />
        <Header title="Memories used" right={<IconButton name="close" label="Close remembered facts" onPress={close} />} />
        <ScrollView contentContainerStyle={s.toolDetails} showsVerticalScrollIndicator={false}>
          <Text style={s.caption}>These are the current saved versions. They may have changed since this reply.</Text>
          {selected.map(id => {
            const memory = app.state.assistant.memories.find(item => item.id === id);
            if (!memory) return <View key={id} style={s.toolDetailCard}><Text style={s.caption}>A memory used for this reply is no longer saved.</Text></View>;
            const sourceChat = app.state.conversations.find(chat => chat.id === memory.source.conversationId && chat.messages.some(message => message.id === memory.source.messageId));
            return <View key={id} style={s.toolDetailCard}>
              <Text style={s.toolDetailLabel}>{memory.pinned ? 'Pinned' : 'Recalled'} · {memory.category}</Text>
              <Text selectable style={s.body}>{memory.text}</Text>
              <Text style={s.caption}>Updated {new Date(memory.updatedAt).toLocaleString()}</Text>
              <Text style={s.toolDetailLabel}>{memory.source.kind === 'manual' ? 'Manually saved evidence' : 'Your source words'}</Text>
              <Text selectable style={s.body}>“{memory.source.quote}”</Text>
              {sourceChat ? <Button secondary title="Open source conversation" onPress={() => { close(); app.openChat(sourceChat.id); }} /> : <Text style={s.caption}>{memory.source.kind === 'manual' ? 'Saved manually.' : 'The source conversation is no longer available on this device.'}</Text>}
            </View>;
          })}
        </ScrollView>
      </View>
    </SheetModal>
  </View>;
}
