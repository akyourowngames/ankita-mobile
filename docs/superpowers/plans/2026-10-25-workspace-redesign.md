# Workspace redesign

The screenshots show a top-heavy welcome screen, a compressed composer, and navigation mixed into an undifferentiated history list. Rework the existing React Native / Expo interface, keeping provider configuration, streaming, stop, drafts, attachments, history actions, and local storage intact.

Design decisions: neutral charcoal canvas (#181A1E), slightly raised surfaces (#202329), quiet borders (#343840), near-white text (#F1F3F6), and muted slate text (#A2A9B4). Light mode uses the same hierarchy. Use native system typography, a 4/8/12/16/24/32 spacing scale, and restrained corners. No decorative gradients, marketing copy, or repeated mascot avatars in history.

- [x] Add a responsive workspace shell: persistent 280dp navigation above 960dp, modal drawer below it, bounded reading width within the remaining canvas. Preserve screen content and drafts during resize.
- [x] Separate navigation, search, recent conversations, and the profile/settings footer. Keep full history search, pin, rename, and delete available.
- [x] Balance the welcome screen within the available height, with simple actionable starters. Reorder the composer so writing comes first and model/attachment/send controls have their own toolbar.
- [x] Update shared surfaces, typography, touch targets, and focus feedback for dark/light mode and narrow/large-text layouts. Respect reduced motion.
- [x] Build and typecheck. Verify navigation, draft retention, history search/actions, composer controls, responsive widths, theme changes, keyboard use, and the existing chat flow with the browser harness. Inspect actual screenshots.

Implementation files: App.tsx; src/components/WorkspaceNavigation.tsx; src/components/ConversationLibrary.tsx; src/screens/ChatScreen.tsx; src/theme/tokens.ts; src/theme/styles.ts. Verification: scripts/verify-redesign.mjs and scripts/verify-mobile.mjs. No new dependencies.

Validation: TypeScript and Expo web export pass. All 103 Node tests pass. The redesign browser harness passes at 320/390/768/1440px in dark/light mode, including draft retention, search, model switching, history options, keyboard navigation, Escape, and resizing while the drawer is open. The full mobile harness passes with 14 fixture HTTP generation requests, streaming/Stop, provider/teammate/plugin workflows, narrow screens, large text, and a 240-message virtualized transcript. A reduced-motion change during modal dismissal previously stranded React Native Web overlays; a shared presentation-stable animation hook fixes this and the browser regression covers it.

Screenshots: release/redesign/. Native hardware keyboard and device interaction were not exercised; validation used the Expo web renderer.

## Follow-up: simpler navigation and tool spacing

The user's second screenshot review requested fewer controls in the sidebar and more separation between tool activity and response text. The sidebar now contains only new conversation, search, history, and view-all. Chat, Assistant, and Settings use a separate bottom bar on phones and top bar on desktop. Teammate selection remains in the chat header and Settings. Native keyboard events hide the mobile navigation while typing where supported by the operating system.

Tool cards no longer mount the full-screen Scene animation or translate when status changes. Cards have a 64dp minimum height, roomier padding, readable status labels, and at least 24dp clearance before response text. Details use separate input/result sections. Message actions have 44dp touch targets. Unused sidebar destination/profile styles were removed.

Follow-up verification passes: typecheck, Expo web export, 8 focused history/chat/scroll tests, 4 webpage-policy/extraction tests, the redesign harness at 320/390/768/1440px, the complete mobile harness (14 fixture provider HTTP requests), and the assistant harness (16 fixture provider HTTP requests). The assistant UI's public-page response uses a deterministic browser fixture; separate webpage tests exercise policy and extraction. Screenshots inspected include the simplified drawer, workspace navigation, completed tool spacing, and activity details. Native hardware interaction remains untested.

## Final navigation preference

The user explicitly requested removing the added bottom navigation and moving management into Settings. Both mobile and desktop workspace navigation bars and their keyboard-listener code/styles are removed. The sidebar retains conversations, search, new chat, and exactly one Settings button at its footer. Assistant, teammates, instructions, providers, plugins, appearance, and data controls remain available inside Settings. The tool spacing polish is retained. The responsive browser harness now checks that no workspace navigation bars exist, that the sidebar has exactly one Settings entry, and that Assistant is reachable through Settings with the draft preserved.
