import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { discoverModels } from '../api/chiefClient';
import { probeModel } from '../api/modelProbe';
import { ProviderError } from '../api/providerErrors';
import { ConnectionError } from '../api/connectionErrors';
import { providerFetch } from '../api/transport';
import { normalizeEndpoint } from '../api/protocol';
import { Button, Field, Group, Header, Icon, IconButton, Row, Section, SheetModal, useUI } from '../components/UI';
import { PROVIDER_PRESETS, type ProviderPreset } from '../constants/providers';
import { useApp } from '../core/AppContext';
import { makeId, type Provider } from '../core/state';
import { getKey } from '../storage/persistence';
import { useTheme } from '../theme/Theme';
import { BROWSER_KEY_NOTICE } from '../constants/appConfig';

type Editor = { provider: Provider; existing: boolean };
type Operation = 'discover' | 'probe' | 'save' | 'remove';
class ProviderInputError extends Error {}
export function ProvidersScreen() {
  const app = useApp(), t = useTheme(), s = useUI();
  const [editor, setEditor] = useState<Editor | null>(null);
  const mutationInProgress = useRef(false);
  const closeEditor = () => { if (!mutationInProgress.current) setEditor(null); };
  const create = (p: ProviderPreset) => setEditor({ existing: false, provider: { id: makeId(), name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: '', keyRequired: p.keyRequired } });
  return <View style={s.flex}><Header title="AI providers" back={() => app.navigate(app.state.onboardingDone ? 'settings' : 'chat')} /><ScrollView contentContainerStyle={s.scroll}><Text style={s.secondary}>Choose a provider and model for your teammates.</Text>{!!app.state.providers.length && <Section title="Your providers"><Group>{app.state.providers.map((p, i) => <Row key={p.id} title={p.name} subtitle={p.model || 'Server default'} icon="layers-outline" divider={i !== app.state.providers.length - 1} onPress={() => setEditor({ provider: p, existing: true })} right={<View style={s.hstack}>{p.id === app.state.activeProviderId && <Text style={s.link}>Active</Text>}<Icon name="chevron-forward" small color={t.muted} /></View>} />)}</Group></Section>}<Section title="Add a provider" note="Use your own API account. Provider usage may be billed by that provider."><Group>{PROVIDER_PRESETS.map((p, i) => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => create(p)}><View style={s.row}><View style={s.avatar}><Text style={s.avatarText}>{p.initials}</Text></View><View style={s.rowCopy}><Text style={s.label}>{p.name}</Text><Text style={s.caption}>{p.description}</Text></View><Icon name="add" color={t.muted} /></View>{i !== PROVIDER_PRESETS.length - 1 && <View style={s.divider} />}</Pressable>)}</Group></Section><View style={s.notice}><View style={s.hstack}><Icon name="lock-closed-outline" color={t.muted} small /><Text style={s.caption}>{Platform.OS === 'web' ? 'Browser keys stay in this browser' : 'Keys are kept in your device’s secure storage'}</Text></View><Text style={s.caption}>{Platform.OS === 'web' ? BROWSER_KEY_NOTICE : 'Your API keys are not included in conversation exports or ordinary app storage.'}</Text></View>{!app.state.onboardingDone && !!app.state.providers.length && <Button title="Start chatting" onPress={app.finishOnboarding} />}</ScrollView>
    <SheetModal visible={!!editor} close={closeEditor}>{editor && <ProviderEditor key={editor.provider.id} editor={editor} close={closeEditor} onMutationChange={working => { mutationInProgress.current = working; }} />}</SheetModal>
  </View>;
}
function ProviderEditor({ editor, close, onMutationChange }: { editor: Editor; close: () => void; onMutationChange: (working: boolean) => void }) {
  const app = useApp(), t = useTheme(), s = useUI();
  const [form, setForm] = useState(editor.provider), [key, setKey] = useState(''), [keyTouched, setKeyTouched] = useState(false), [visible, setVisible] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [models, setModels] = useState<string[]>(editor.provider.models || []), [modelPicker, setModelPicker] = useState(false), [modelSearch, setModelSearch] = useState(''), [removing, setRemoving] = useState(false);
  const keyEdited = useRef(false), request = useRef<AbortController | null>(null), mounted = useRef(true), activeOperation = useRef<Operation | null>(null);
  const working = operation !== null, checking = operation === 'discover' || operation === 'probe', mutating = operation === 'save' || operation === 'remove';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { if (editor.existing) void getKey(form.id).then(saved => { if (mounted.current && !keyEdited.current) setKey(saved); }).catch(() => { if (mounted.current && !keyEdited.current) setError('Could not read your saved key. Enter it again to reconnect.'); }); }, []);
  const beginOperation = (next: Operation) => {
    if (activeOperation.current) return false;
    activeOperation.current = next; setOperation(next); setError(''); setNotice('');
    if (next === 'save' || next === 'remove') onMutationChange(true);
    return true;
  };
  const finishOperation = (finished: Operation) => {
    if (activeOperation.current !== finished) return;
    activeOperation.current = null;
    if (mounted.current) setOperation(null);
    if (finished === 'save' || finished === 'remove') onMutationChange(false);
  };
  const invalidateRequest = () => {
    request.current?.abort(); request.current = null;
    if (activeOperation.current === 'discover' || activeOperation.current === 'probe') finishOperation(activeOperation.current);
    setNotice(''); setError('');
  };
  const dismiss = () => { if (activeOperation.current === 'save' || activeOperation.current === 'remove') return; invalidateRequest(); close(); };
  const cancelCheck = () => { invalidateRequest(); setNotice('Check cancelled. Your provider details are kept.'); };
  const invalidateDiscovery = () => { invalidateRequest(); setModels([]); setModelPicker(false); };
  const patch = (change: Partial<Provider>) => { if (activeOperation.current === 'save' || activeOperation.current === 'remove') return; if ('baseUrl' in change || 'keyRequired' in change) invalidateDiscovery(); else if ('model' in change) invalidateRequest(); setForm(p => ({ ...p, ...change })); };
  const resolvedKey = () => keyTouched ? Promise.resolve(key.trim()) : editor.existing ? getKey(form.id) : Promise.resolve('');
  const showError = (e: unknown) => { setError(e instanceof ProviderError || e instanceof ConnectionError || e instanceof ProviderInputError ? e.message : 'Could not connect. Check your connection, API base URL and API key, then retry. Your provider details are kept.'); };
  const checkedEndpoint = () => { try { return normalizeEndpoint(form.baseUrl, form.kind); } catch (e) { throw new ProviderInputError(e instanceof Error ? e.message : 'Enter a valid provider URL.'); } };
  const checkedKey = async () => { const value = await resolvedKey(); if (form.keyRequired && !value) throw new ProviderInputError('Add your API key first.'); return value; };
  const testSelectedModel = async () => {
    if (!beginOperation('probe')) return;
    const controller = new AbortController(); request.current = controller;
    try {
      const baseUrl = checkedEndpoint(), savedKey = await checkedKey();
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      const result = await probeModel({ ...form, baseUrl }, savedKey, providerFetch, controller.signal);
      if (mounted.current && request.current === controller && !controller.signal.aborted) setNotice(result === 'tools' ? 'Selected model generated a native tool call successfully. Account access and basic tool calling work.' : 'Server generated a text reply. Phone tool support was not tested.');
    } catch (error) { if (mounted.current && request.current === controller && !controller.signal.aborted) showError(error); }
    finally { if (request.current === controller) { request.current = null; finishOperation('probe'); } }
  };
  const testConnection = async () => {
    if (!beginOperation('discover')) return;
    const controller = new AbortController(); request.current = controller;
    try {
      const baseUrl = checkedEndpoint(), savedKey = await checkedKey();
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      const found = await discoverModels({ ...form, baseUrl }, savedKey, controller.signal);
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      setModels(found); setNotice(form.kind === 'chief' ? 'Health endpoint responded successfully.' : `Connection works. ${found.length} models available.`);
      if (editor.existing && form.baseUrl === editor.provider.baseUrl && !keyTouched) app.cacheModels(form.id, found);
      if (found.length && !form.model) { setModelPicker(true); setModelSearch(''); }
    } catch (e) { if (mounted.current && request.current === controller && !controller.signal.aborted) showError(e); }
    finally { if (request.current === controller) { request.current = null; finishOperation('discover'); } }
  };
  const save = async () => {
    if (!beginOperation('save')) return;
    try {
      if (!form.name.trim()) throw new ProviderInputError('Enter a provider name.');
      const baseUrl = checkedEndpoint();
      if (form.kind !== 'chief' && !form.model.trim()) throw new ProviderInputError('Choose a model or enter its ID.');
      await checkedKey();
      if (!mounted.current) return;
      await app.saveProvider({ ...form, name: form.name.trim(), baseUrl, model: form.model.trim(), models, modelsUpdatedAt: models.length ? Date.now() : undefined }, keyTouched || !editor.existing ? key.trim() : undefined);
      finishOperation('save');
      if (mounted.current) close();
    } catch (e) { if (mounted.current) setError(e instanceof ProviderInputError ? e.message : 'Could not save this provider securely. Try again. Your previous settings are kept.'); }
    finally { finishOperation('save'); }
  };
  const remove = async () => {
    if (!beginOperation('remove')) return;
    try {
      await app.removeProvider(form.id);
      finishOperation('remove');
      if (mounted.current) close();
    } catch { if (mounted.current) setError('Could not remove the saved key. Try again.'); }
    finally { finishOperation('remove'); }
  };
  return <><Pressable accessibilityLabel="Dismiss provider editor" style={s.flex} disabled={mutating} onPress={dismiss} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title={removing ? 'Remove provider?' : editor.existing ? 'Provider settings' : `Add ${editor.provider.name}`} right={<IconButton name="close" label="Close provider editor" disabled={mutating} onPress={dismiss} />} />
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">{removing ? <><Text style={s.secondary}>Remove {form.name} and its saved key from this device? Conversations will remain.</Text><Button title={operation === 'remove' ? 'Removing provider…' : 'Remove provider'} loading={operation === 'remove'} disabled={working} onPress={() => void remove()} /><Button title="Keep provider" secondary disabled={working} onPress={() => setRemoving(false)} />{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}</> : <>
      <Field label="Provider name" value={form.name} editable={!mutating} onChangeText={name => patch({ name })} />
      <Field label="API base URL" value={form.baseUrl} editable={!mutating} onChangeText={baseUrl => patch({ baseUrl })} placeholder="https://your-provider.example/v1" autoCapitalize="none" keyboardType="url" />
      <Section note="For local models, use your computer’s network address."><Group><Row title="API key required" right={<Switch accessibilityLabel="API key required" value={form.keyRequired} disabled={mutating} onValueChange={keyRequired => patch({ keyRequired })} trackColor={{ true: t.accent, false: t.elevated }} thumbColor={t.text} />} /></Group></Section>
      <View><View style={s.spread}><Text style={s.fieldLabel}>API key</Text><IconButton name={visible ? 'eye-off-outline' : 'eye-outline'} label={visible ? 'Hide key' : 'Show key'} onPress={() => setVisible(v => !v)} /></View><TextInput accessibilityLabel="API key" value={key} editable={!mutating} onChangeText={value => { if (activeOperation.current === 'save' || activeOperation.current === 'remove') return; keyEdited.current = true; invalidateDiscovery(); setKey(value); setKeyTouched(true); }} placeholder={editor.existing ? 'Saved key' : 'Paste your API key'} placeholderTextColor={t.muted} secureTextEntry={!visible} autoCapitalize="none" autoComplete="off" autoCorrect={false} style={s.field} /></View>
      <View style={s.smallGap}><Field label="Model ID" value={form.model} editable={!mutating} onChangeText={model => patch({ model })} placeholder={form.kind === 'chief' ? 'Optional server model' : 'Choose or enter a model ID'} autoCapitalize="none" />{models.length > 0 && <Button title="Choose from available models" secondary disabled={working} onPress={() => { setModelPicker(true); setModelSearch(''); }} />}</View>
      <Button title={operation === 'discover' ? 'Checking connection…' : 'Test connection & find models'} secondary disabled={working} loading={operation === 'discover'} onPress={() => void testConnection()} />
      <Button title={operation === 'probe' ? 'Testing selected model…' : 'Test selected model'} secondary disabled={working || (!form.model.trim() && form.kind !== 'chief')} loading={operation === 'probe'} onPress={() => void testSelectedModel()} />
      {checking && <Button title="Cancel check" secondary onPress={cancelCheck} />}
      {!!notice && <Text accessibilityRole="alert" style={[s.caption, { color: t.success }]}>{notice}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Text style={s.caption}>Finding models checks the connection. Testing a model checks account access and tool support, and may use a small amount of provider credit.</Text>
      <Button title={operation === 'save' ? 'Saving provider…' : 'Save provider'} disabled={working} loading={operation === 'save'} onPress={() => void save()} />
      {editor.existing && <><Button title={app.state.activeProviderId === form.id ? 'Active provider' : 'Use this provider'} secondary disabled={working || app.state.activeProviderId === form.id} onPress={() => { if (activeOperation.current) return; app.chooseProvider(form.id); close(); }} /><Row title="Remove provider" icon="trash-outline" danger onPress={working ? undefined : () => { if (!activeOperation.current) { setError(''); setNotice(''); setRemoving(true); } }} /></>}
    </>}</ScrollView>
    </View><SheetModal visible={modelPicker} close={() => setModelPicker(false)}><Pressable style={s.flex} accessibilityLabel="Dismiss models" onPress={() => setModelPicker(false)} /><View style={s.sheet}><Header title="Choose a model" right={<IconButton name="close" label="Close models" onPress={() => setModelPicker(false)} />} /><TextInput accessibilityLabel="Search models" value={modelSearch} onChangeText={setModelSearch} placeholder="Search models" placeholderTextColor={t.muted} style={[s.field, s.search]} /><FlatList data={models.filter(m => m.toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))} keyExtractor={m => m} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <Row title={item} onPress={() => { patch({ model: item }); setModelPicker(false); }} right={item === form.model ? <Icon name="checkmark" color={t.accent} /> : undefined} />} ListEmptyComponent={<View style={s.empty}><Text style={s.caption}>No matching models</Text></View>} /></View></SheetModal>
  </>;
}
