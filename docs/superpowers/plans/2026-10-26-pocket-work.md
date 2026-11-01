# Pocket assistant work implementation plan

**Goal:** Deliver persistent work and recovery, incoming shares, relevant memory retrieval, useful exported outputs, and completion notifications while preserving the single Settings entry and current chat/tool flows.

**Architecture:** Keep foreground phone tools independent. Add an authenticated, durable Node worker usable on the user's PC or trusted HTTPS server for work that must survive phone closure. Persist request identities, queue state, checkpoints, approvals/results and delivery acknowledgements before reporting success. Add native sharing through the installed Expo Sharing incoming-share API, bounded local retrieval, typed output records and export adapters. The phone reconciles work by stable IDs and maintains a notification inbox; native push is supported when a real Expo/FCM project is configured, without claiming delivery before an actual service response.

**Tech stack:** Existing Expo 57 / React Native / TypeScript, installed Expo Sharing/FileSystem/Notifications, Node HTTP/fs/crypto and existing provider protocol. No new dependencies by default. No deployment or publishing requested.

## Constraints and rulings

- Existing folder has no git repository. Work directly in it, preserve package/deep-link/storage/signing identity and current UI. Do not edit desktop checkout.
- User authorized implementing all five areas. Execute continuously; implementation choices are recorded here rather than introducing approval pauses.
- Node worker requires a running PC/server. Phone-only suspended JavaScript cannot promise durable work. Native push needs actual platform/project credentials; surface setup and delivery failures truthfully.
- Persistent worker initially advertises read/research/calculation/output tools. Do not silently replay third-party sends, purchases or mutations after crashes. Foreground phone tools retain existing approvals.
- User-selected shared data is previewed before provider transmission. Never turn shared/web/file content into trusted personal memory.
- Keep all new management under Settings; contextual cards and composer controls may expose the current work or output. No added bottom/top app navigation.

## Interfaces / file ownership

1. **Memory retrieval:** `src/assistant/retrieval.ts`, `src/assistant/records.ts` search delegation, `src/core/assistant.ts`, new `src/components/MemoryRecall.tsx`, retrieval tests. Owner: memory implementer. `assistantPrompt(settings, teammate, assistant?, query?)` remains backwards compatible. Expose `retrieveMemories(memories, query, options?)` and `buildMemoryContext(assistant, query)` with bounded prompt and IDs. Parent integrates current query and message provenance.
2. **Incoming sharing:** `src/sharing/*`, `src/components/ShareInbox.tsx`, sharing tests, Expo Sharing plugin instructions. Owner: share implementer. Component uses existing AppContext and ComposerDrafts; parent mounts it. Use installed incoming APIs without automatically resolving/fetching URLs. Durable inbox deduplicates cold/warm launches; retain payload until successful save/attachment or explicit dismissal. Parent owns app.json changes.
3. **Finished outputs:** `src/assistant/outputs.ts`, `src/components/OutputCard.tsx`, `src/components/OutputLibrary.tsx`, `src/outputs/*`, output tests. Owner: outputs implementer. Parent owns shared types: `AssistantState.artifacts: OutputArtifact[]`; parent imports exported `OutputArtifact` from outputs module. Export pure create/restore helpers and `createOutputTool` adapter contract or exact tool schema for parent. Native/web export real files; no HTML script execution, external-resource loading, path traversal, misleading extension or unverified PDF claim. Contextual output cards allow preview/edit/save/share/delete.
4. **Durable worker and client:** parent owns `server/work-*`, `scripts/work-server.mjs`, `src/work/*`, `src/core/AppContext.tsx`, `src/core/state.ts`, assistant types/init/restore/privacy, tool registration, transport, settings and App mounting. Job state is separate from foreground busy state. Submit idempotency, reconnect, cancel, manual resume and durable result delivery never duplicate completed outputs or transcript entries.
5. **Notification delivery:** parent owns notification adapter/settings/inbox and worker push outbox. Permission requested explicitly, privacy-preserving notification text, deep links to actual jobs/chats, persistent delivery identities, retry only notification delivery, clear/disable/revoke behavior. No duplicate alerts on polling/reload. Browser unsupported states remain honest.
6. **Integration and shipping verification:** parent integrates all modules; run focused RED/GREEN tests, typecheck, full serial Node suite, production browser share/recovery/output/notification flows and existing mobile/assistant flows. Export native bundles and build/inspect Android artifact if local toolchain works. Physical-device and real push-account limits must remain explicit.

## Execution checklist

- [x] Retrieval: regression tests for noisy query words, exact numbers, diacritics, relevant ranking, corrections, provenance, bounded deduplicated pins and recalled context.
- [x] Sharing: installed API contracts, durable payload/replay tests, text/URL/image/PDF/multiple items, unsupported/oversize errors, cancellation and duplicate protection. Draft preservation and no automatic network/send. Physical OS share-sheet checks remain unverified.
- [x] Outputs: validated typed records, idempotent IDs, safe export formats/filenames, edit/preview/share/restore/delete; model tool wired to actual records.
- [x] Work: durable queue, authenticated API, encrypted secrets, bounded tools/provider requests, checkpoints, restart/reconnect, cancellation, deduplicated completion, structured failures and settings/UI.
- [x] Notifications: permission/registration, outbox retries and service receipts, native/browser delivery adapter, click routing, privacy text, offline revocation and test action. Real project/platform credentials and physical delivery acceptance remain external setup.
- [x] Final review, integrated tests, release documentation, production web/Android/iOS bundle export and native configuration inspection.
- [ ] Signed APK packaging and device acceptance: blocked by the restricted Gradle environment; exact evidence and preserved prior artifacts are recorded in docs/pocket-work-progress.md.

## Review focus

| Shared boundary | Check |
| --- | --- |
| Retrieval -> assistant prompt | Current user message is supplied, evidence never becomes system instruction, bounded size. |
| Share -> library/draft | Only explicit user action commits; errors retain inbox; imports respect existing MIME/size limits. |
| Outputs -> assistant state/tools | Parent adds schema migration before integration; stable IDs permit recovery without duplicates. |
| Work -> state/delivery | Receipt persisted before acknowledgement; missing/deleted chats handled, late results cannot resurrect reset data. |
| Notifications -> job completion | Notification retries never rerun work; identifiers survive restart and secrets are absent from visible payloads. |

Progress and verification evidence are tracked in `docs/pocket-work-progress.md`.
