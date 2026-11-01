import React, { memo } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Icon, useUI } from './UI';
import { useTheme } from '../theme/Theme';

// Native text rendering supports emphasis, links, bullet lists and fenced code;
// HTML is always treated as text and never inserted into a WebView.
export const MessageBody = memo(function MessageBody({ content }: { content: string }) {
  const s = useUI(), t = useTheme();
  const parts = content.split(/```([^\n]*)\n([\s\S]*?)(?:```|$)/g);
  const inline = (text: string) => text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <Text key={index} style={{ color: t.accent }} onPress={() => void Linking.openURL(link[2]).catch(() => {})}>{link[1]}</Text>;
    if (part.startsWith('**') && part.endsWith('**')) return <Text key={index} style={{ fontWeight: '600' }}>{part.slice(2, -2)}</Text>;
    return part;
  });
  const rendered = [];
  for (let index = 0; index < parts.length; index += 3) {
    if (parts[index]) rendered.push(<Text selectable key={`text-${index}`} style={s.body}>{inline(parts[index].replace(/^#{1,6}\s+/gm, '').replace(/^[-*]\s+/gm, '• '))}</Text>);
    if (parts[index + 2] !== undefined) rendered.push(<View key={`code-${index}`} style={s.code}><View style={s.spread}><Text style={s.caption}>{parts[index + 1] || 'Code'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Copy code" style={s.toolButton} onPress={() => void Clipboard.setStringAsync(parts[index + 2])}><Icon name="copy-outline" small color={t.muted} /><Text style={s.caption}>Copy</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={s.codeText}>{parts[index + 2].trimEnd()}</Text></ScrollView></View>);
  }
  return <View style={s.smallGap}>{rendered}</View>;
});
