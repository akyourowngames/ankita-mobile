# Independent Ankita assistant

## Intent and authorization

The user wants the mobile app upgraded from a chat client into a production-ready
personal AI assistant with tools and memory. They selected an independent phone
assistant with an optional desktop connection. Keep the approved graphite UI and
all working provider/Composio flows. Execute continuously in the existing folder;
the earlier user ruling against staged permission pauses remains in effect.
Design/planning review is recorded here for a concrete, inspectable implementation.

## Required behavior

1. A real bounded agent runtime exposes built-in tools even without Composio or a
   desktop. OpenAI-compatible and Anthropic providers receive the same capability
   contract. Text-only backends must explain their capability limits honestly.
2. Personal memory persists across conversations and teammates. Users can search,
   add, edit, forget and pin facts. Pins are bounded prompt context; other facts
   are retrieved by tools. Every model-created memory has user-transcript evidence.
   Background model suggestions run separately from foreground replies, never
   auto-pin or turn untrusted web/file instructions into personal facts.
3. Built-in tools manage notes, tasks, due dates, imported documents, public web
   research, safe calculation and current time. Scheduled native reminders are
   real OS notifications. Web does not pretend to run jobs while closed.
4. Tools show actual arguments/results/status in the chat. Disabled, unavailable,
   malformed or denied tools do not execute. Changes to stored data and connected
   app actions have actionable approval previews unless the user explicitly
   grants that tool permission. Stop cancels pending approvals/network work and
   prevents late writes. No synthetic execution history or completion claims.
5. Files are chosen with the system picker; app access is limited to user-selected
   files. Text/Markdown/JSON/CSV can become searchable document context. Images and
   PDFs use the selected provider's supported multimodal contract with explicit
   unsupported-format errors. Payloads and retained data are bounded.
6. Web research has source URLs and fetched content, bounded bodies/deadlines and
   safe redirect/URL policy. Search uses a configured real search service, not
   invented search results. The browser relay must not become an arbitrary
   private-network proxy. Native fetch uses the Expo transport contract.
7. An optional authenticated desktop companion gives access to the existing
   desktop runtime through a documented protocol. The phone's own memory/tools
   work without it. Pairing credentials use SecureStore/session-only browser keys;
   no guessed host, inherited credentials, unauthenticated LAN listener or exposed
   terminal. Desktop side effects retain approval and cancellation semantics.
8. Memory, tasks, library, tools/permissions and desktop settings have real phone
   screens, empty states, search/edit/remove flows and truthful capability status.
   Privacy export/clear/reset covers the new data without including credentials.
9. Upgrade migration preserves package/deep-link/storage/signing identity and
   existing chats, providers, teammates and cached models. Invalid new records
   fail safely without overwriting the original state. Interrupted tool runs
   restore as cancelled, never as still executing.

## Runtime invariants

- One result for each declared tool call, including denied/error/limited calls.
- Limits on model rounds, total calls, repeated identical calls, result size,
  records, prompt pins, imported bytes and background work. Limits are named config.
- Tool failure is data for the model; transport failure is an honest chat error.
  Private remote errors and credentials never appear in saved receipts.
- No eval, model-selected shell command on the phone, automatic deletion of user
  facts, silent paid-provider retries, or extra foreground memory model call.
- Knowledge read from a page/file is untrusted context, not system instructions.
- Local tools operate on the current store and await persistence before reporting
  success. Streamed activity remains owned by the original conversation.

## Verification contract

RED/GREEN behavior tests cover migration/corruption, memory evidence/dedup/pins,
task/note operations, permissions, failed writes, tool pairing, repeats, limits,
Stop during approval, late results, background suggestions, network/URL policy,
and multimodal/provider contracts. Both provider protocols have actual local HTTP
round trips. The real browser exercises a built-in tool without Composio, approval
and denial, memory across reload/teammates, tasks, file import, tool receipts,
clear/export, web research, and the existing 320/390/1280 layout checks.

Finish with the serial suite, typecheck, production/development UI loops, native
exports, signed Android build and manifest/signature/content inspection. Record
what was actually executed and any native-device or live-account limits. Do not
call this goal complete from a plan, a subset of tools, or passing narrow tests.

## Current-state findings

Baseline has 35 passing tests. Its Composio session implements a real tool loop,
but direct chat has no built-in session. Personal memory, tasks, document library,
tool receipts and approval UI are absent. No callable desktop HTTP assistant
endpoint exists in the inspected desktop runtime; the optional companion must be
implemented rather than relabeling the existing compatible-server provider.
