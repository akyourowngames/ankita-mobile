import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Field, Group, Header, Icon, IconButton, Row, Section, SheetModal, useUI } from '../components/UI';
import { Mascot } from '../components/Mascot';
import { useApp } from '../core/AppContext';
import { CHIEF_ID, makeId, type Teammate } from '../core/state';
import { useTheme } from '../theme/Theme';

export function TeammatesScreen() {
  const app = useApp(), t = useTheme(), s = useUI();
  const [mate, setMate] = useState<Teammate | null>(null), [remove, setRemove] = useState(false);
  const patch = (change: Partial<Teammate>) => setMate(m => m ? { ...m, ...change } : m);
  const edit = (item: Teammate) => { setRemove(false); setMate({ ...item }); };
  return <View style={s.flex}>
    <Header title="Teammates" back={() => app.navigate('chat')} right={<IconButton name="add" label="Add teammate" onPress={() => edit({ id: makeId(), name: '', description: '', instructions: '', providerId: null, model: '' })} />} />
    <FlatList data={app.state.teammates} keyExtractor={item => item.id} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={s.pageIntro}><Text style={s.secondary}>Choose who you’re working with.</Text><Text style={s.caption}>Each teammate has its own instructions and conversations.</Text></View>} renderItem={({ item }) => <View style={[s.teammateRow, item.id === app.state.activeTeammateId && s.activeMate]}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.name} accessibilityState={{ selected: item.id === app.state.activeTeammateId }} style={s.teammateOpen} onPress={() => app.chooseTeammate(item.id)}><Mascot identity={item.id} /><View style={s.rowCopy}><Text numberOfLines={1} style={s.label}>{item.name}</Text><Text numberOfLines={1} style={s.caption}>{item.description || 'Add a role in teammate settings'}</Text></View>{item.id === app.state.activeTeammateId && <Icon name="checkmark" small color={t.muted} />}</Pressable>
      <IconButton name="ellipsis-horizontal" label={`Edit ${item.name}`} onPress={() => edit(item)} />
    </View>} />
    <SheetModal visible={!!mate} close={() => setMate(null)}>
      <Pressable style={s.flex} onPress={() => setMate(null)} accessibilityLabel="Dismiss teammate editor" />
      <View style={s.sheet}><View style={s.sheetHandle} /><Header title="Teammate" right={<IconButton name="close" label="Close teammate editor" onPress={() => setMate(null)} />} /><ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {mate && (remove ? <><Text style={s.body}>Remove {mate.name}? Saved conversations stay on this device.</Text><Button title="Remove teammate" onPress={() => { app.removeTeammate(mate.id); setMate(null); }} /><Button title="Keep teammate" secondary onPress={() => setRemove(false)} /></> : <>
          <View style={s.hstack}><Mascot identity={mate.id} /><Text style={s.caption}>{mate.name || 'New teammate'}</Text></View>
          <Field label="Teammate name" value={mate.name} onChangeText={name => patch({ name })} />
          <Field label="Role" value={mate.description} onChangeText={description => patch({ description })} placeholder="Research, writing, planning…" />
          <Field label="Teammate instructions" value={mate.instructions} onChangeText={instructions => patch({ instructions })} multiline placeholder="How this teammate should work" />
          <Section title="AI provider"><Group><Row title="Use current provider" onPress={() => patch({ providerId: null, model: '' })} right={!mate.providerId ? <Icon name="checkmark" color={t.accent} /> : undefined} />{app.state.providers.map(p => <Row key={p.id} title={p.name} subtitle={p.model} onPress={() => patch({ providerId: p.id, model: '' })} right={mate.providerId === p.id ? <Icon name="checkmark" color={t.accent} /> : undefined} />)}</Group></Section>
          <Field label="Teammate model ID" value={mate.model} onChangeText={model => patch({ model })} placeholder="Leave empty to use provider model" />
          <Text style={s.caption}>Personal instructions and this teammate’s instructions are included in every request.</Text>
          <Button title="Save teammate" disabled={!mate.name.trim()} onPress={() => { app.saveTeammate({ ...mate, name: mate.name.trim() }); setMate(null); }} />
          {mate.id !== CHIEF_ID && app.state.teammates.some(m => m.id === mate.id) && <Button title="Remove this teammate" secondary onPress={() => setRemove(true)} />}
        </>)}
      </ScrollView></View>
    </SheetModal>
  </View>;
}
