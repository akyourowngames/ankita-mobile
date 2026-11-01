# Complete Chief mobile Implementation Plan

> For agentic workers: execute inline with superpowers:executing-plans. One
> fresh-context review at the end; no independent implementation agents.

**Goal:** Finish the existing Expo app with functional chat and complete setup/settings.
**Architecture:** Typed local state and storage adapter; protocol-specific provider
transport; shared theme and UI primitives; compact screens using native components.
**Tech Stack:** Expo 57, React Native, TypeScript, AsyncStorage, SecureStore, vector icons.
**Spec:** `docs/mobile-design.md`.

## Global constraints

- All colors/spacing/operational limits are centralized; no production fixture URLs.
- No saved plaintext keys in ordinary storage or exported transcripts.
- No simulated response or status in product UI.
- Current project is not a Git repository; no commit/push/release claim.

## Review focus

1. Stop or navigation during streaming must not write into another conversation.
2. Provider edit/test errors must not leak keys or persist them in ordinary storage.
3. Corrupt saved state must not crash startup or silently erase its original data.
4. One-time web keys disappear on reload, and UI must explain reconnecting.
5. Keyboard/safe-area/long messages must not hide composer controls.

## Task 1 — tested state and provider transport

- [x] Add failing behavioral tests in `test/mobile.test.mjs`.
- [x] Implement `src/core/state.ts`, `src/api/protocol.ts`, storage/secrets adapters.
- [x] Use shared constants and provider registry; no guessed local host/model.
- [x] Run state/stream/cancellation tests; confirm real native typecheck.

## Task 2 — complete interface

- [x] Shared theme, primitives and global appearance context.
- [x] Onboarding and profile; chat with history and streaming Stop/retry/share.
- [x] Provider editor/test/discovery and picker; settings/appearance/privacy/About.
- [x] Compact 44dp sidebar, minimal empty chat, teammate creation/editing, saved model catalogs and combined system instructions.
- [x] Composio setup/catalog/connections and bounded LLM tool execution with continuation, cancellation and key removal.
- [x] Check narrow-phone and wide-web layouts, light/dark appearance and streamed transcripts in the browser loop.
- [ ] Check the native keyboard, device SecureStore and Android blur on a physical phone.

## Task 3 — verification and delivery

- [x] HTTP fixture and browser loop through onboarding, provider configuration,
  streamed chat, Stop, retry, persistence, history, theme and deletion.
- [x] Fresh-context review; regressions for important findings and fixes.
- [x] Full suite (33/33), typecheck, audit (0 vulnerabilities); production web and Android/iOS bundle exports.
- [x] Document build commands, signed Android APK, signature/content/hash evidence and native verification limits.
