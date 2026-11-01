# Ankita mobile — application brief

## 2.0.1 Chat simplification and sidebar-only navigation (2026-10-25)

The chat page is now a single quiet column. The empty state is a left-aligned
greeting with one muted question and one grouped list of the three draft-starting
prompts; each row adds its text to the composer and never sends. The framed
presence portrait, the Memory/Tasks/Library pill row, the `Suggested` eyebrow,
per-card icon tiles and the circled plus buttons were removed. Memory, Tasks and
Library live in the Assistant hub instead. The privacy note stays as a small line
under the list. Short viewports keep all three prompts because the removed chrome
frees more room than the previous compact card count saved.

Primary navigation is the conversation sidebar. The bottom Chat/History/Assistant/
Settings bar is gone, so the composer meets the safe area and the chat has one
navigation affordance instead of two. The sidebar header still starts a new
conversation; below search it links to Assistant and Teammates, then the dated
conversation list, with Settings pinned at the bottom. Plugins remain reachable
from Settings and the Assistant hub. Assistant now has a back control because it
is no longer a tab root. Android hardware back resolves Assistant to chat and its
record screens to Assistant.

The header keeps the sidebar control, centered teammate identity and new-chat
control but drops the filled button circles. Its subtitle reports the conversation
title, `Working…`, or `New conversation`; the active model is shown once, in the
composer. The composer toolbar keeps attach, model selection and send/stop; the
connected-app shortcut was removed as a duplicate of the Plugins and Assistant
entries. No behavior, storage, provider or dependency changes.

## 2.0.1 Chat page redesign (2026-10-25)

Chat now opens as a workspace rather than a blank transcript. A framed presence
portrait of the active teammate's mascot leads into a greeting that uses the
saved first name when one exists. The portrait is decorative and does not imply a
connection status. Memory, Tasks and Library shortcuts open the
assistant records directly. Three suggestion cards describe a concrete outcome and
prepare an editable draft in the composer; they never send. A setup card replaces
the suggestions when no provider is configured.

The header keeps its compact thumb-reachable controls but centers the teammate
identity with a chevron beside the name. Its subtitle reports the current
conversation title, the active model on a new chat, `Working…` during a reply, or
the missing provider, instead of repeating a static role description.

The composer is one bordered surface rather than a loose stack: the draft sits
above a single toolbar with attach, model and connected-app controls plus a 44 dp
send or stop control. Focus paints the surface border with the accent color. A
floating `Latest`/`New reply` pill appears only when the reader has scrolled away
from the bottom. Tool activity, thinking, stopped and error states use the same
rounded surface language and keep the existing action labels and copy.

Short viewports (below 700 dp) switch to a compact empty state: a smaller
presence, no subtitle, two suggestions without detail lines, and tighter content
padding, so the privacy note and composer stay visible without a clipped card at
320×640. The transcript itself keeps its minimal treatment (no repeated assistant
label and no invented timestamps) and still virtualizes long conversations. All
new surfaces use semantic theme tokens, so light and dark themes share one
structure.

## 2.0.1 UI hierarchy polish (2026-10-25)

The minimal transcript, docked composer and grouped-row structure stay unchanged.
Section and date headings now use a small tracked uppercase label, Settings and
Assistant open with a bordered profile card, and the selected tab carries an
accent icon plus a short top indicator. The chat subtitle names the active model
instead of repeating the teammate description; the idle send control keeps a
visible resting circle; and the model selector reads as one pill aligned with the
attach and connected-app shortcuts. Assistant hub counts now agree with singular
and plural records. No behavior, data or dependency changes.

## 1.1 phone workbench (historical)

The user requested the mobile app to match the approved Ankita desktop/island
experience while being optimized for phones. The existing complete mobile app
is the functional baseline; its provider, tool, privacy and storage flows remain.

Graphite replaces the default lavender presentation. Platform-native fonts,
compact left-aligned headers and quiet grouped rows carry the desktop language
into a phone layout. Small native mascot faces identify teammates; long names
truncate within their rows instead of changing the layout. The app name is
Ankita; Chief remains its built-in teammate. Package/deep-link/storage identifiers
retain their earlier names for installation and data compatibility.

Chat has a docked composer, provider/model selection and connected-app shortcut.
Chat, History and Settings use thumb-reachable tabs, hidden during the native
keyboard and on detail screens. Empty-chat actions prepare editable text without
sending. Session-only drafts are isolated by teammate/conversation and retained
through navigation, with a bounded draft cache cleared by reset.

