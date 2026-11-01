# Persistent work and delivery

Ankita 2.1 adds a saved work queue, reconnect recovery, incoming-share review, ranked memory recall, editable finished files and a completion inbox. Management remains under the sidebar's single **Settings** button. Chat has a clock button for persistent work and contextual result cards.

## Start your worker

Use Node 24 or newer in this project:

```powershell
npm run work:server
```

The default worker is `http://127.0.0.1:4174`. Its private pairing key is in `.build-tools/work/pairing.json`; open that file locally and paste its `token` into **Settings → Work & recovery**. The launcher prints the file location, never the key. The browser preview uses its authenticated server relay; static hosting alone cannot provide this relay.

Loopback is for this PC. A phone needs a reachable HTTPS origin with a certificate its operating system trusts. You can run the worker on a trusted server, use a properly configured TLS reverse proxy, or pass your own certificate and private key:

```powershell
npm run work:server -- --host 0.0.0.0 --port 4174 --cert C:\certs\fullchain.pem --key C:\certs\private-key.pem
```

The worker refuses a second process using the same data directory. If power loss leaves `work.lock`, stop/verify all worker processes before manually removing that lock; normal shutdown releases it. Preserve the encrypted state and key.

Enter the actual HTTPS origin on the phone, not `0.0.0.0` or its own `127.0.0.1`. No cloud account, tunnel, DNS record or push credentials are configured by this change. Keep the PC/server and worker process running. Use one worker process per data directory. Protect that folder with your operating system account permissions. Back up `state.enc` and `vault.key` together: the AES-GCM encrypted work state cannot be recovered without its key. Pair only a machine you trust with request context, selected content and provider credentials.

## Queue and recover

1. Choose an OpenAI-compatible or Anthropic provider and a model in Settings.
2. Write a request, optionally select files, and press the clock button. Review the worker address and transmitted content, then choose **Queue persistent work**.
3. The app saves the request and conversation reference before submission. A queued request waiting on a connection starts after reconnecting. A worker-acknowledged request continues when the phone closes.
4. Reopen Ankita to recover the saved result and files. Work cards show progress, connection errors, cancellation and resume actions. Restarted in-flight work requires explicit **Resume work** from its last checkpoint.

Completed tool results and output identities survive restart. Uncommitted reads or provider calls can be repeated after interruption; provider billing is outside Ankita's control. This worker advertises research, arithmetic and output creation only. Existing foreground phone/connected-app tools retain their separate approval flow. Persistent work does not replay external sends or purchases.

Cancel saves a stop request before contacting the worker; an offline worker must reconnect before stopping is confirmed. A result already completed on the worker remains completed. Storage failure pauses execution and requires storage repair and worker restart. Saved checkpoints remain available; unsaved provider text cannot be promised recovered.

Removing a finished/cancelled work record deletes that job on the connected worker and this device, while preserving its conversation and saved outputs. A device reset only removes local data and keys: stop/remove remote work first if you also want worker copies deleted. Exported files and previously sent pushes remain outside the reset.

## Share into Ankita

The native build registers text, links, Markdown/CSV/JSON, supported images and PDF share targets, including multiple items. Incoming content first enters a durable review inbox. **Save to library** and **Add to current draft** are explicit actions; neither sends a message nor creates a personal memory. Shared URLs are saved as inert content without automatically opening them. Existing draft text is preserved. Imports enforce file signatures and bounded sizes, with retry/dismiss errors instead of silent loss.

See [incoming-sharing.md](incoming-sharing.md) for platform limits, the Android SDK's single `.txt` stream limitation, iOS provisioning and the browser GET text/link adapter. Unsupported document/media types are not converted automatically. Native OS share-sheet behavior needs device testing; browser acceptance does not establish native behavior.

## Memory and finished files

Memory retrieval ranks saved facts against the current request, ignores common conversational words, preserves exact numbers and evidence, and bounds the prompt context. **Memories used** opens the current fact and its original source words; forgotten records are no longer displayed there. This is local lexical ranking with limited synonym matching, not an embedding service.

The output creation tool produces editable documents, tables, checklists, calendar events and JSON. Find them in **Settings → Finished outputs**, or beside the reply that created them. Preview/edit before exporting actual Markdown, text, safe HTML, CSV, JSON or ICS files. Checklists save their checked state. Native export opens the OS file share sheet after writing/read-verifying the file; browser export downloads a file. PDF generation and confirmation that a recipient received an export are not supplied.

## Completion notifications

The persisted notification inbox works even with alerts disabled. In the installed phone app, enable **Completion notifications** to request OS permission, and use **Test notification**. Local fallback alerts happen when Ankita reconnects; they cannot wake a closed phone app to run work.

Closed-app pushes require your real Expo project ID, an appropriately built application, APNs/FCM credentials and device permission. Configure those in your own Expo project/build, then register the project ID in Work & recovery. No demo project ID or fabricated token is installed. The server keeps a durable push outbox, bounded retries for definite rejection, genuine tickets/receipts and explicit failure/unknown states. Unknown send outcomes are not automatically resent. Push retries never rerun AI work.

Push text hides the request/result. Tapping a valid alert opens the actual saved conversation or work record. Service acceptance and platform receipts do not prove display on a device. Browser background notifications are unavailable. Real push registration/display, Android cold/warm OS shares and iOS signing/extensions remain physical-device acceptance checks.

Disabling notifications clears local work alerts immediately. If the worker is offline, push revocation remains saved and visibly pending until reconnecting. Remote alerts can still arrive before revocation succeeds; previously accepted pushes cannot be recalled.

## Verification commands

```powershell
npm run typecheck
node --test --test-concurrency=1
npm run build:web
node scripts/verify-pocket-work.mjs
node scripts/verify-assistant.mjs
node scripts/verify-redesign.mjs
```

`verify-pocket-work` uses real local HTTP provider/worker/relay fixtures: it pairs, preserves a draft, closes the renderer during execution, recovers once, inspects recalled source evidence, edits and reads back a CSV download, previews/attaches shared content and checks 320/390/1024 layouts.
