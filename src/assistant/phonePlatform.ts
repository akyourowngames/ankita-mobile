import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { importDocument } from './files';
import { ASSISTANT_LIMITS as L } from './config';
import { createNotificationPort } from './notificationPort';
import { APP_NAME } from '../constants/appConfig';
export async function pickPhoneDocument() {
  // Called directly by a press handler: browsers require a user activation.
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, base64: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0], file = Platform.OS === 'web' ? asset.file : new File(asset.uri);
  const size = asset.size ?? file?.size;
  if (!file || !Number.isFinite(size) || !size || size > L.fileBytes) throw new Error('The selected file exceeds the phone import limit or its size is unavailable.');
  try { return importDocument({ name: asset.name, mimeType: asset.mimeType, bytes: new Uint8Array(await file.arrayBuffer()) }); }
  finally { if (Platform.OS === 'web') URL.revokeObjectURL(asset.uri); }
}
export const phoneReminders = createNotificationPort(Platform.OS, () => import('expo-notifications'), APP_NAME);
