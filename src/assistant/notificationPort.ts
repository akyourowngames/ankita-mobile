import type { ReminderPort } from './reminders.ts';
import { ToolFault } from './schema.ts';
type Notifications = typeof import('expo-notifications');
const REMINDER_CHANNEL = 'assistant-reminders'; // Stable OS channel identity for locally scheduled tasks.
export function createNotificationPort(platform: string, load: () => Promise<Notifications>, appName: string): ReminderPort & { initialize(): Promise<void> } {
  let pending: Promise<Notifications> | undefined;
  const module = () => {
    if (!pending) pending = load().then(os => {
      os.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
      return os;
    }).catch(error => { pending = undefined; throw error; });
    return pending;
  };
  return {
    supported: platform !== 'web',
    async initialize() { if (platform !== 'web') await module(); },
    async schedule(task, signal) {
      if (platform === 'web') throw new ToolFault('unsupported_platform', 'Reminders require the native phone app.');
      const os = await module(); signal.throwIfAborted();
      if (platform === 'android') await os.setNotificationChannelAsync(REMINDER_CHANNEL, { name: `${appName} reminders`, importance: os.AndroidImportance.DEFAULT });
      let permissions = await os.getPermissionsAsync();
      if (!permissions.granted && permissions.canAskAgain) permissions = await os.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      signal.throwIfAborted();
      if (!permissions.granted && permissions.ios?.status !== os.IosAuthorizationStatus.PROVISIONAL) throw new ToolFault('permission_denied', 'Notification permission was denied. Enable it in your phone settings before scheduling a reminder.');
      return os.scheduleNotificationAsync({ content: { title: task.title, body: task.notes || `${appName} task reminder`, data: { taskId: task.id }, sound: true }, trigger: { type: os.SchedulableTriggerInputTypes.DATE, date: new Date(task.dueAt!), ...(platform === 'android' ? { channelId: REMINDER_CHANNEL } : {}) } });
    },
    async cancel(id) { if (platform !== 'web') await (await module()).cancelScheduledNotificationAsync(id); },
    async cancelAll() { if (platform !== 'web') await (await module()).cancelAllScheduledNotificationsAsync(); },
  };
}
