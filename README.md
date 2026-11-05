# Ankita mobile

Ankita 2.0 is an independent phone assistant with persistent memory, tasks, notes, selected documents and real model tools. It keeps the graphite phone layout, teammate mascots, quiet motion and virtualized chat. Phone tools work without a PC or a Composio account.

Chat is the only root screen; the sidebar drawer opens saved conversations, Assistant and Settings, so no bottom tab bar competes with the composer. Teammates keep separate conversations and unsent drafts; personal memory is shared across them. Motion respects reduced-motion settings and background state. Actual tool activity rolls through the chat; tap it to inspect arguments, status and results.

## Run in your browser

From this project folder:

```powershell
npm ci
npm run build:web
npm run serve:web
```

Open the address printed by the server (default: `http://127.0.0.1:4173`) and keep that terminal running. Use the browser device toolbar for a phone-width preview. For development use `npm run web`. Restart any server that was running before this update.

The preview relay runs only on this computer and requires an app same-origin session. Provider, public-research and paired-companion traffic use separate routes. Do not expose the preview server publicly. Native requests go directly to configured services.

## Set up the assistant

1. Open **Settings → AI providers**. Use **Kilo AI Gateway** or another OpenAI-compatible/Anthropic endpoint, key and tool-capable model. Find models, select one, then use **Test selected model** to check actual generation and native tool calling. Discovery alone does not prove access; free routes still have upstream limits.
2. Open **Assistant** for Memory, Tasks, Library and Tools & permissions. Search, edit and remove real local records.
3. Try “Calculate (12 + 8) * 3”, “Save a task to book the dentist”, or “Remember that I prefer concise answers.” Review the approval before a change. Success is shown only after the tool and persistence complete.

The compatible Chief-server provider remains a text-only backend. It cannot execute phone model tools or selected PDF/image inputs; select a compatible provider or turn phone tools off for that backend.

Native credentials use Expo SecureStore. Browser keys are saved in this browser profile and survive restarts. Older tab-only keys migrate when read. Any script on this origin and other people using this browser profile can access browser keys. Blocked browser storage falls back to memory and requires re-entry after a restart. Keys are kept separately from saved app state and excluded from conversation exports. Migration preserves existing chats, providers, teammates, cached models, storage/package/deep-link IDs and Android signing identity.

