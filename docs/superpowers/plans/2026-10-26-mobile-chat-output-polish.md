# Mobile conversation and output polish

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent output editor and chat/composer tasks, with verification and integration by the parent.

**Goal:** Implement the user's approved items 1, 2 and 4: calmer conversations, a simple composer and focused finished-output previews/editors.

**Architecture:** Preserve AppContext, work state and existing data formats. Present reply text before compact activity/evidence links. The composer exposes one actions sheet for attachments, model selection and clearly labelled background work. Output cards become file rows that open a native full-screen modal; edit tables/checklists/calendar events through ordinary fields, with explicit save/discard and validation.

**Tech stack:** Existing React Native/Expo components and installed date picker; no new dependencies. Existing semantic colors/type/spacing, light/dark, 320px support and reduced motion.

## Scope and ownership

- Parent: ChatScreen, AssistantActivity, MemoryRecall, WorkLauncher, browser acceptance scripts and shared integration. No changes to pairing, navigation, background runtime or approvals.
- Output implementer: OutputCard, new focused output preview/editor components, output-edit helpers/tests. Keep OutputCard({artifact}) and OutputLibrary call sites compatible. Parent updates browser acceptance contracts.
- Keep a single Settings footer and no app nav bar. User approval covers this implementation; proceed without additional design questions.
- No git repository exists in this mobile folder. Work in place and do not mutate the desktop checkout or the old desktop staging clone.

## Tasks

- [x] Capture baseline typecheck/tests and add meaningful UI acceptance for answer ordering, compact activity, composer actions and draft preservation.
- [x] Output previews: full-screen readable document/table/checklist/calendar/JSON; explicit Edit and Save/share, format selection in a secondary panel, delete in options; real exports retain bytes. Structured edits preserve valid formats and enforce limits; cancel/discard preserves saved data; source updates and deletion while open are handled safely.
- [x] Conversation layout: text first, compact tool summary and memory link after reply. Compact contextual work presentation preserves Cancel/Resume/recovery and output access without duplicate large cards.
- [x] Composer: input, actions, Send/Stop; model indication and selection inside actions menu; attachments and background-work review remain reachable, disabled appropriately and preserve text/files when dismissed or routed to setup.
- [x] Final acceptance ledger: production browser flows, existing assistant/work flows, typecheck, full serial tests and web/native bundle exports. See `docs/mobile-chat-output-polish.md` for actual evidence and native-device limits.

## Review correction

Code review found that a preview mounted inside its source row lost unsaved edits when notification navigation unmounted the row. A browser regression reproduced that loss before the fix. The preview now lives above screen navigation; the same regression passes, including Escape/discard after navigation. An ephemeral assistant-data epoch removes the private editor after explicit data clear/reset. The reviewer found no material regressions in the correction.

## Review focus

- Draft loss while closing actions, selecting a model, or visiting worker/provider setup.
- Duplicate source-linked outputs after retries and old persistent results.
- Nested modal/back/focus behavior and save/discard handling.
- Structured editor limits, valid ISO dates, table shape and untouched original data until Save.
- Busy/Stop/approval controls, scrolling and narrow or large-text layouts.
