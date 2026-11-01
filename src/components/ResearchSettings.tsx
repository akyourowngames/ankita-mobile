import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { ASSISTANT_SECRET_IDS } from '../assistant/config';
import policy from '../assistant/webPolicy.cjs';
import transport from '../constants/assistantTransport.json';
import { BROWSER_KEY_NOTICE } from '../constants/appConfig';
import { getKey, putKey } from '../storage/persistence';
import { Button, Field, Group, Row, Section, useUI } from './UI';
import type { AssistantState } from '../assistant/types';
export function ResearchSettings() {
  const app = useApp(), s = useUI(), [kind, setKind] = useState<AssistantState['webSearch']['kind']>(app.state.assistant.webSearch.kind), [url, setUrl] = useState(app.state.assistant.webSearch.baseUrl), [key, setKey] = useState(''), [hasKey, setHasKey] = useState(false), [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  useEffect(() => { let alive = true; void getKey(ASSISTANT_SECRET_IDS.search).then(value => { if (alive) setHasKey(!!value); }); return () => { alive = false; }; }, []);
  const save = async () => {
    setWorking(true); setNotice('');
    try {
      const baseUrl = kind === 'none' ? '' : policy.publicURL(url.trim() || (kind === 'brave' ? transport.braveEndpoint : '')).href;
      if (kind === 'brave' && !key.trim() && !hasKey) { setNotice('Add a Brave Search API key first.'); return; }
      if (key.trim()) { await putKey(ASSISTANT_SECRET_IDS.search, key.trim()); setHasKey(true); setKey(''); }
      await app.commitAssistant(state => ({ ...state, webSearch: { kind, baseUrl } })); setNotice('Search settings saved.');
    } catch (error) { setNotice(error instanceof Error && error.message === policy.URL_ERROR ? error.message : 'Could not save search settings. Check the URL and device storage.'); }
    finally { setWorking(false); }
  };
  return <Section title="Web research" note="Page reading works without a search key. Search queries go to the service you choose; webpage text goes to your AI provider when a tool uses it."><Group><Row title="Search service" subtitle={kind === 'none' ? 'No search service' : kind === 'brave' ? 'Brave Search' : 'Your SearXNG instance'} />{(['none', 'brave', 'searxng'] as const).map(value => <Row key={value} title={value === 'none' ? 'Disable web search' : value === 'brave' ? 'Use Brave Search' : 'Use SearXNG'} right={<Text style={s.caption}>{kind === value ? 'Selected' : ''}</Text>} onPress={() => setKind(value)} />)}</Group>{kind !== 'none' && <><Field label="Search endpoint" value={url} onChangeText={setUrl} placeholder={kind === 'brave' ? transport.braveEndpoint : 'Your public HTTPS search endpoint'} autoCapitalize="none" keyboardType="url" maxLength={transport.urlChars} />{kind === 'brave' && <><Field label="Brave Search API key" value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" placeholder={hasKey ? 'Leave empty to keep saved key' : 'Enter your search key'} /><Text style={s.caption}>{Platform.OS === 'web' ? BROWSER_KEY_NOTICE : 'Search keys use the phone’s secure storage.'}</Text></>}</>}<Button title="Save search settings" secondary loading={working} onPress={() => void save()} />{hasKey && <Button title="Remove search key" secondary onPress={() => void putKey(ASSISTANT_SECRET_IDS.search, '').then(() => { setHasKey(false); setKey(''); setNotice('Search key removed.'); }).catch(() => setNotice('Could not remove the search key.'))} />}{!!notice && <Text accessibilityRole="alert" style={s.caption}>{notice}</Text>}</Section>;
}