Kilo uses `https://ai-gateway.kilo.ai/api/v1`. Existing saved providers using the former Kilo root upgrade automatically. You can cancel a connection or model check while keeping entered details. Browser checks recover after a temporary app-server failure or restart. See the [Kilo API reference](https://kilo.ai/docs/gateway/api-reference).

## Memory and permissions

Add facts manually or ask Ankita to remember them. Model-created memories include an exact quote from your message. Pin up to 12 useful facts for every conversation; long pins use their first 160 characters with a total prompt budget. Other memories are recalled through tools.

Optional background suggestions use a separate tools-disabled request after your reply. They inspect only a bounded portion of your current message and require quoted evidence. Review **Remember this** or **Dismiss** in Memory. Suggestions are never auto-pinned. New foreground work, backgrounding and reset cancel pending extraction. Suggestions can incur a separate provider request; switch them off in Memory if unwanted.

Stored-data changes, public web requests and connected-app actions ask by default. Set individual tools to Ask, Allow or Disabled under **Tools & permissions**. Stop cancels generation, pending approvals and remote requests, retaining partial replies and completed actions. Disabling tools keeps saved data. The runtime bounds rounds, calls, repeats and results.

## Documents, research and reminders

Import from Library or the chat attachment button. Only files explicitly selected through the system picker are accessible. UTF-8 text, Markdown, JSON and CSV become searchable text. Verified PDF/image bytes can be attached to a compatible vision model; binary import does not claim offline OCR. Limits: 1 MiB per file, 8 MiB total binary library content and three files per message. Unsupported, corrupt and oversized files fail clearly.

Public page reading works without a search key. Configure Brave Search or a public HTTPS SearXNG endpoint under **Web research** for actual sourced search. Login pages, private/local URLs and JavaScript-only pages are unsupported. The browser relay validates redirects and pins approved public DNS addresses. Native research uses Expo fetch and public-URL validation; platform DNS/redirect behavior still needs a device check. Web/file text is untrusted source material.

Tasks use a local date/time picker. Saving a date does not schedule a reminder. In the native app, open the task and select **Set phone reminder**. Permission is requested explicitly and the real OS notification ID is saved. Editing, completing, deleting or clearing tasks cancels their reminders. OS power policies can affect timing. Browser previews do not schedule alarms while closed.

## Optional desktop connection

The companion delegates bounded work to the **actual desktop Ankita Agent**, using its configured provider and built-in tools in a separate worker process. Phone tools and memory remain independent. It does not inherit desktop MCP sessions, the desktop window conversation or phone provider credentials.

From the mobile project folder:

```powershell
npm run desktop:companion -- --desktop-repo "<desktop checkout>" --workspace "<working folder>"
```

The desktop checkout needs its dependencies and provider already configured; Copilot must already be signed in. The companion loads normal desktop configuration, optionally overridden with `--config "<config.env>"`, and always retains approval gates. It prints a loopback address and the path to a private pairing file. Copy that file's `token` into **Assistant → Tools & permissions → Desktop connection**, enter the printed address and tap **Pair desktop**. Treat the token as a password; it is never printed in logs.

A browser on this computer can use loopback HTTP. A physical phone requires HTTPS with a certificate trusted by the phone:

```powershell
npm run desktop:companion -- --desktop-repo "<desktop checkout>" --workspace "<working folder>" --host "<computer interface>" --port "<chosen port>" --cert "<certificate.pem>" --key "<private-key.pem>"
```

There is no unauthenticated LAN mode or certificate bypass. Configure the network/firewall for that explicit address. Keep certificates, private keys and `.build-tools/companion/pairing.json` private. Revoke pairing by stopping the companion, removing its pairing file and restarting; reconnect using the new token. **Disconnect desktop** removes the phone credential.

The versioned protocol supports capabilities, owned runs, tool events, approvals and cancellation. One companion run executes at a time. Delegation asks first; individual computer mutations show the actual desktop preview. Stop cancels the remote request with bounded worker cleanup. Completed side effects remain completed.

## Connected apps and privacy

**Settings → Plugins** configures Composio, discovers apps and links accounts. Use the same Composio user ID as desktop for shared accounts. Optional catalog discovery has a deadline so offline services leave phone tools available. External calls use the same permissions, approvals and receipts.

**Settings → Privacy & data** exports assistant records as JSON, clears assistant data while keeping chats, exports conversations or resets everything. Assistant exports contain actual personal memories and documents: keep them private. Connection configuration and keys are excluded. Reset also clears native reminders and stored credentials.

## Android delivery and build

The internal-distribution artifact is [Ankita 2.1.1 for Android](https://github.com/akyourowngames/ankita-mobile/releases/tag/v2.1.1). Package `com.chief.mobile` and the private release signer are preserved for upgrades. See the [verification ledger](docs/mobile-verification.md) for actual checks and digest. Installation, upgrade and OS reminder delivery still need a physical phone.

`node scripts/prepare-android.mjs` prepares local JDK/SDK archives with official checksums. After native dependency/config changes, run `npx expo prebuild --platform android --no-install`, then:

```powershell
powershell -NoProfile -File scripts/build-apk.ps1
powershell -NoProfile -File scripts/verify-apk.ps1
```

The build uses one worker with configurable memory/ABI budgets and re-signs using the existing private identity. Back up `.build-tools/signing` securely; never distribute its keys/password metadata.

## Verification and limits

```powershell
npm test -- --test-concurrency=1
npm run typecheck
npm run build:web
npm run verify:ui
npm run verify:assistant
npm run verify:dev
npm run build:bundles
```

Browser checks use actual local HTTP provider/Composio/companion fixtures, system-picker imports and sourced public research. Tests also run the installed desktop Agent through HTTP, deny a file write, approve it and read the resulting contents. Paid-account behavior and physical phone performance are separate checks; iOS exports do not prove an iOS native build.

Run `npm audit` when dependencies change. Expo-compatible native versions and provenance were checked, and source-map-js was patched. The audit still reports 17 high findings propagated from unpatched braces/node-forge build dependencies. No vulnerable Expo downgrade was applied; this release does not claim a clean dependency-security audit.
