# Changelog

## Unreleased

- Simplify the chat page to one left-aligned greeting, one muted question and one grouped list of three prompts that prepare editable drafts. Remove the framed presence portrait, the Memory/Tasks/Library pill row, the section eyebrow, per-card icon tiles and circled plus buttons; keep the privacy note and the full set of prompts on short phones.
- Remove the bottom Chat/History/Assistant/Settings bar. The conversation sidebar now carries Assistant, Teammates and Settings beside the dated chat list, so the composer meets the safe area with a single navigation affordance. Assistant gains a back control.
- Quiet the chat header and composer: ghost controls, a subtitle that reports the conversation title, `Working…` or `New conversation`, the model shown once in the composer, and no duplicate connected-app shortcut.
- Give tool activity, thinking, stopped and error states rounded surfaces with clearer actions, and keep the minimal transcript without repeated assistant labels.
- Keep the bordered profile card on Settings and Assistant, and correct Assistant hub counts to read naturally for one or many records. No behavior, permissions, storage or dependency changes.

## 2.0.1 - Provider recovery

- Retain browser credentials in tab storage through refresh, with memory-only fallback when storage is blocked. Keep keys out of app metadata and exports; native SecureStore is unchanged.
- Add the official editable Kilo gateway preset and a selected-model generation/native-tool test. Abort old tests when the model, endpoint or key changes.
- Classify HTTP, JSON and streamed provider errors into rate limit, quota, account access, client restriction and compatibility failures. Show safe actionable messages and relay Retry-After without forwarding private headers.
- Verify refresh and fresh-tab behavior, delayed model edits, quota/rate-limit/stream failures, phone layouts and actual assistant tools. Build signed Android version 2.0.1/code 4 with the existing signer.

Provider quotas, paid-model eligibility and client-only free routes remain provider-controlled. A successful model-list request does not prove generation access.

## 2.0.0 - Independent phone assistant

- Add real memory, task, note, imported-document, time/calculator and public research tools with a shared bounded OpenAI/Anthropic runtime.
- Add evidence-grounded memory, explicit pins, search/edit/forget and background review-only suggestions without a foreground memory request.
- Add persisted tool receipts, per-tool permissions, global approvals, denial/Stop and persistence-before-success transactions.
- Add selected text/PDF/image attachments, native local date controls, real OS reminder adapters, JSON export/clear/reset and an Assistant phone workspace.
- Add authenticated optional desktop Agent delegation, nested approvals, owned events/cancellation, explicit configuration and TLS-required LAN listening.
- Bound optional connected-app discovery and ignore late catalogs; preserve existing chat/data/package/storage/signing identity. Advance Android code and iOS build number to 3.
- Add behavioral/HTTP and production/development UI checks. Physical notification delivery, upgrades, native frame time, paid accounts and iOS signing remain unchecked.
- Use Expo-compatible native dependencies; patch source-map-js and document remaining unpatched braces/node-forge audit findings.

## 1.1.0 — Ankita phone redesign

- Rework every active screen around the desktop graphite palette, native typography, small teammate mascots and simpler rows. Rebrand the app and delivery APK as Ankita while retaining the existing package, deep link, storage and signing identity.
- Add thumb-reachable Chat, History and Settings navigation, a docked composer, model/app shortcuts and editable starter drafts.
- Keep bounded, session-only drafts independently for each teammate and conversation across screen changes.
- Virtualize the transcript, memoize completed replies and keep long code inside its message. Remove custom display-font loading from startup.
- Add native working-mascot motion and rolling actual tool/activity labels; share reduced-motion and foreground preferences across transitions and feedback.
- Replace teammate cards with face-led rows, constrain long names, add two-line history previews and make appearance previews fit narrow phones.
- Share keyboard-aware, safe-area-aware sheets across providers, model selection, teammate editing, history and privacy. Remove browser input focus frames.
- Extend live verification with bottom navigation, unsent-draft retention/isolation, all settings sections at 320 pixels, large text, long names/code, a 240-message transcript and reduced motion. Separate cold development compilation from ordinary action deadlines.
- Preserve streaming, cancellation, configured providers, personal instructions, native secure keys and real Composio tool continuation. No dependency changes.

