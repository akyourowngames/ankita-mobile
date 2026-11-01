import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Header, Icon, IconButton, Row, SheetModal, useUI, type IconName } from '../components/UI';
import { Mascot } from '../components/Mascot';
import { useComposerDraft, useComposerFiles } from '../components/ComposerDrafts';
import { MessageBody } from '../components/MessageBody';
import { Thinking } from '../components/Thinking';
import { useApp } from '../core/AppContext';
import { exportConversation, type Message } from '../core/state';
import { followTranscript } from '../core/transcriptScroll';
import { useTheme } from '../theme/Theme';
import { METRICS, PHONE, SPACING } from '../theme/tokens';
import { useWorkspaceNavigation } from '../components/WorkspaceNavigation';
import { ToolActivity } from '../components/AssistantActivity';
import { FileImport } from '../components/FileImport';
import { ASSISTANT_LIMITS } from '../assistant/config';
import { WorkLauncher } from '../components/WorkLauncher';
import { WorkCard } from '../components/WorkCard';
import { OutputCard } from '../components/OutputCard';
import { MemoryRecall } from '../components/MemoryRecall';
import { useWork } from '../work/WorkContext';

const local = StyleSheet.create({ metadata: { gap: SPACING.xs }, action: { flexDirection: 'row', alignItems: 'center', minHeight: METRICS.touch + SPACING.lg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xs, gap: SPACING.md }, actionIcon: { width: METRICS.touch, alignItems: 'center', justifyContent: 'center' }, actionCopy: { flex: 1, minWidth: 0, gap: SPACING.xs }, actionTitle: { fontWeight: '600' }, actionList: { gap: SPACING.xs } });

type ComposerPanel = 'actions' | 'attachments' | 'models' | 'background' | null;
function ComposerAction({ title, detail, icon, label = title, onPress, disabled = false }: { title: string; detail: string; icon: IconName; label?: string; onPress: () => void; disabled?: boolean }) {
  const s = useUI(), t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [local.action, { opacity: disabled ? METRICS.disabledOpacity : pressed ? METRICS.opacityPressed : 1 }]}><View style={local.actionIcon}><Icon name={icon} color={t.muted} /></View><View style={local.actionCopy}><Text style={[s.body, local.actionTitle]}>{title}</Text><Text style={s.caption}>{detail}</Text></View><Icon name="chevron-forward" small color={t.muted} /></Pressable>;
}

const STARTERS: { title: string; description: string; draft: string; icon: IconName }[] = [
  { title: 'Plan my day', description: 'Turn your to-dos into a clear plan', draft: 'Help me plan my day. ', icon: 'calendar-outline' },
  { title: 'Work through an idea', description: 'Find a fresh perspective', draft: 'Help me work through this idea: ', icon: 'bulb-outline' },
  { title: 'Write a reply', description: 'Find the right words', draft: 'Help me write a reply to: ', icon: 'create-outline' },
];

function MessageAction({ label, icon, onPress, disabled = false }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean }) {
  const s = useUI(), t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={PHONE.actionHitSlop} onPress={onPress} style={({ pressed }) => [s.replyAction, { opacity: disabled ? METRICS.disabledOpacity : pressed ? METRICS.opacityPressed : 1 }]}><Icon name={icon} small color={t.muted} /></Pressable>;
}

