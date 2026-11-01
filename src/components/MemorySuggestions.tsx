import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { acceptSuggestion, dismissSuggestion } from '../assistant/consolidation';
import { makeId } from '../core/state';
import { Button, Group, Row, Section, useUI } from './UI';
export function MemorySuggestions() {
  const app = useApp(), t = useTheme(), s = useUI(), [error, setError] = useState(''), [working, setWorking] = useState<string | null>(null);
  const decide = async (id: string, accept: boolean) => {
    setWorking(id); setError('');
    try { await app.commitAssistant(state => accept ? acceptSuggestion(state, id, { id: makeId, now: Date.now }) : dismissSuggestion(state, id)); }
    catch { setError('Could not save this decision. Check device storage and try again.'); }
    finally { setWorking(null); }
  };
  return <View style={s.gap}><Group><Row title="Suggest useful memories" subtitle="Your chosen model checks your message after a reply. Review before saving." right={<Switch accessibilityLabel="Suggest useful memories" value={app.state.assistant.preferences.suggestMemories} onValueChange={suggestMemories => void app.commitAssistant(state => ({ ...state, preferences: { ...state.preferences, suggestMemories } })).catch(() => setError('Could not save this preference.'))} trackColor={{ true: t.accent, false: t.elevated }} thumbColor={t.text} />} /></Group>{app.memoryStatus !== 'idle' && <Text style={s.caption}>{app.memoryStatus === 'checking' ? 'Checking your message for useful details…' : 'Suggestions could not refresh. Your saved memories are available.'}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!app.state.assistant.proposals.length && <Section title={`For your review · ${app.state.assistant.proposals.length}`} note="Suggestions stay out of memory and model prompts until you accept them. New memories are never pinned automatically.">{app.state.assistant.proposals.map(proposal => <View key={proposal.id} style={s.gap}><Text style={s.body}>{proposal.text}</Text><Text selectable style={s.caption}>Your words: “{proposal.source.quote}”</Text><View style={s.hstack}><View style={s.flex}><Button title="Remember this" loading={working === proposal.id} disabled={!!working} onPress={() => void decide(proposal.id, true)} /></View><View style={s.flex}><Button title="Dismiss suggestion" secondary disabled={!!working} onPress={() => void decide(proposal.id, false)} /></View></View></View>)}</Section>}</View>;
}
