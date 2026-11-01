import config from '../constants/work.json' with { type: 'json' };

type Notifications = typeof import('expo-notifications');
type Completion = { workId: string; eventId: string };
export type LocalNotificationResult = { status: 'scheduled'; identifier: string };
const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value);
const PROJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Native local alerts are foreground fallback; remote push needs real project credentials. */
export function createWorkNotifications(platform: string, load: () => Promise<Notifications> = () => import('expo-notifications')) {
  const supported = platform === 'android' || platform === 'ios';
  let generation = 0;
  let pending: Promise<Notifications> | undefined;
  const presentations = new Map<string, Promise<LocalNotificationResult>>(), opened = new Set<string>();
  const module = () => {
    if (!supported) throw new Error('Work notifications require the native phone app; browser background delivery is unavailable.');
    if (!pending) pending = load().then(os => { os.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) }); return os; }).catch(error => { pending = undefined; throw error; });
    return pending;
  };
  const granted = (permission: Awaited<ReturnType<Notifications['getPermissionsAsync']>>, os: Notifications) => permission.granted || permission.ios?.status === os.IosAuthorizationStatus.PROVISIONAL;
  const channel = async (os: Notifications) => { if (platform === 'android') await os.setNotificationChannelAsync(config.pushChannel, { name: 'ANKITA work updates', importance: os.AndroidImportance.DEFAULT }); };
  async function requestPermission() {
    if (!supported) return false;
    const os = await module(); await channel(os);
    let permission = await os.getPermissionsAsync();
    if (!granted(permission, os) && permission.canAskAgain) permission = await os.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return granted(permission, os);
  }
  async function present(completion: Completion): Promise<LocalNotificationResult> {
    if (!identity(completion.workId) || !identity(completion.eventId)) throw new Error('Invalid work notification identity.');
    const existing = presentations.get(completion.eventId); if (existing) return existing;
    const epoch = generation;
    const task = (async (): Promise<LocalNotificationResult> => {
      const os = await module();
      if (!granted(await os.getPermissionsAsync(), os)) throw new Error('Notification permission was denied. Enable notifications in phone settings.');
      await channel(os);
      const [scheduled, displayed] = await Promise.all([os.getAllScheduledNotificationsAsync(), os.getPresentedNotificationsAsync()]);
      const existing = scheduled.find(item => item.identifier === completion.eventId || item.content.data?.eventId === completion.eventId)
        || displayed.map(item => item.request).find(item => item.identifier === completion.eventId || item.content.data?.eventId === completion.eventId);
      if (epoch !== generation) throw new Error('Work notifications were cleared or disabled.');
      if (existing) return { status: 'scheduled', identifier: existing.identifier };
      const identifier = await os.scheduleNotificationAsync({ identifier: completion.eventId, content: { title: 'ANKITA work update', body: 'Your work has an update. Open ANKITA to review it.', data: { ...completion }, sound: true }, trigger: platform === 'android' ? { channelId: config.pushChannel } : null });
      if (epoch !== generation) { await os.cancelScheduledNotificationAsync(identifier); await os.dismissNotificationAsync(identifier); throw new Error('Work notifications were cleared or disabled.'); }
      return { status: 'scheduled', identifier };
    })();
    presentations.set(completion.eventId, task);
    task.catch(() => { if (presentations.get(completion.eventId) === task) presentations.delete(completion.eventId); });
    return task;
  }
  return {
    supported, requestPermission, present,
    async clear(): Promise<void> {
      generation++; presentations.clear();
      if (!supported) return;
      const os = await module();
      const own = (data: Record<string, unknown> | undefined) => !!data && identity(data.workId) && identity(data.eventId);
      const [scheduled, displayed] = await Promise.all([os.getAllScheduledNotificationsAsync(), os.getPresentedNotificationsAsync()]);
      for (const item of scheduled) if (own(item.content.data)) await os.cancelScheduledNotificationAsync(item.identifier);
      for (const item of displayed) if (own(item.request.content.data)) await os.dismissNotificationAsync(item.request.identifier);
      if (own(os.getLastNotificationResponse()?.notification.request.content.data)) os.clearLastNotificationResponse();
    },
    async register(projectId: string): Promise<string> {
      if (!supported) await module();
      if (!PROJECT.test(projectId.trim())) throw new Error('Enter the actual Expo project ID before registering push notifications.');
      if (!await requestPermission()) throw new Error('Notification permission was denied. Enable notifications in phone settings.');
      let token;
      try { token = await (await module()).getExpoPushTokenAsync({ projectId: projectId.trim() }); }
      catch { throw new Error('Push registration failed. Check the Expo project, platform push credentials and connection.'); }
      if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token.data)) throw new Error('The platform did not return a valid Expo push token.');
      return token.data;
    },
    test() { return present({ workId: 'notification-test', eventId: `work-test-${Date.now().toString(36)}` }); },
    async attachOpenHandler(handler: (workId: string, eventId: string) => void): Promise<() => void> {
      if (!supported) return () => {};
      const os = await module(); let disposed = false;
      const route = (response: ReturnType<Notifications['getLastNotificationResponse']>) => {
        if (disposed || !response || response.actionIdentifier !== os.DEFAULT_ACTION_IDENTIFIER) return;
        const data = response.notification.request.content.data;
        if (!data || !identity(data.workId) || !identity(data.eventId) || opened.has(data.eventId)) return;
        opened.add(data.eventId); handler(data.workId, data.eventId); os.clearLastNotificationResponse();
      };
      const listener = os.addNotificationResponseReceivedListener(route);
      try { route(os.getLastNotificationResponse()); } catch (error) { listener.remove(); throw error; }
      return () => { disposed = true; listener.remove(); };
    },
  };
}
