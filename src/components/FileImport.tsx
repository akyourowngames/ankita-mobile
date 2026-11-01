import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pickPhoneDocument } from '../assistant/phonePlatform';
import { saveLibraryItem } from '../assistant/records';
import type { LibraryItem } from '../assistant/types';
import { makeId } from '../core/state';
import { useApp } from '../core/AppContext';
import { Button, useUI } from './UI';
export function FileImport({ onImported, title = 'Import a file' }: { onImported?: (item: LibraryItem) => void; title?: string }) {
  const app = useApp(), s = useUI(), [working, setWorking] = useState(false), [error, setError] = useState('');
  const pick = async () => {
    const pending = pickPhoneDocument(); // Start the OS picker during the user's press, before any awaited work.
    setWorking(true); setError('');
    try {
      const input = await pending; if (!input) return;
      let record!: LibraryItem;
      await app.commitAssistant(state => { const changed = saveLibraryItem(state, input, { id: makeId, now: Date.now }); record = changed.record; return changed.state; });
      onImported?.(record);
    } catch (error) { const message = error instanceof Error ? error.message : ''; setError(/^(The selected|The file bytes|The document|Document|Choose a supported)/.test(message) ? message : 'Could not read or save this file. Choose a supported file and check device storage.'); }
    finally { setWorking(false); }
  };
  return <View style={s.smallGap}><Button title={title} secondary loading={working} onPress={() => void pick()} />{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
