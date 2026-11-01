# Independent Ankita assistant implementation plan

> For agentic workers: use superpowers:executing-plans directly in this session.

**Goal:** Deliver the independent phone assistant described in the spec, with
real tools, persistent personal memory and an optional desktop companion.

**Architecture:** Keep the existing React Native provider/streaming shell. Add a
typed assistant store, one capability registry and approval-aware execution
contract; reuse it for local tools, Composio and the optional desktop adapter.
Persist compact receipts with each message and keep credentials in SecureStore.

**Tech stack:** Existing Expo 57/React Native/TypeScript, native Expo document and
notification APIs, Node test fixtures and Playwright. No guessed models/endpoints.

**Spec:** [mobile-assistant-spec.md](mobile-assistant-spec.md)

## Global constraints

- Preserve the graphite phone UI and existing package, storage and signing IDs.
- Run tests serially; read existing files before editing; use named config limits.
- This directory has no Git repository. Back up source; do not create a repository
  or publish/commit on the user's behalf. Original 1.1 artifacts remain available.
- Continue without staged approvals, honoring the user's whole-app instruction.
- Native packages must match the installed Expo compatibility manifest. Record
  security-check availability, provenance and audit evidence before installation.

## Review focus

- Corrupt assistant records must not erase old chat/provider state (Task 1).
- A denied tool in a multi-call response still needs its own model result (Task 2).
- Stop during approval or persistence must prevent a late mutation (Tasks 2/3).
- Web redirects/DNS/private hosts must not turn the relay into SSRF (Task 4).
- Background extraction must quote user evidence and avoid foreground latency
  and post-reset writes (Task 5).

## Task 1: Assistant records and upgrade migration

Files: `src/assistant/config.ts`, `records.ts`, `validation.ts`,
`src/core/state.ts`, `test/assistant-records.test.mjs`.

Interfaces: `emptyAssistantState()`, `restoreAssistantState(value)`, immutable
memory/task/library operations taking `{id, now}`; `memoryPrompt(state)` returns
bounded explicit pins. State gains `assistant`; legacy records migrate empty.

- [x] Write RED tests for legacy/corrupt state, evidence, dedup, limits, pins,
  task/note CRUD and interrupted receipts; execute them against missing behavior.
- [x] Implement the typed store and strict restore guards, then attach migration.
- [x] Run focused and existing state tests; record counts and source changes.

## Task 2: Capability registry and resilient tool runtime

Files: `src/assistant/tools.ts`, `schema.ts`, `calculator.ts`, `approvals.ts`,
`src/api/agentLoop.ts`, `toolCalls.ts`, `chiefClient.ts`, runtime tests.

Interfaces: `ToolSession.tools/execute`, `ToolRuntimeEvent`, registry policies,
`ApprovalQueue.request/resolve/cancel`; state access is injected, not OS-assumed.

- [x] Write RED tests for real local tools without Composio, invalid schemas,
  repeat/total limits, pairing, errors, approval denial/Stop and secret-safe output.
- [x] Implement built-in memory, task, note, time and safe calculator tools.
  Route enabled external tools through the same policy and receipt contract.
- [x] Harden the agent loop and run OpenAI/Anthropic HTTP round trips; serial suite.

## Task 3: App integration and phone management surfaces

Files: `AppContext.tsx`, `App.tsx`, chat/Settings/navigation components,
new assistant screens/components and browser verification script.

Interfaces: app actions persist store changes before success; approval overlays
remain reachable while switching screens; message receipts are conversation-owned.

- [x] Add live RED checks for memory/CRUD, a local model tool call, approval/denial,
  Stop, retained receipts, isolated teammates, privacy export/reset and layouts.
- [x] Add memory, tasks, library, tools and permissions screens; visible actual
  receipts and native approval sheets; integrate prompts and local tools.
- [x] Exercise reload and all changed surfaces in production and development.

## Task 4: Public web research, selected files and native reminders

Files: `src/assistant/web.ts`, import/reminder platform adapters, transport relay,
protocol multimodal support, app config/dependencies and integration tests.

Interfaces: bounded `readWebpage/searchWeb`, `pickDocument`, provider-specific
attachment mapping, `schedule/cancelReminder` with explicit permission outcomes.

- [x] Check compatible native packages and execute URL/redirect/private-host,
  oversized-file, unsupported-content and notification-denial RED tests.
- [x] Implement actual page/search transports, document picker and extraction/
  multimodal context, user-approved reminder scheduling and capability settings.
- [x] Verify real web/file browser fixtures and both provider wire contracts;
  native adapter tests and final platform exports.

## Task 5: Evidence-grounded background memory

Files: `src/assistant/consolidation.ts`, app lifecycle/store integration and tests.

Interfaces: tools-disabled suggestion extraction returns quote-validated proposals;
foreground replies do not await it; reset/cancellation invalidates old jobs.

- [x] Write RED tests for unsupported quotes, injected file instructions, secrets,
  duplicate proposals, interrupted requests and foreground work taking priority.
- [x] Implement bounded idle model consolidation and reviewable suggestions,
  manual acceptance/rejection and explicit pinning; no automatic pins.
- [x] Execute model HTTP and browser acceptance/forget/reload round trips.

## Task 6: Optional authenticated desktop companion

Files: companion server/desktop adapter, phone configuration/transport and tests.

Interfaces: versioned authenticated capability/run/event/cancel endpoints; runtime
adapter consumes the actual desktop Agent API and forwards approval events.

- [x] Inspect desktop factory/config/tool initialization before implementing the
  adapter; write auth, pairing, event ownership, approval and cancellation tests.
- [x] Implement explicit host/TLS configuration, per-install pairing credentials,
  capability discovery and actual desktop runtime delegation without inherited
  secrets or an unauthenticated LAN listener.
- [x] Run an actual companion/phone HTTP round trip and document launch/pairing.

## Task 7: Production audit, delivery and completion evidence

- [x] Self-review the spec against the implementation and all touched failure paths.
- [x] Run full serial tests, typecheck, both live UI loops and platform exports.
- [x] Build/sign/inspect a new Android artifact with the preserved identity.
- [x] Update README/changelog/verification ledger; inspect diff/metadata/dependency
  changes and delivery files; leave unsupported or unverified claims explicit.
- [x] Audit every spec item against current authoritative evidence. Mark the goal
  complete only after all required capabilities and gates are proved.
