import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OutputArtifact } from '../assistant/outputs';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { METRICS, RADIUS, SPACING } from '../theme/tokens';
import { Icon, useUI } from './UI';
import { useOutputPreview } from './OutputPreviewHost';

const local = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: METRICS.toolCardHeight, padding: SPACING.md, borderWidth: METRICS.hairline, borderRadius: RADIUS.button }, copy: { flex: 1, minWidth: 0, gap: SPACING.xs } });
export function OutputCard({ artifact }: { artifact: OutputArtifact }) {
  const app = useApp(), s = useUI(), t = useTheme(), open = useOutputPreview();
  const current = app.state.assistant.artifacts.find(item => item.id === artifact.id);
  if (!current) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${current.title}`} onPress={() => open(current.id)} style={[local.row, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Icon name="document-text-outline" color={t.muted} /><View style={local.copy}><Text numberOfLines={1} style={s.label}>{current.title}</Text><Text style={s.caption}>{current.kind} · {new Date(current.updatedAt).toLocaleDateString()}</Text></View><Icon name="chevron-forward" small color={t.muted} />
    </Pressable>;
}
