import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { conversationSections } from '../core/history';
import type { Conversation } from '../core/state';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { Button, Header, Icon, IconButton, useUI } from './UI';
import { METRICS } from '../theme/tokens';
export function ConversationLibrary({ options, drawer = false, onClose }: { options: (chat: Conversation) => void; drawer?: boolean; onClose?: () => void }) {
  const app = useApp(), t = useTheme(), s = useUI();
  const [search, setSearch] = useState(''), [pinned, setPinned] = useState(false);
  const sections = useMemo(() => conversationSections(app.state.conversations, search, pinned), [app.state.conversations, search, pinned]);
  const open = (action: () => void) => { onClose?.(); action(); };
  return <View style={s.flex}>
    {drawer ? <>
      <View style={s.navigationBrand}>
        <Text style={[s.navigationWordmark, s.flex]}>Conversations</Text>
        {onClose && <IconButton name="close" label="Close navigation" onPress={onClose} />}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={() => open(app.newChat)} style={({ pressed }) => [s.navigationNew, pressed && s.navigationPressed]}>
        <Icon name="add" small /><Text style={s.navigationNewText}>New conversation</Text>
      </Pressable>
    </> : <Header title="Conversations" back={() => app.navigate('chat')} right={<IconButton name="create-outline" label="New conversation" onPress={app.newChat} />} />}
    <View style={[s.search, s.hstack]}><Icon name="search-outline" small color={t.muted} /><TextInput accessibilityLabel="Search conversations" placeholder="Search conversations" placeholderTextColor={t.muted} value={search} onChangeText={setSearch} style={[s.searchInput, s.flex, s.inputReset]} />{!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear conversation search" onPress={() => setSearch('')} style={s.searchClear}><Icon name="close" small color={t.muted} /></Pressable>}</View>
    {!drawer && <View style={s.libraryTools}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: pinned === value }} accessibilityLabel={value ? 'Pinned conversations' : 'All conversations'} onPress={() => setPinned(value)} style={[s.filter, pinned === value && { backgroundColor: t.elevated }]}><Text style={[s.caption, pinned === value && { color: t.text }]}>{value ? 'Pinned' : 'All conversations'}</Text></Pressable>)}</View>}
    <SectionList sections={sections} style={s.flex} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} stickySectionHeadersEnabled={false} keyExtractor={chat => chat.id} contentContainerStyle={[s.conversationList, !sections.length && s.historyEmptyContainer]} renderSectionHeader={({ section }) => <Text style={s.dateHeading}>{section.title}</Text>}
      ListEmptyComponent={<View style={s.historyEmpty}><Icon name="chatbubbles-outline" color={t.muted} /><Text style={s.historyEmptyTitle}>{search ? 'No matching conversations' : pinned ? 'No pinned conversations' : 'Your conversations live here'}</Text><Text style={s.historyEmptyCopy}>{search ? 'Try another word from a title or message.' : pinned ? 'Pin a conversation from its options.' : 'Start a chat and pick it up here anytime.'}</Text>{!drawer && !search && !pinned && <Button title="Start a conversation" onPress={app.newChat} />}</View>}
      renderItem={({ item }) => <View style={[s.historyItem, item.id === app.chatId && s.historyItemActive]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} style={s.sessionOpen} onPress={() => open(() => app.openChat(item.id))}><View style={s.historyTitleRow}>{item.pinned && <Icon name="pin-outline" small color={t.muted} />}<Text numberOfLines={1} style={s.sessionTitle}>{item.title}</Text></View><Text numberOfLines={1} style={s.sessionPreview}>{item.messages.at(-1)?.content.slice(0, METRICS.historyPreviewLimit).replace(/\s+/g, ' ') || 'New conversation'}</Text></Pressable>
        <IconButton name="ellipsis-horizontal" label={`Options for ${item.title}`} onPress={() => options(item)} />
      </View>} />
    {drawer && <View style={s.navigationFooter}><Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => open(() => app.navigate('settings'))} style={({ pressed }) => [s.sidebarSettings, pressed && s.navigationPressed]}><Icon name="settings-outline" small color={t.muted} /><Text style={s.sidebarSettingsLabel}>Settings</Text><Icon name="chevron-forward" small color={t.muted} /></Pressable></View>}
  </View>;
}
