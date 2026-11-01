import React, { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import { Header, Field, useUI } from './UI';
import { OutputCard } from './OutputCard';
import { OUTPUT_LIMITS } from '../assistant/outputs';
export function OutputLibrary() {
  const app = useApp(), s = useUI(), [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const artifacts = app.state.assistant.artifacts.filter(item => !query || `${item.title} ${item.content}`.toLocaleLowerCase().includes(query));
  return <View style={s.flex}><Header title="Finished outputs" back={() => app.navigate('settings')} /><FlatList data={artifacts} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={s.gap}><Text style={s.secondary}>Documents, tables, checklists and calendar files made in your conversations.</Text><Field label="Search outputs" value={search} onChangeText={setSearch} maxLength={OUTPUT_LIMITS.titleChars} placeholder="Title or content" /></View>} ListEmptyComponent={<View style={s.pageIntro}><Text style={s.title}>{query ? 'No matching outputs' : 'Your finished work lives here'}</Text><Text style={s.caption}>{query ? 'Try a word from the title or content.' : 'Ask a teammate to create a document, table, checklist or calendar file. Preview and edit the result here before exporting it.'}</Text></View>} renderItem={({ item }) => <OutputCard artifact={item} />} /></View>;
}
