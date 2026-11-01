import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Field, Group, Header, Icon, IconButton, Row, Section, SheetModal, useUI } from '../components/UI';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';
import { COLOR, METRICS, RADIUS, SPACING } from '../theme/tokens';
import { ASSISTANT_SECRET_IDS } from '../assistant/config';
import { companionFetch } from '../api/transport';
import { getKey, putKey } from '../storage/persistence';
import { pairDesktop, checkDesktop, selfRevokeDesktop, phoneDeviceName, pairingFailure, pairingMessage, PairingError, type PairingFailure, type PairingStage } from '../assistant/desktopPairing';
import { desktopOrigin, formatPairingCode, isLoopbackAddress, parsePairingLink } from '../assistant/pairingProtocol';
import config from '../constants/companion.json';

const FAILURE_HINT: Partial<Record<PairingFailure, string>> = {
  code: 'The code is short-lived. Ask the computer for a fresh one.',
  expired: 'Invitations cannot be reused. Ask the computer for a fresh code.',
  untrusted: 'Use “Save certificate” in the computer’s Settings, then install it on this phone.',
  mismatch: 'Only scan a code shown by the Ankita app on your own computer.',
};
const STAGE_TEXT: Record<PairingStage, string> = {
  contacting: 'Contacting the computer…',
  waiting: 'Waiting for you to approve this phone on the computer…',
  verifying: 'Checking the computer’s identity…',
};
const FIREWALL_NOTE = 'If the phone cannot connect, allow Ankita through the computer’s firewall and keep both devices on the same Wi-Fi network.';
const SCANNER_HEIGHT = 320; // dp: camera preview inside the scanner sheet.

function failureMessage(failure: PairingFailure, message?: string) {
  return { failure, message: message || messageFor(failure) };
}
function messageFor(failure: PairingFailure) { return new PairingError(failure).message; }