type PickerGroup = { provider: string; id: string; models: string[] };
function ModelPicker({ groups, activeProviderId, activeModel, onPick, onManage, close }: { groups: PickerGroup[]; activeProviderId: string | null; activeModel: string; onPick: (providerId: string, model: string) => void; onManage: () => void; close: () => void }) {
  const s = useUI(), t = useTheme(), [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const visible = groups.map(group => ({ ...group, models: group.models.filter(model => { const label = model || 'Server default'; return !search || group.provider.toLocaleLowerCase().includes(search) || label.toLocaleLowerCase().includes(search); }) })).filter(group => group.models.length);
  return (
    <>
      <Pressable accessibilityLabel="Dismiss model picker" style={s.flex} onPress={close} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Header title="Choose a model" right={<IconButton name="close" label="Close model picker" onPress={close} />} />
        <View style={s.pickerSearchWrap}>
          <Icon name="search-outline" small color={t.muted} />
          <TextInput accessibilityLabel="Search models" value={query} onChangeText={setQuery} placeholder="Search providers and models" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} style={s.pickerSearch} />
          {!!query && <IconButton name="close-circle" label="Clear model search" onPress={() => setQuery('')} />}
        </View>
        <ScrollView contentContainerStyle={s.pickerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {visible.map(group => (
            <View key={group.id} style={s.section}>
              <Text style={s.sectionTitle}>{group.provider}</Text>
              <View style={s.group}>
                {group.models.map((model, index) => {
                  const label = model || 'Server default', active = group.id === activeProviderId && model === activeModel;
                  return (
                    <Pressable key={model || 'default'} accessibilityRole="button" accessibilityLabel={`${group.provider}: ${label}`} onPress={() => onPick(group.id, model)} style={({ pressed }) => [s.pickerRow, index > 0 && s.pickerDivider, active && s.pickerRowActive, { opacity: pressed ? METRICS.opacityPressed : 1 }]}>
                      <Text numberOfLines={1} style={[s.label, s.flex]}>{label}</Text>
                      {active && <Icon name="checkmark" small color={t.accent} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {!visible.length && <View style={s.pickerEmpty}><Text style={s.caption}>{query.trim() ? `No models match “${query.trim()}”` : 'No provider models found yet'}</Text></View>}
          <Pressable accessibilityRole="button" accessibilityLabel="Manage providers" onPress={onManage} style={({ pressed }) => [s.pickerManage, { opacity: pressed ? METRICS.opacityPressed : 1 }]}>
            <Icon name="settings-outline" small color={t.muted} />
            <Text style={s.link}>Manage providers</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

const MessageItem = memo(function MessageItem({ message, sourceUserId, last, busy, copy, retry, share }: { message: Message; sourceUserId?: string; last: boolean; busy: boolean; copy: (content: string) => void; retry: () => void; share: () => void }) {
  const app = useApp(), s = useUI(), t = useTheme();
  if (message.role === 'user') return (
    <View style={s.userBubble}>
      <Text selectable style={s.body}>{message.content}</Text>
      {!!message.fileIds?.length && <Text style={s.caption}>{message.fileIds.length} selected {message.fileIds.length === 1 ? 'document' : 'documents'}</Text>}
    </View>
  );
  return (
    <View style={s.assistantMessage}>
      {!!message.content && <MessageBody content={message.content.trimStart()} />}
      {app.state.assistant.artifacts.filter(artifact => artifact.source?.conversationId === app.chatId && (artifact.source.messageId === message.id || !artifact.source.workId && artifact.source.messageId === sourceUserId)).map(artifact => <OutputCard key={artifact.id} artifact={artifact} />)}
      {message.status === 'streaming' && !message.tools?.some(tool => tool.status === 'waiting' || tool.status === 'running') && <Thinking label={message.activity || (message.content ? 'Writing' : 'Thinking')} writing={!!message.content} />}
      {!!message.error && <View style={s.errorNotice}><Icon name="alert-circle-outline" small color={t.danger} /><Text accessibilityRole="alert" style={[s.error, s.flex]}>{message.error}</Text></View>}
      {message.status === 'stopped' && <View style={s.stoppedNotice}><Icon name="stop-circle-outline" small color={t.muted} /><Text style={s.caption}>Stopped · partial reply kept</Text></View>}
      {!!(message.workId || message.tools?.length || message.memoryIds?.length) && <View style={local.metadata}>
        {!!message.workId && <WorkCard id={message.workId} compact />}
        {!!message.tools?.length && <ToolActivity receipts={message.tools} />}
        {!!message.memoryIds?.length && <MemoryRecall ids={message.memoryIds} />}
      </View>}
      {last && message.status !== 'streaming' && (
        <View style={s.messageTools}>
          {!!message.content && <MessageAction label="Copy reply" icon="copy-outline" onPress={() => copy(message.content)} />}
          {!message.workId && <MessageAction label="Retry reply" icon="refresh-outline" disabled={busy} onPress={retry} />}
          <MessageAction label="Share conversation" icon="share-outline" onPress={share} />
        </View>
      )}
    </View>
  );
});

export function ChatScreen() {
  const app = useApp(), work = useWork(), t = useTheme(), s = useUI(), { height } = useWindowDimensions(), compact = height < PHONE.compactHeight;
  const navigation = useWorkspaceNavigation();
  const [panel, setPanel] = useState<ComposerPanel>(null), [copied, setCopied] = useState(''), [focused, setFocused] = useState(false), [away, setAway] = useState(false);
  const scroll = useRef<FlatList<Message>>(null), input = useRef<TextInput>(null), following = useRef(true), scrollOffset = useRef(0), actions = useRef(app);
  const chat = app.state.conversations.find(c => c.id === app.chatId);
  const teammate = app.state.teammates.find(m => m.id === app.state.activeTeammateId) || app.state.teammates[0];
  const [draft, setDraft] = useComposerDraft(teammate.id, app.chatId);
  const [fileIds, setFiles] = useComposerFiles(teammate.id, app.chatId);
  const selectedProvider = app.state.providers.find(p => p.id === (teammate.providerId || app.state.activeProviderId));
  const provider = selectedProvider ? { ...selectedProvider, model: teammate.model || selectedProvider.model } : undefined;
  const working = chat?.messages.some(message => message.status === 'streaming') || false;
  const canSend = !!draft.trim() || !!fileIds.length;
  const outputSources = new Map<string, string>();
  let precedingUserId = '';
  for (const message of chat?.messages || []) { if (message.role === 'user') precedingUserId = message.id; else if (precedingUserId) outputSources.set(message.id, precedingUserId); }
  const firstName = (app.state.settings.name || '').trim().split(/\s+/)[0];
  // Model catalog: discovered models plus the saved default, deduped; empty providers still offer a server-default row.
  const groups: PickerGroup[] = app.state.providers.map(p => {
    const models = [...new Set([p.model, ...(p.models || [])].map(model => model.trim()).filter(Boolean))];
    return { id: p.id, provider: p.name, models: models.length ? models : [''] };
  });
  useEffect(() => { actions.current = app; }, [app]);
  useEffect(() => { following.current = true; scrollOffset.current = 0; setAway(false); }, [app.chatId]);
  const copy = useCallback((content: string) => { void Clipboard.setStringAsync(content).then(() => setCopied('Reply copied')).catch(() => setCopied('Copy was unavailable. Try sharing the conversation.')); }, []);
  const retry = useCallback(() => { void actions.current.send('', true); }, []);
  const share = useCallback(() => {
    const current = actions.current, conversation = current.state.conversations.find(c => c.id === current.chatId);
    if (!conversation) return;
    const owner = current.state.teammates.find(m => m.id === conversation.teammateId);
    const message = exportConversation(conversation, owner?.name);
    void (Platform.OS === 'web' ? Clipboard.setStringAsync(message).then(() => setCopied('Conversation copied')) : Share.share({ title: conversation.title, message })).catch(() => setCopied('Could not share. Copy individual messages instead.'));
  }, []);
  const jumpToLatest = () => { following.current = true; setAway(false); scroll.current?.scrollToEnd({ animated: true }); };
  const closePanel = () => { if (panel !== 'background' || !work.pending) setPanel(null); };
  const openPicker = () => { Keyboard.dismiss(); if (app.state.providers.length) setPanel('models'); else { setPanel(null); app.navigate('providers'); } };
  const pickModel = (providerId: string, model: string) => { app.chooseModel(providerId, model); setPanel(null); };
  const submit = () => {
    if (app.busy || (!draft.trim() && !fileIds.length)) return;
    if (!provider) { app.navigate('providers'); return; }
    const text = draft, selected = fileIds; setDraft(''); setFiles([]); following.current = true; setAway(false); Keyboard.dismiss(); void app.send(text, false, selected);
  };
  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={METRICS.keyboardOffset}>
      <View style={s.chatHeader}>
        {!navigation.wide && <IconButton name="menu-outline" label="Conversations" onPress={navigation.open} />}
        <View style={s.chatIdentity}>
          <Mascot identity={teammate.id} size={PHONE.headerMascot} working={working} />
          <Pressable accessibilityRole="button" accessibilityLabel="Choose teammate" hitSlop={PHONE.actionHitSlop} onPress={() => app.navigate('teammates')} style={({ pressed }) => [s.identityButton, { opacity: pressed ? METRICS.opacityPressed : 1 }]}>
            <View style={s.identityCopy}><Text numberOfLines={1} style={s.identityName}>{teammate.name}</Text><Text numberOfLines={1} style={s.identityDetail}>{working ? 'Working on your reply' : teammate.description || 'Personal assistant'}</Text></View>
            <Icon name="chevron-down" small color={t.muted} />
          </Pressable>
        </View>
        <IconButton name="create-outline" label={navigation.wide ? 'Start a new chat' : 'New conversation'} onPress={app.newChat} background />
      </View>
      <FlatList
        key={app.chatId || teammate.id}
        ref={scroll}
        data={chat?.messages || []}
        keyExtractor={message => message.id}
        style={s.flex}
        contentContainerStyle={[s.chatContent, !chat?.messages.length && s.chatContentEmpty, compact && !chat?.messages.length && s.chatContentCompact]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        initialNumToRender={PHONE.listInitial}
        maxToRenderPerBatch={PHONE.listBatch}
        windowSize={PHONE.listWindow}
        updateCellsBatchingPeriod={PHONE.listBatchMs}
        scrollEventThrottle={PHONE.scrollThrottleMs}
        onContentSizeChange={() => { if (following.current && chat?.messages.length) scroll.current?.scrollToEnd({ animated: false }); }}
        onScroll={event => {
          const n = event.nativeEvent;
          const next = followTranscript(following.current, scrollOffset.current, { offset: n.contentOffset.y, viewport: n.layoutMeasurement.height, content: n.contentSize.height }, PHONE.followSlop);
          following.current = next;
          setAway(current => current === !next ? current : !next);
          scrollOffset.current = n.contentOffset.y;
        }}
        ItemSeparatorComponent={() => <View style={s.messageSeparator} />}
        renderItem={({ item, index }) => <MessageItem message={item} sourceUserId={outputSources.get(item.id)} last={index === (chat?.messages.length || 0) - 1} busy={app.busy} copy={copy} retry={retry} share={share} />}
        ListEmptyComponent={
          <View style={[s.emptyChat, compact && s.emptyChatCompact]}>
            <View style={s.emptyBody}>
              {!compact && <View style={s.welcomeMark}><Mascot identity={teammate.id} size={METRICS.welcomeMark} /></View>}
              <View style={s.emptyCopy}>
                <Text style={[s.welcomeTitle, compact && s.heroCompact]}>{firstName ? `Hi, ${firstName}.` : 'Hi there.'}</Text>
                <Text style={s.emptySubtitle}>What would you like to work on?</Text>
              </View>
              {provider ? (
                <View style={s.promptGroup}>
                  {STARTERS.map((starter, index) => (
                    <React.Fragment key={starter.title}>
                      {index > 0 && <View style={s.promptDivider} />}
                      <Pressable accessibilityRole="button" accessibilityLabel={starter.title} onPress={() => { setDraft(draft ? `${draft}\n${starter.draft}` : starter.draft); input.current?.focus(); }} style={({ pressed }) => [s.promptRow, { opacity: pressed ? METRICS.opacityPressed : 1 }]}>
                        <View style={s.promptIcon}><Icon name={starter.icon} small color={t.text} /></View>
                        <View style={s.rowCopy}><Text style={s.promptTitle}>{starter.title}</Text><Text style={s.promptDescription}>{starter.description}</Text></View>
                        <Icon name="chevron-forward" small color={t.muted} />
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>
              ) : (
                <View style={s.setupCard}>
                  <Text style={s.title}>Add your provider</Text>
                  <Text style={s.caption}>Connect an endpoint and model to start chatting.</Text>
                  <Button title="Connect a provider" onPress={() => app.navigate('providers')} />
                </View>
              )}
            </View>
          </View>
        }
      />
      <View style={s.composerArea}>
        {!!fileIds.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hstack}>
            {fileIds.map(id => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove attachment ${app.state.assistant.library.find(item => item.id === id)?.title || 'document'}`} key={id} style={s.filter} onPress={() => setFiles(fileIds.filter(item => item !== id))}>
                <View style={s.hstack}>
                  <Icon name="document-text-outline" small color={t.muted} />
                  <Text numberOfLines={1} style={s.caption}>{app.state.assistant.library.find(item => item.id === id)?.title || 'Unavailable document'}</Text>
                  <Icon name="close" small color={t.muted} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!!copied && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" style={s.inlineNotice} onPress={() => setCopied('')}><Icon name="checkmark" small color={t.success} /><Text style={[s.caption, s.flex]}>{copied}</Text><Icon name="close" small color={t.muted} /></Pressable>}
        <View style={s.composerStack}>
          {away && !fileIds.length && !copied && (
            <View style={s.jumpWrap}>
              <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest message" onPress={jumpToLatest} style={({ pressed }) => [s.jumpButton, { opacity: pressed ? METRICS.opacityPressed : 1 }]}>
                <Icon name="arrow-down" small color={t.text} />
                <Text style={s.caption}>{working ? 'New reply' : 'Latest'}</Text>
              </Pressable>
            </View>
          )}
          <View style={[s.composerDock, focused && s.composerDockFocused]}>
            <TextInput ref={input} accessibilityLabel="Message" placeholder={`Message ${teammate.name}…`} placeholderTextColor={t.muted} value={draft} onChangeText={setDraft} multiline style={s.composerInput} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} selectionColor={t.accent} />
            <View style={s.composerTop}>
              <Pressable accessibilityRole="button" accessibilityLabel="Message actions" hitSlop={PHONE.actionHitSlop} onPress={() => { Keyboard.dismiss(); setPanel('actions'); }} style={({ pressed }) => [s.composerTool, { opacity: pressed ? METRICS.opacityPressed : 1 }]}><Icon name="add" color={t.muted} /></Pressable>
              <View style={s.flex} />
              <Pressable accessibilityRole="button" accessibilityLabel={app.busy ? 'Stop reply' : 'Send message'} accessibilityState={{ disabled: !app.busy && !canSend }} onPress={app.busy ? app.stop : submit} disabled={!app.busy && !canSend} style={[s.send, !app.busy && !canSend && s.sendIdle]}>
                <Icon name={app.busy ? 'stop' : 'arrow-up'} color={app.busy || canSend ? t.inverse : t.muted} />
              </Pressable>
            </View>
          </View>
        </View>
        {!!app.storageError && <View style={s.composerFoot}><Icon name="alert-circle-outline" small color={t.danger} /><Text style={s.composerFootText}>Check device storage to save changes</Text></View>}
      </View>
      <SheetModal visible={panel !== null} close={closePanel}>
        {panel === 'actions' && <><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message actions" style={s.flex} onPress={closePanel} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title="Message actions" right={<IconButton name="close" label="Close message actions" onPress={closePanel} />} /><ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled"><View style={local.actionList}>
          <ComposerAction title="Attach a document" detail={fileIds.length >= ASSISTANT_LIMITS.messageFiles ? 'Remove an attachment to add another' : 'Photos, PDFs and files from your library'} icon="attach-outline" disabled={app.busy || fileIds.length >= ASSISTANT_LIMITS.messageFiles} onPress={() => setPanel('attachments')} />
          <ComposerAction title="Choose a model" label="Choose provider and model" detail={provider ? provider.model || `${provider.name} · Server default` : 'Connect your AI provider'} icon="layers-outline" onPress={openPicker} />
          <ComposerAction title="Run in background" detail={!canSend ? 'Write a request or attach a file first' : app.state.work.connection.enabled ? 'Continue on your worker after the app closes' : 'Set up a worker and keep your draft'} icon="time-outline" disabled={app.busy || work.pending || !canSend} onPress={() => { if (app.state.work.connection.enabled) setPanel('background'); else { setPanel(null); app.navigate('work'); } }} />
        </View></ScrollView></View></>}
        {panel === 'models' && <ModelPicker groups={groups} activeProviderId={provider?.id || null} activeModel={provider?.model || ''} onPick={pickModel} onManage={() => { setPanel(null); app.navigate('providers'); }} close={closePanel} />}
        {panel === 'attachments' && <><Pressable style={s.flex} onPress={closePanel} accessibilityLabel="Dismiss attachments" /><View style={s.sheet}><View style={s.sheetHandle} /><Header title="Attach a document" right={<IconButton name="close" label="Close attachments" onPress={closePanel} />} /><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><Text style={s.caption}>Choose up to {ASSISTANT_LIMITS.messageFiles} files. Selected content is sent to your AI provider when you send the message.</Text><FileImport title="Choose from phone" onImported={item => { setFiles([...fileIds, item.id]); setPanel(null); }} /><Text style={s.sectionTitle}>From your library</Text>{app.state.assistant.library.filter(item => !fileIds.includes(item.id)).map(item => <Row key={item.id} title={item.title} subtitle={item.asset?.mimeType || item.kind} icon="document-text-outline" onPress={() => { setFiles([...fileIds, item.id]); setPanel(null); }} />)}</ScrollView></View></>}
        {panel === 'background' && <WorkLauncher text={draft} fileIds={fileIds} onClose={closePanel} onQueued={() => { setDraft(''); setFiles([]); setPanel(null); following.current = true; setAway(false); Keyboard.dismiss(); }} />}
      </SheetModal>
    </KeyboardAvoidingView>
  );
}
