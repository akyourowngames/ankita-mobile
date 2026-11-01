import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/Theme';
import { localDateField, localDateInstant } from '../assistant/dates';
import { useUI } from './UI';
export function DuePicker({ value, onChange, label = 'Due date & time' }: { value: number | null; onChange: (value: number | null) => void; label?: string }) {
  const s = useUI(), t = useTheme();
  return <View><Text style={s.fieldLabel}>{label}</Text>{React.createElement('input', { type: 'datetime-local', 'aria-label': label, value: localDateField(value), style: { ...StyleSheet.flatten(s.field), width: '100%', boxSizing: 'border-box', colorScheme: t.dark ? 'dark' : 'light' }, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { try { onChange(localDateInstant(event.target.value)); } catch {} } })}<Text style={s.caption}>Uses your device’s local time zone.</Text></View>;
}