export function DesktopPairingScreen() {
  const app = useApp(), t = useTheme(), s = useUI();
  const desktop = app.state.assistant.desktop;
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState<string | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'checking' | 'online' | 'offline'; detail?: string }>({ kind: 'idle' });
  const [stage, setStage] = useState<PairingStage | null>(null);
  const [error, setError] = useState<{ failure: PairingFailure; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [address, setAddress] = useState(desktop.baseUrl);
  const [code, setCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [working, setWorking] = useState(false);
  const pairing = useRef<AbortController | null>(null);
  const checking = useRef<AbortController | null>(null);
  const connected = keyChecked && !!token && !!desktop.baseUrl;

  useEffect(() => {
    let alive = true;
    void getKey(ASSISTANT_SECRET_IDS.desktop).then(value => { if (alive) { setToken(value); setKeyChecked(true); } })
      .catch(() => { if (alive) { setToken(''); setKeyChecked(true); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => () => { pairing.current?.abort(); checking.current?.abort(); }, []);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    checking.current = controller;
    setStatus({ kind: 'checking' });
    checkDesktop({ enabled: true, baseUrl: desktop.baseUrl }, token!, companionFetch, controller.signal)
      .then(async capabilities => {
        setStatus({ kind: 'online', detail: `${capabilities.tools.length} ${capabilities.tools.length === 1 ? 'tool' : 'tools'} available` });
        const next = { ...desktop, name: capabilities.computer || desktop.name, teammateName: capabilities.teammate?.name || desktop.teammateName, ...(capabilities.fingerprint ? { fingerprint: capabilities.fingerprint } : {}) };
        if (next.name !== desktop.name || next.teammateName !== desktop.teammateName || next.fingerprint !== desktop.fingerprint) await app.commitAssistant(state => ({ ...state, desktop: { ...state.desktop, ...next } }));
      })
      .catch(unknown => { if (!controller.signal.aborted) setStatus({ kind: 'offline', detail: pairingMessage(unknown) }); })
      .finally(() => { if (checking.current === controller) checking.current = null; });
    return () => controller.abort();
  }, [connected, token, desktop.baseUrl]);

  useEffect(() => {
    const raw = app.pairingLink;
    if (!raw) return;
    app.setPairingLink(null);
    const link = parsePairingLink(raw);
    if (!link) { setError(failureMessage('code', 'That link is not a desktop pairing link.')); return; }
    void begin({ address: link.origin, code: link.code, fingerprint: link.fingerprint });
  }, [app.pairingLink]);

  const begin = async (input: { address: string; code: string; fingerprint?: string }) => {
    if (pairing.current) return;
    setError(null); setNotice('');
    if (!input.code) { setError(failureMessage('code')); return; }
    if (!input.address.trim()) { setError(failureMessage('unreachable', 'Enter the address shown on your computer.')); return; }
    try { desktopOrigin(input.address); }
    catch { setError(failureMessage('unreachable', 'Enter the HTTPS address shown on your computer, including the port.')); return; }
    if (isLoopbackAddress(input.address)) { setError(failureMessage('unreachable', 'A phone cannot reach 127.0.0.1. Use the Wi-Fi address shown on the computer.')); return; }
    const controller = new AbortController();
    pairing.current = controller;
    setStage('contacting');
    try {
      const result = await pairDesktop({
        address: input.address.trim(), code: input.code, fingerprint: input.fingerprint,
        deviceName: phoneDeviceName(app.state.settings.name, Platform.OS), platform: Platform.OS, signal: controller.signal, transport: companionFetch,
        onStage: next => setStage(next),
      });
      await putKey(ASSISTANT_SECRET_IDS.desktop, result.token);
      try { await app.commitAssistant(state => ({ ...state, desktop: { enabled: true, baseUrl: result.baseUrl, ...result.metadata } })); }
      catch (problem) {
        await selfRevokeDesktop(result.baseUrl, result.token, companionFetch, new AbortController().signal).catch(() => {});
        await putKey(ASSISTANT_SECRET_IDS.desktop, '');
        throw problem;
      }
      setToken(result.token); setCode(''); setAddress(result.baseUrl); setScanOpen(false);
      setNotice(`Connected to ${result.metadata.name}. Tools from this computer are now available in chat.`);
    } catch (unknown) {
      if (controller.signal.aborted) setNotice('Pairing stopped.');
      else if (unknown instanceof PairingError && unknown.failure === 'cancelled') setNotice('Pairing stopped.');
      else setError(failureMessage(pairingFailure(unknown), pairingMessage(unknown)));
    } finally {
      if (pairing.current === controller) pairing.current = null;
      setStage(null);
    }
  };

  const scan = async () => {
    setScanNotice('');
    if (!permission?.granted) {
      const result = await requestPermission().catch(() => null);
      if (!result?.granted) { setScanOpen(true); return; }
    }
    setScanOpen(true);
  };
  const scanned = (data: string) => {
    if (pairing.current) return;
    const link = parsePairingLink(data);
    if (!link) { setScanNotice('That is not a desktop pairing code. Use the code shown in the computer’s Settings.'); return; }
    setScanOpen(false);
    void begin({ address: link.origin, code: link.code, fingerprint: link.fingerprint });
  };
  const pasteLink = async () => {
    const raw = await Clipboard.getStringAsync().catch(() => '');
    const link = parsePairingLink(raw.trim());
    if (!link) { setError(failureMessage('code', 'Copy the pairing link from the computer first, then tap paste again.')); return; }
    setAddress(link.origin); setCode(formatPairingCode(link.code)); setError(null);
    setNotice('Pairing link read. Tap “Send pairing request” to continue.');
  };
  const checkAgain = async () => {
    if (!token || !desktop.baseUrl || checking.current) return;
    const controller = new AbortController();
    checking.current = controller;
    setStatus({ kind: 'checking' });
    try {
      const capabilities = await checkDesktop({ enabled: true, baseUrl: desktop.baseUrl }, token, companionFetch, controller.signal);
      setStatus({ kind: 'online', detail: `${capabilities.tools.length} ${capabilities.tools.length === 1 ? 'tool' : 'tools'} available` });
    } catch (unknown) { if (!controller.signal.aborted) setStatus({ kind: 'offline', detail: pairingMessage(unknown) }); }
    finally { if (checking.current === controller) checking.current = null; }
  };
  const disconnect = async () => {
    setWorking(true); setNotice('');
    let remoteFailed = false;
    try {
      if (token && desktop.baseUrl) await selfRevokeDesktop(desktop.baseUrl, token, companionFetch, new AbortController().signal).catch(() => { remoteFailed = true; });
      await putKey(ASSISTANT_SECRET_IDS.desktop, '');
      await app.commitAssistant(state => ({ ...state, desktop: { enabled: false, baseUrl: '' } }));
      setToken(''); setStatus({ kind: 'idle' }); setConfirmDisconnect(false);
      setNotice(remoteFailed ? 'Disconnected on this phone. The computer could not be reached; remove this phone there if it still appears.' : 'Desktop disconnected. Phone tools still work independently.');
    } catch { setNotice('Could not disconnect. Check device storage and try again.'); }
    finally { setWorking(false); }
  };
  const toggleEnabled = async (enabled: boolean) => {
    try { await app.commitAssistant(state => ({ ...state, desktop: { ...state.desktop, enabled } })); }
    catch { setNotice('Could not update the desktop connection.'); }
  };
  const forgetBroken = async () => {
    await putKey(ASSISTANT_SECRET_IDS.desktop, '').catch(() => {});
    await app.commitAssistant(state => ({ ...state, desktop: { enabled: false, baseUrl: '' } })).catch(() => {});
    setToken(''); setNotice('Saved pairing details removed from this phone.');
  };

  const pairingStatus = stage ? <View style={s.notice}><View style={s.hstack}><ActivityIndicator color={t.accent} /><Text style={s.label}>{STAGE_TEXT[stage]}</Text></View><Text style={s.caption}>Approve “{phoneDeviceName(app.state.settings.name, Platform.OS)}” on the computer. Only this screen receives the key.</Text><Button title="Cancel pairing" secondary onPress={() => pairing.current?.abort()} /></View> : null;
  const failure = error ? <View style={[s.notice, { borderWidth: StyleSheet.hairlineWidth, borderColor: t.danger }]}><Text accessibilityRole="alert" style={s.error}>{error.message}</Text>{!!FAILURE_HINT[error.failure] && <Text style={s.caption}>{FAILURE_HINT[error.failure]}</Text>}<Button title="Try again" secondary onPress={() => { setError(null); setNotice(''); }} /></View> : null;

  const connectedView = (
    <>
      {pairingStatus}
      {failure}
      <View style={s.notice}>
        <View style={s.spread}>
          <Text style={s.label}>{desktop.name || 'This computer'}</Text>
          <Text style={[s.tiny, { color: status.kind === 'online' ? t.accent : t.muted }]}>
            {status.kind === 'checking' ? 'Checking…' : status.kind === 'online' ? 'Connected' : status.kind === 'offline' ? 'Not reachable' : 'Paired'}
          </Text>
        </View>
        <Text style={s.caption}>{status.detail || `${desktop.teammateName || 'Desktop teammate'} runs requests on this computer.`}</Text>
      </View>
      <Section title="This phone">
        <Group>
          <Row title="Use desktop tools" subtitle={desktop.enabled ? 'Chat can delegate work to this computer' : 'Paired, but desktop tools are switched off'} right={<Switch accessibilityLabel="Use desktop tools" value={desktop.enabled} onValueChange={enabled => void toggleEnabled(enabled)} trackColor={{ true: t.accent, false: t.elevated }} thumbColor={t.text} />} divider />
          <Row title="Teammate" subtitle={desktop.teammateName || 'Not reported'} icon="people-outline" divider />
          <Row title="Computer address" subtitle={desktop.baseUrl} icon="desktop-outline" />
        </Group>
        <Text style={s.caption}>Every computer action keeps its own approval. Stop in chat cancels the remote request as well.</Text>
      </Section>
      {!!desktop.fingerprint && <Section title="Certificate fingerprint"><Text selectable style={[s.tiny, styles.fingerprint]}>{desktop.fingerprint}</Text><Text style={s.caption}>This phone checks the computer against this fingerprint before using the connection.</Text></Section>}
      <Group>
        <Row title="Check connection" subtitle="Refresh the computer’s status and teammate" icon="refresh-outline" divider onPress={() => void checkAgain()} />
        <Row title="Disconnect this phone" subtitle="Removes this phone’s key from the computer" icon="unlink-outline" danger onPress={() => setConfirmDisconnect(true)} />
      </Group>
    </>
  );

  const brokenView = (
    <View style={s.notice}>
      <Text style={s.label}>This phone no longer has its pairing key</Text>
      <Text style={s.caption}>Browsers keep pairing keys only for the current tab. Remove the saved details, then pair with a new code.</Text>
      <Button title="Remove saved details and pair again" secondary onPress={() => void forgetBroken()} />
    </View>
  );

  const pairingView = (
    <>
      <Section title="Connect to your computer" note={`Pairing lets chat ask your computer to run work with its files and tools. The computer must show a code, and you approve this phone there within ${Math.round(config.pairingApprovalMs / 60000)} minutes.`}>
        <Button title="Scan code from computer" loading={stage !== null && stage !== 'waiting' && stage !== 'verifying'} disabled={!!stage} onPress={() => void scan()} />
        <Button title="Paste pairing link" secondary disabled={!!stage} onPress={() => void pasteLink()} />
      </Section>
      <Section title="Or enter the code">
        <Field label="Computer address" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://192.168.1.20:8443/v1/ankita-companion" editable={!stage} />
        <Field label="Pairing code" value={code} onChangeText={value => setCode(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={9} placeholder="ABCD-EFGH" editable={!stage} />
        <Button title="Send pairing request" secondary loading={!!stage} disabled={!code.trim() || !!stage} onPress={() => void begin({ address, code })} />
      </Section>
      {pairingStatus}
      {failure}
      {!!notice && <Text accessibilityRole="alert" style={s.caption}>{notice}</Text>}
      <Section title="Before you pair" note={FIREWALL_NOTE}>
        <Group>
          <Row title="1 · Save the certificate" subtitle="On the computer: Settings → Phone → Save certificate" icon="document-outline" divider />
          <Row title="2 · Trust it on this phone" subtitle={Platform.OS === 'ios' ? 'Open the saved file, install the profile, then enable it in Certificate Trust Settings' : 'Settings → Security → Encryption & credentials → Install a certificate → CA certificate'} icon="shield-checkmark-outline" divider onPress={() => void Linking.openSettings().catch(() => {})} />
          <Row title="3 · Show a code" subtitle="On the computer: Settings → Phone → Pair a new phone" icon="keypad-outline" />
        </Group>
        <Text style={s.caption}>The code itself is not a password for later use. It expires, works once and can only be approved on the computer.</Text>
      </Section>
    </>
  );

  return (
    <View style={s.flex}>
      <Header title="Desktop connection" back={() => app.navigate('settings')} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {connected ? connectedView : keyChecked && !!desktop.baseUrl ? brokenView : pairingView}
      </ScrollView>
      <SheetModal visible={scanOpen} close={() => setScanOpen(false)}>
        <Pressable accessibilityLabel="Dismiss scanner" style={s.flex} onPress={() => setScanOpen(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Header title="Scan pairing code" right={<IconButton name="close" label="Close scanner" onPress={() => setScanOpen(false)} />} />
          <View style={styles.scannerBody}>
            {permission?.granted
              ? <View style={styles.camera}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={stage ? undefined : result => scanned(result.data)} /></View>
              : <View style={s.notice}><Text style={s.body}>{permission?.canAskAgain === false ? 'Camera access is off for Ankita. Turn it on in your phone settings, or enter the code instead.' : 'Camera access is needed to scan the code shown on your computer.'}</Text><Button title={permission?.canAskAgain === false ? 'Open phone settings' : 'Allow camera'} onPress={() => void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(() => {})} /><Button title="Enter the code instead" secondary onPress={() => setScanOpen(false)} /></View>}
            {!!scanNotice && <Text accessibilityRole="alert" style={s.error}>{scanNotice}</Text>}
            <Text style={s.caption}>Point the camera at the code in Ankita on your computer. The long-lived key never appears in the code.</Text>
          </View>
        </View>
      </SheetModal>
      <SheetModal visible={confirmDisconnect} close={() => setConfirmDisconnect(false)}>
        <Pressable accessibilityLabel="Dismiss disconnect confirmation" style={s.flex} onPress={() => setConfirmDisconnect(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Header title="Disconnect this phone?" right={<IconButton name="close" label="Close confirmation" onPress={() => setConfirmDisconnect(false)} />} />
          <View style={styles.scannerBody}>
            <Text style={s.secondary}>This removes this phone’s key from {desktop.name || 'the computer'} immediately. Any request running from this phone is cancelled. You can pair again with a new code.</Text>
            <Button title="Disconnect phone" loading={working} onPress={() => void disconnect()} />
            <Button title="Keep connection" secondary disabled={working} onPress={() => setConfirmDisconnect(false)} />
          </View>
        </View>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  fingerprint: { lineHeight: 20, letterSpacing: 0.2 },
  scannerBody: { padding: SPACING.md, gap: SPACING.md },
  camera: { height: SCANNER_HEIGHT, borderRadius: RADIUS.card, overflow: 'hidden', backgroundColor: COLOR.background },
});