Onboarding, the conversation library, teammates, providers, connected apps,
profile, instructions, appearance, privacy and About all share this design.
History has short previews and real search/pins. Teammates use one face-led row
each. Forms and confirmations use shared safe-area and keyboard-aware sheets.
Appearance previews flex at narrow widths. Input fields have no browser focus
frame; touch targets remain at least 44 dp.

Motion responds to actions: gentle screen entrance, press feedback, working
mascot lift and rolling actual thinking/writing/tool labels. Reduced motion and
background lifecycle stop idle work through one shared preference. No canvas,
always-running idle mascot loop or extra model request is added for animation.

The chat transcript is a measured virtualized list with memoized completed
messages and stable action callbacks. Native Markdown remains; long fenced code
scrolls inside its own message. Custom display-font startup loading is removed.
Performance claims are limited to these changes and bounded mounted-row checks;
physical-phone frame time has not been measured.

## Original 1.0 brief (historical)

User request: finish the existing mobile application in one continuous pass;
dark iPhone-like interface, real chat, configured providers, onboarding,
appearance and About. Reference images show compact chat and grouped settings.

## Product

A private, local-first assistant client for iOS, Android and web. Connect an
OpenAI-compatible or Anthropic provider using the user's own endpoint/key/model.
No invented answers, sample chats, fake connection status or nonexistent tools.
Agent actions require a real agent backend; direct model chat is not represented
as desktop browser automation. No API key is imported from another application's
settings or included in an exported conversation.

## Design

Dark by default: black canvas, charcoal grouped surfaces, soft white text and a
quiet lavender accent. Light and system modes and alternative accent colors
update all screens. Bundled Manrope body and Sora display fonts, iOS-sized touch targets, safe areas, subtle
dividers, rounded composer, compact headers. Chat stays the primary screen;
conversation history and settings open as separate screens. No dashboard tiles.
Onboarding: welcome, name and provider choice, then chat; setup can be skipped
honestly and completed from Settings. No fabricated provider credentials/models.

## Working flows

### Visual revision after user review

Use the user's Mobbin onboarding references: large branded visual and direct next action, compact step progress. Charcoal base, translucent foreground controls, meaningful borders, custom typography. Left-aligned conversation library with date sections, preview text, active status, pin filter and search. Compact assistant spacing. Navigation fades and tactile button scales respond to user actions; respect reduced motion. Glass is concentrated in the composer and visual onboarding instead of blurring every scrolling row.

- New chat, streamed replies, Stop, retry, switching/searching/renaming/deleting
  conversations, copying messages, share transcript, honest errors and empty states.
- Add/edit/delete multiple providers, model discovery, connection test, active
  provider/model picker, editable endpoints, optional keys for local endpoints.
- Profile, appearance, text size, system prompt, privacy/data controls and About.
- Persist settings/history across restarts; native API keys in SecureStore;
  web keys remain in memory, with the limitation visible in provider settings.
- Cancellation aborts network I/O and preserves partial text without fabricated
  completion. History keeps the provider/model used for each conversation.
- Responsive web preview and native Android/iOS bundling/configuration.

## Verification and shipping

The final mobile revision uses a compact conversation drawer, single-line sessions,
a minimal empty chat and no repeated assistant label above every reply. Teammates
have separate roles, instructions and model choices. Provider catalogs persist on
device, while provider and Composio secrets remain in native secure storage (or
browser memory). Connected-app actions use the model's tool calls and continue
with actual results; the app does not fabricate tool execution.

Reproduce baseline test failure, add behavioral tests for streaming, validation,
state restoration, safe export and cancellation. Real UI interaction against a
local HTTP streaming provider fixture, not a real paid model claim. Typecheck
against actual React Native types (remove ambient any stubs). Export production
web and native bundles. Native installation/signing depends on available local
SDKs or an authenticated EAS account; report that evidence explicitly.

## Rulings

- Complete the requested design and implementation without staged permission
  pauses: the user explicitly requests the entire app at once.
- Upgrade the tiny existing SDK 52 scaffold to stable SDK 57 before implementing:
  official compatibility table and npm metadata checked; baseline audit reports
  18 advisories (1 critical). Cost: require current Expo Go/custom native builds.
- Keep the existing directory, which has no Git repository. Preserve existing
  files and do not create commits or claim a branch/published release.
- Use official npm metadata and npm audit as previously authorized; Sonatype
  checking tools are unavailable. This is not a Sonatype Trust Score claim.
