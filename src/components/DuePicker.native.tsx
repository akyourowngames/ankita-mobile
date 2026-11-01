import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button, useUI } from './UI';
import { useTheme } from '../theme/Theme';
export function DuePicker({ value, onChange, label = 'Due date & time' }: { value: number | null; onChange: (value: number | null) => void; label?: string }) {
  const s = useUI(), t = useTheme(), [visible, setVisible] = useState(false);
  const choose = () => {
    if (Platform.OS !== 'android') { setVisible(true); return; }
    DateTimePickerAndroid.open({ mode: 'date', value: new Date(value ?? Date.now()), onChange: (event, date) => {
      if (event.type !== 'set' || !date) return;
      DateTimePickerAndroid.open({ mode: 'time', value: date, onChange: (event, time) => { if (event.type !== 'set' || !time) return; date.setHours(time.getHours(), time.getMinutes(), 0, 0); onChange(date.getTime()); } });
    } });
  };
  return <View style={s.gap}><Text style={s.fieldLabel}>{label}</Text><Text style={s.body}>{value === null ? 'No date selected' : new Date(value).toLocaleString()}</Text><Button title={label === 'Due date & time' ? 'Choose due date' : `Choose ${label.toLowerCase()}`} secondary onPress={choose} />{value !== null && <Button title={label === 'Due date & time' ? 'Remove due date' : `Remove ${label.toLowerCase()}`} secondary onPress={() => { onChange(null); setVisible(false); }} />}{visible && <><DateTimePicker accessibilityLabel={label} value={new Date(value ?? Date.now())} mode="datetime" display="inline" themeVariant={t.dark ? 'dark' : 'light'} accentColor={t.accent} onChange={(_event, date) => { if (date) onChange(date.getTime()); }} /><Button title="Done choosing date" secondary onPress={() => setVisible(false)} /></>}<Text style={s.caption}>Uses your phone’s local time zone.</Text></View>;
}