## 1.0.0 — mobile completion

### Interface

- Complete dark-first onboarding, chat, conversation library, provider configuration, profile, personal instructions, appearance, privacy and About.
- Bundle Manrope regular/medium/semibold and Sora display fonts for offline native use.
- Frosted composer and onboarding surface, explicit content layering, branded artwork, setup progress and larger reading hierarchy.
- Compact slide-over conversation sidebar with 44dp session rows, local-date grouping, full-message search, pinned chats, current-chat highlight and rename/delete options.
- Minimal empty chat, quieter teammate selector, tighter reply spacing and actual thinking/writing/tool progress with reduced-motion support.
- Teammate creation and editing with independent name, role, instructions, provider and model; conversation ownership survives switching and reload.
- Compact assistant layout, global dark/light/system appearance, four accents and larger text.
- Button press feedback and navigation transitions that honor reduced-motion preferences.
- Chief application icon and responsive narrow-phone, phone and desktop layouts.

### Providers and chat

- Configurable OpenAI-compatible, Anthropic and compatible Chief-server transports; editable endpoints and model discovery without invented model IDs.
- Stream replies incrementally; Stop aborts transport and preserves partial text; retries, copy, share and transcript export.
- Same-origin development/preview relay resolves provider model and chat CORS failures. Native requests remain direct.
- Relay requires a same-origin, loopback session; rejects redirects, unsupported routes, oversized bodies and invalid session tokens.
- Bound relay discovery and make caller cancellation immediate; stop reading after provider completion even when its socket remains open.
- Invalidate pending model discovery when endpoint or key changes, preventing stale model lists and false success notices.
- Restore saved provider fields and cached model catalogs without refetching; late key reads cannot overwrite edited keys.
- Compose personal and teammate instructions into the actual system message for OpenAI-compatible and Anthropic requests.
- Migrate the former default prompt so it cannot override a custom teammate's identity.
- Composio key setup, app catalog/search/pagination, enabled app selection, account linking/status, secure key removal and a bounded LLM tool execution loop that continues with tool results.
- Stop interrupts stalled tool execution; unavailable tools are rejected and HTTP 429 responses do not trigger automatic retries.
- Bound provider and Composio JSON responses before parsing, validate schemas and reject insecure account links.
- Refresh Composio account status across all catalog pages, with repeated-cursor and page limits.
- Treat cut-off streams as errors; avoid showing remote error bodies or credentials in UI.

### Storage and reliability

- Typed conversation/settings persistence and restore validation; interrupted responses restore as stopped.
- API keys use native SecureStore; browser keys remain in memory and are never exported with conversations.
- Scope generation updates to the original conversation while navigating.
- Deleting a provider clears dependent teammate bindings; deleting an inactive teammate preserves another teammate's running reply.
- Replace empty-string JSX guards that caused React Native Web raw-text warnings.
- Separate transcript and empty-chat layouts so delayed web content measurements cannot call a removed onContentSizeChange callback.
- Use web-compatible animation drivers and style-based pointer events to remove development warnings.
- Upgrade Expo scaffold and remove ambient type stubs so real native types are checked.
- Workspace-local Android tooling from official archive metadata with checksum verification; reproducible APK build helper.
- Scoped UUID override removes audited vulnerability while preserving xcode's used API.
- Persist a Windows C++ compiler driver workaround through an Expo config plugin; DOS short compiler filenames otherwise lose C++ runtime linking.
- Make APK build memory budgets configurable; raise the class-metadata allowance after reproducing an Expo release-lint Metaspace exhaustion.
- Deliver an APK with a persistent private release signing identity, signature/manifest/content inspection and a shared SHA-256 helper that avoids broken PowerShell module autoload.

### Verification

- Behavioral tests include real HTTP streaming, cancellation, completion, safe errors, browser relay isolation and history grouping.
- Automated browser round trip uses a CORS-less HTTP provider and captures UI screenshots.
- See `docs/mobile-verification.md` for exact final results and unverified native paths.
