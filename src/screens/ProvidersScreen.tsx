import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { discoverModels } from '../api/chiefClient';
import { probeModel } from '../api/modelProbe';
import { ProviderError } from '../api/providerErrors';
import { providerFetch } from '../api/transport';
import { normalizeEndpoint } from '../api/protocol';
import { Button, Field, Group, Header, Icon, IconButton, Row, Section, SheetModal, useUI } from '../components/UI';
import { PROVIDER_PRESETS, type ProviderPreset } from '../constants/providers';
import { useApp } from '../core/AppContext';
import { makeId, type Provider } from '../core/state';
import { getKey } from '../storage/persistence';
import { useTheme } from '../theme/Theme';
import { METRICS } from '../theme/tokens';
import { BROWSER_KEY_NOTICE } from '../constants/appConfig';

type Editor = { provider: Provider; existing: boolean };
export function ProvidersScreen() {
  const app = useApp(), t = useTheme(), s = useUI();
  const [editor, setEditor] = useState<Editor | null>(null);
  const create = (p: ProviderPreset) => setEditor({ existing: false, provider: { id: makeId(), name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: '', keyRequired: p.keyRequired } });
  return <View style={s.flex}><Header title="AI providers" back={() => app.navigate(app.state.onboardingDone ? 'settings' : 'chat')} /><ScrollView contentContainerStyle={s.scroll}><Text style={s.secondary}>Choose a provider and model for your teammates.</Text>{!!app.state.providers.length && <Section title="Your providers"><Group>{app.state.providers.map((p, i) => <Row key={p.id} title={p.name} subtitle={p.model || 'Server default'} icon="layers-outline" divider={i !== app.state.providers.length - 1} onPress={() => setEditor({ provider: p, existing: true })} right={<View style={s.hstack}>{p.id === app.state.activeProviderId && <Text style={s.link}>Active</Text>}<Icon name="chevron-forward" small color={t.muted} /></View>} />)}</Group></Section>}<Section title="Add a provider" note="Use your own API account. Provider usage may be billed by that provider."><Group>{PROVIDER_PRESETS.map((p, i) => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => create(p)}><View style={s.row}><View style={s.avatar}><Text style={s.avatarText}>{p.initials}</Text></View><View style={s.rowCopy}><Text style={s.label}>{p.name}</Text><Text style={s.caption}>{p.description}</Text></View><Icon name="add" color={t.muted} /></View>{i !== PROVIDER_PRESETS.length - 1 && <View style={s.divider} />}</Pressable>)}</Group></Section><View style={s.notice}><View style={s.hstack}><Icon name="lock-closed-outline" color={t.muted} small /><Text style={s.caption}>{Platform.OS === 'web' ? 'Browser keys stay in this browser' : 'Keys are kept in your device’s secure storage'}</Text></View><Text style={s.caption}>{Platform.OS === 'web' ? BROWSER_KEY_NOTICE : 'Your API keys are not included in conversation exports or ordinary app storage.'}</Text></View>{!app.state.onboardingDone && !!app.state.providers.length && <Button title="Start chatting" onPress={app.finishOnboarding} />}</ScrollView>
    <SheetModal visible={!!editor} close={() => setEditor(null)}>{editor && <ProviderEditor key={editor.provider.id} editor={editor} close={() => setEditor(null)} />}</SheetModal>
  </View>;
}
function ProviderEditor({ editor, close }: { editor: Editor; close: () => void }) {
  const app = useApp(), t = useTheme(), s = useUI();
  const [form, setForm] = useState(editor.provider), [key, setKey] = useState(''), [keyTouched, setKeyTouched] = useState(false), [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [models, setModels] = useState<string[]>(editor.provider.models || []), [modelPicker, setModelPicker] = useState(false), [modelSearch, setModelSearch] = useState(''), [removing, setRemoving] = useState(false);
  const keyEdited = useRef(false), request = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; request.current?.abort(); }, []);
  useEffect(() => { if (editor.existing) void getKey(form.id).then(saved => { if (mounted.current && !keyEdited.current) setKey(saved); }); }, []);
  const invalidateRequest = () => { request.current?.abort(); request.current = null; setWorking(false); setNotice(''); setError(''); };
  const invalidateDiscovery = () => { invalidateRequest(); setModels([]); setModelPicker(false); };
  const patch = (change: Partial<Provider>) => { if ('baseUrl' in change || 'keyRequired' in change) invalidateDiscovery(); else if ('model' in change) invalidateRequest(); setForm(p => ({ ...p, ...change })); };
  const resolvedKey = () => keyTouched ? Promise.resolve(key.trim()) : editor.existing ? getKey(form.id) : Promise.resolve('');
  const showError = (e: unknown) => { const message = e instanceof Error ? e.message : ''; setError(e instanceof ProviderError || /^(Enter |Use |Connection |The endpoint|Choose |Add )/.test(message) ? message : 'Could not connect. Check your network, provider URL and API key. Browsers may require the provider to support CORS.'); };
  const testSelectedModel = async () => {
    setError(''); setNotice(''); setWorking(true); const controller = new AbortController(); request.current = controller;
    try {
      const result = await probeModel(form, await resolvedKey(), providerFetch, controller.signal);
      if (mounted.current && request.current === controller && !controller.signal.aborted) setNotice(result === 'tools' ? 'Selected model generated a native tool call successfully. Account access and basic tool calling work.' : 'Server generated a text reply. Phone tool support was not tested.');
    } catch (error) { if (mounted.current && request.current === controller && !controller.signal.aborted) showError(error); }
    finally { if (mounted.current && request.current === controller) setWorking(false); }
  };
  const testConnection = async () => {
    setError(''); setNotice(''); setWorking(true); const controller = new AbortController(); request.current = controller;
    try {
      const found = await discoverModels(form, await resolvedKey(), controller.signal);
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      setModels(found); setNotice(form.kind === 'chief' ? 'Health endpoint responded successfully.' : `Connection works. ${found.length} models available.`);
      if (editor.existing && form.baseUrl === editor.provider.baseUrl && !keyTouched) app.cacheModels(form.id, found);
      if (found.length && !form.model) { setModelPicker(true); setModelSearch(''); }
    } catch (e) { if (mounted.current && request.current === controller && !controller.signal.aborted) showError(e); }
    finally { if (mounted.current && request.current === controller) setWorking(false); }
  };
  const save = async () => {
    setError(''); setWorking(true);
    try {
      if (!form.name.trim()) throw new Error('Enter a provider name.');
      const baseUrl = normalizeEndpoint(form.baseUrl);
      if (form.kind !== 'chief' && !form.model.trim()) throw new Error('Choose a model or enter its ID.');
      if (form.keyRequired && !await resolvedKey()) throw new Error('Add your API key first.');
      await app.saveProvider({ ...form, name: form.name.trim(), baseUrl, model: form.model.trim(), models, modelsUpdatedAt: models.length ? Date.now() : undefined }, keyTouched || !editor.existing ? key.trim() : undefined);
      close();
    } catch (e) { const raw = e instanceof Error ? e.message : ''; if (/^(Enter |Use |Choose |Add )/.test(raw)) setError(raw); else setError('Could not save this provider securely. Try again; your previous settings are kept.'); }
    finally { if (mounted.current) setWorking(false); }
  };
  return <><Pressable accessibilityLabel="Dismiss provider editor" style={s.flex} onPress={close} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title={removing ? 'Remove provider?' : editor.existing ? 'Provider settings' : `Add ${editor.provider.name}`} right={<IconButton name="close" label="Close provider editor" onPress={close} />} />
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">{removing ? <><Text style={s.secondary}>Remove {form.name} and its saved key from this device? Conversations will remain.</Text><Button title="Remove provider" loading={working} onPress={() => { setWorking(true); void app.removeProvider(form.id).then(close).catch(() => { setError('Could not remove the saved key. Try again.'); setWorking(false); }); }} /><Button title="Keep provider" secondary onPress={() => setRemoving(false)} />{!!error && <Text style={s.error}>{error}</Text>}</> : <>
      <Field label="Provider name" value={form.name} onChangeText={name => patch({ name })} />
      <Field label="API base URL" value={form.baseUrl} onChangeText={baseUrl => patch({ baseUrl })} placeholder="https://your-provider.example/v1" autoCapitalize="none" keyboardType="url" />
      <Section note="For local models, use your computer’s reachable network address. A phone’s localhost refers to the phone."><Group><Row title="API key required" right={<Switch accessibilityLabel="API key required" value={form.keyRequired} onValueChange={keyRequired => patch({ keyRequired })} trackColor={{ true: t.accent, false: t.elevated }} thumbColor={t.text} />} /></Group></Section>
      <View style={s.smallGap}><Field label="API key" value={key} onChangeText={value => { keyEdited.current = true; invalidateDiscovery(); setKey(value); setKeyTouched(true); }} placeholder={editor.existing ? 'Leave blank to keep the saved key' : 'Paste your API key'} secureTextEntry={!visible} autoCapitalize="none" autoComplete="off" /><Pressable accessibilityRole="button" onPress={() => setVisible(v => !v)} style={s.toolButton}><Icon name={visible ? 'eye-off-outline' : 'eye-outline'} small color={t.muted} /><Text style={s.caption}>{visible ? 'Hide key' : 'Show key'}</Text></Pressable></View>
      <View style={s.smallGap}><Field label="Model ID" value={form.model} onChangeText={model => patch({ model })} placeholder={form.kind === 'chief' ? 'Optional server model' : 'Choose or enter a model ID'} autoCapitalize="none" />{models.length > 0 && <Pressable accessibilityRole="button" onPress={() => { setModelPicker(true); setModelSearch(''); }}><Text style={s.link}>Choose from available models</Text></Pressable>}</View>
      <Button title={working ? 'Checking connection…' : 'Test connection & find models'} secondary loading={working} onPress={() => void testConnection()} />
      <Button title="Test selected model" secondary disabled={!form.model.trim() && form.kind !== 'chief'} loading={working} onPress={() => void testSelectedModel()} />
      {!!notice && <Text accessibilityRole="alert" style={[s.caption, { color: t.success }]}>{notice}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Text style={s.caption}>Testing checks the provider’s model list. A successful reply also depends on your model permissions and account balance.</Text>
      <Text style={s.caption}>The model test sends one small generation request and may use provider credits. It tests a harmless tool call without running phone tools. Free models can still be rate-limited.</Text>
      <Button title="Save provider" loading={working} onPress={() => void save()} />
      {editor.existing && <><Button title={app.state.activeProviderId === form.id ? 'Active provider' : 'Use this provider'} secondary disabled={app.state.activeProviderId === form.id} onPress={() => { app.chooseProvider(form.id); close(); }} /><Row title="Remove provider" icon="trash-outline" danger onPress={() => setRemoving(true)} /></>}
    </>}</ScrollView>
    </View><SheetModal visible={modelPicker} close={() => setModelPicker(false)}><Pressable style={s.flex} accessibilityLabel="Dismiss models" onPress={() => setModelPicker(false)} /><View style={s.sheet}><Header title="Choose a model" right={<IconButton name="close" label="Close models" onPress={() => setModelPicker(false)} />} /><TextInput accessibilityLabel="Search models" value={modelSearch} onChangeText={setModelSearch} placeholder="Search models" placeholderTextColor={t.muted} style={[s.field, s.search]} /><FlatList data={models.filter(m => m.toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))} keyExtractor={m => m} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <Row title={item} onPress={() => { patch({ model: item }); setModelPicker(false); }} right={item === form.model ? <Icon name="checkmark" color={t.accent} /> : undefined} />} ListEmptyComponent={<View style={s.empty}><Text style={s.caption}>No matching models</Text></View>} /></View></SheetModal>
  </>;
}
