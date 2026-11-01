# Mobile verification ledger

## 2.0.1 - Chat simplification and sidebar-only navigation, 2026-10-25

- Source backup: the prior baseline remains `../chief-mobile-source-backup-2026-10-25-2034` (pre-redesign `src`, `App.tsx`, `package.json`). The project still has no Git repository.
- Changed: `src/screens/ChatScreen.tsx`, `src/theme/styles.ts`, `src/theme/tokens.ts`, `src/components/ConversationLibrary.tsx`, `src/screens/AssistantScreen.tsx`, `App.tsx`; `src/components/PhoneNavigation.tsx` was deleted. The chat empty state is now a left-aligned greeting with one grouped list of three draft-preparing prompts, without the portrait, shortcut pills, eyebrow, per-card tiles or circled plus buttons. The bottom tab bar is removed; the sidebar drawer now links Assistant, Teammates and Settings. Assistant gained a back control and Android back resolves the Assistant subtree to its parent. The header uses conversation context as its subtitle, and the composer dropped the duplicate connected-app shortcut.
- Verification scripts changed: `scripts/verify-mobile.mjs` and `scripts/verify-assistant.mjs` now assert **zero tab roles**, open the sidebar once per primary destination at 390 px, and route every Settings/Assistant/Teammates visit through the drawer. A 320 px empty-chat capture was added.
- `npm run typecheck`: exit **0**.
- `npm test -- --test-concurrency=1`: **103 tests, 103 pass, 0 fail/skipped**, 37529.24 ms on the final run.
- `npm run build:web`: exit **0**, **514 modules**, web JavaScript **874 KB** plus the **67 KB** runtime chunk.
- Reproduce-then-fix: the first run with the added 320 px drawer capture failed in Playwright strict mode because the fading drawer and the header both exposed a `New conversation` button (**2 elements**). `closeDrawer()` now waits for the overlay to become hidden; the same run then passed.
- Production `npm run verify:ui`: `MOBILE_UI_OK` and `MOBILE_PHONE_LAYOUT_OK`, **14 provider HTTP requests**, 320/390/1280 layouts, 240-message transcript with **14 mounted replies**, zero unexpected console/animation/pointer warnings and the two intentional HTTP 429 fixtures. The former thumb-navigation assertion was replaced by a no-tab plus sidebar-destination assertion; the sidebar is now opened and measured at both 390 px and 320 px.
- Production `npm run verify:assistant`: `ASSISTANT_UI_OK`, **16 provider HTTP requests**, zero page errors, with memory/task/note CRUD, approvals, receipts, import, sourced page, pairing, export/clear and 320/390 layouts routed through the sidebar.
- Development `npm run verify:dev`: both loops exited **0** against Metro with **Development-level warnings: ON**. `MOBILE_UI_OK` reported **15 provider HTTP requests**, a 240-message transcript with **16 mounted replies** and zero unexpected console/animation/pointer warnings; `ASSISTANT_UI_OK` reported **16 provider HTTP requests** and zero page errors.
- Inspected captures at 390 and 320: `03-chat-empty`, `04-chat`, `07-chat-empty-small-phone`, `07-small-phone`, `10-settings`, `11-history`, `15-long-name-small-phone`, `assistant-hub`, `09-desktop`. The 320 empty state fits greeting, all three prompts, privacy note and composer; the drawer exposes Assistant, Teammates and Settings without horizontal overflow.

Residual: native iOS/Android rendering, physical keyboard/safe-area behavior, frame time and hardware-back behavior on a physical device remain unverified. The drawer and no-tab checks ran on the web export (production) and Metro (development), not on an installed APK.

## 2.0.1 - Chat page redesign, 2026-10-25

- Source backup: `../chief-mobile-source-backup-2026-10-25-2034` (`src`, `App.tsx`, `package.json`). The project still has no Git repository.
- Changed: `src/screens/ChatScreen.tsx`, `src/theme/styles.ts`, `src/theme/tokens.ts` and `src/components/AssistantActivity.tsx`. The empty chat now has a framed mascot, personalized greeting, Memory/Tasks/Library shortcuts, three draft-preparing suggestion cards, a no-provider setup card and a privacy note. A compact variant (viewport height below 700 dp) uses a smaller portrait, no subtitle, two detail-free suggestions and tighter padding so content fits at 320×640. The header centers the teammate with the conversation/model subtitle; one composer surface holds attach/model/app/send; a floating latest-reply pill appears after scrolling away; tool, thinking, stopped and error states use rounded surfaces. No behavior, storage, provider, permission or dependency changes.
- `npm run typecheck`: exit **0**. `npm run build:web`: exit **0**, **514 modules**, final web bundle **880 KB**.
- `npm test -- --test-concurrency=1`: **103 tests, 103 pass, 0 fail/skipped**, 11573.42 ms on the final run.
- Production `npm run verify:ui`: `MOBILE_UI_OK` and `MOBILE_PHONE_LAYOUT_OK`, **14 provider HTTP requests**, 320/390/1280 layouts, 240-message transcript with **13 mounted replies**, zero unexpected console/animation/pointer warnings. Production `npm run verify:assistant`: `ASSISTANT_UI_OK`, **15 provider HTTP requests**, 320/390 layouts, zero page errors.
- Development `npm run verify:dev`: both loops pass with **Development-level warnings: ON**, **14** mobile and **16** assistant provider HTTP requests, 240-message transcript with **14 mounted replies**, zero page errors or unexpected warnings.
- Reproduce-then-fix: the first development run failed with **2 !== 0** on `props.pointerEvents is deprecated. Use style.pointerEvents` from the floating latest-reply wrapper. Moved `box-none` into the shared style; typecheck and both development loops then exited **0** with zero pointer warnings.
- Inspected final captures: `03-chat-empty`, `04-chat`, `09-desktop`, `12-teammate-chat`, `15-long-name-small-phone` and `14-long-chat-small-phone` in dark mode; `16-chat-light-empty`, `17-chat-light-compact`, `18-chat-light` and `19-chat-light-setup` in light mode. The 390 empty state shows all three suggestions; the 320 state fits the greeting, two suggestions, privacy note and composer without a clipped card. The framed mascot is decorative and carries no connection-status claim.

Residual: native iOS/Android rendering, physical keyboard/safe-area behavior and frame time remain unverified. Light captures used seeded local state and a loopback preview; they did not call a provider.

## 2.0.1 - UI hierarchy polish, 2026-10-25

- Source backup: `../chief-mobile-source-backup-2026-10-25-2034` (`src`, `App.tsx`, `package.json`). The project still has no Git repository.
- Changed: tracked uppercase section/date labels, a bordered profile card, an accent icon and 2 dp top indicator for the selected tab, the active model in the chat subtitle, a visible idle send circle, a pill model selector, and singular/plural Assistant hub counts. No behavior, storage or dependency changes.
- `npm run typecheck`: exit **0**. `npm run build:web`: exit **0**, **514 modules**.
- `npm run verify:ui`: `MOBILE_UI_OK` and `MOBILE_PHONE_LAYOUT_OK`, **14 provider HTTP requests**, 320/390/1280 layouts, zero unexpected console/animation/pointer warnings; screenshots regenerated. `npm run verify:assistant`: `ASSISTANT_UI_OK`, **15 provider HTTP requests**, zero page errors; Assistant hub and narrow screenshots regenerated.
- `npm run verify:dev`: both loops pass against Expo development with **Development-level warnings: ON**, **14** mobile and **16** assistant provider HTTP requests, zero page errors and zero unexpected warnings.
- `npm test -- --test-concurrency=1`: **103 tests, 103 pass, 0 fail/skipped**.
- Inspected final captures for empty and active chat at 390 and 320, Settings, Assistant hub, light appearance, history and the Assistant narrow screens. The selected indicator, profile cards, labels, idle send control and model pill render without horizontal overflow.

## 2.0.1 - provider recovery, 2026-10-06

- Serial suite: **103 tests, 103 pass, 0 fail/skipped**, 15485.357 ms; typecheck exits 0. Six real HTTP failure fixtures classify rate/quota/access/client/vision/upstream failures without exposing remote secrets; streamed HTTP-200 errors stop honestly. The unchanged no-retry assertion now checks the structured rate-limit code/status.
- Browser keys moved from memory-only storage to this tab's session storage. Two regressions cover refresh/remove/storage loss and blocked-storage fallback. App metadata, local storage and exports exclude keys. Native SecureStore remains the native adapter.
- Production `MOBILE_UI_OK` executes **14 HTTP requests**; development executes **16**. Both check same-tab refresh succeeds, a fresh tab requires its own key, rate/quota messages and Retry-After reach the UI, streamed errors do not appear successful, and changing a model during its delayed test discards the obsolete success. The model-edit regression failed before the fix with **1 !== 0**. Exactly two intentional HTTP-429 console messages are accepted; zero unexpected errors/animation/pointer warnings.
- Production and development `ASSISTANT_UI_OK`: **16 provider HTTP requests** each, zero page errors, including real memory/task/note CRUD, imports, background review, approvals/Stop, sourced webpage and paired desktop delegation. Both UI loops retain 320/390/1280 layout checks and the 240-message fixture with **13 mounted replies**.
- Actual Kilo public catalog advertises **400 models**, including **16 free tool routes** in this check. A harmless anonymous `kilo-auto/free` generation probe returns **HTTP 429**, classified `rate_limit`. The user's saved browser/account key was not accessed; this is evidence of an upstream limit, not proof that account-key requests fail or succeed. Model listing and key presence cannot guarantee credits or native tool/vision support.
- Web export: **514 modules**. All-platform exports: web **514**, Android **805**, iOS **797**; native Hermes bundles **2.1 MB**. Android assemble/sign exits 0: **BUILD SUCCESSFUL in 15m 12s**, **387 tasks: 35 executed, 352 up-to-date**. SDK metadata and Gradle deprecation warnings remain.
- APK inspection exits 0: signature **v2/v3**, one signer; existing certificate digest `caae18af80a5b3ebe469954a0d861dc73ae51244012a41670ab0e54b2803bf56`. Actual package **com.chief.mobile**, **2.0.1/code 4**, minimum SDK **24**, target **36**, ARM64/x86_64. `APK_CONTENT_OK` confirms two C++ ABI runtimes, one font, manifest/dex/offline bundle.
- Delivery: `release/Ankita-2.0.1-android.apk`, **44,975,023 bytes**, SHA-256 **f0065e96c8a2b7f01868dbbe7502f2922451a18c3e054c0943502b22b5170c5f**. Prior release APKs remain available. Dependencies and signing identity were preserved; no Git/remote publication was created.

Residual checks: actual user-account generation, paid-model eligibility, physical Android install/upgrade, native SecureStore/pickers/reminders/frame time, native iOS and phone-to-PC trusted TLS remain unverified. Provider quota and client-only access restrictions are not bypassed. Inherited dependency audit findings are recorded in the 2.0.0 section.

## 2.0.0 - independent assistant delivery

- Final serial suite: 90 passed, 0 failed/skipped, 36534.8887 ms. Typecheck exits 0.
- Actual OpenAI/Anthropic HTTP tests execute local tools and background extraction; no Composio key/desktop is required for phone tools.
- Production MOBILE_UI_OK: 9 HTTP generation requests, zero console/animation/pointer warnings. Development MOBILE_UI_OK: 7 requests, zero warnings. Both print MOBILE_PHONE_LAYOUT_OK for 320/390/1280 widths, large text/long names/code, isolated drafts and 240 messages with 13 mounted assistant replies.
- Production and development ASSISTANT_UI_OK: 16 provider HTTP requests each, zero page errors. Actual persisted memory/task/note CRUD, pins, due picker, approvals/denial/Stop, receipts/reload, system-picker text import, sourced public page, background review/accept, JSON export/clear and paired desktop HTTP delegation/nested approvals/secret isolation pass.
- Desktop HTTP regression runs the installed Agent: denied write leaves no file; approved write is read back; four provider requests. A separate real HTTP regression settles nested remote receipts cancelled after Stop. The launcher rejects a LAN listener without TLS before creating a runtime or pairing file. Trusted LAN TLS itself remains untested.
- Native notification adapter tests verify lazy foreground-handler restoration, actual date/channel payload and returned OS identity, cancellation and denied permission. Physical delivery remains untested.
- Final exports: web 511, Android 802, iOS 794 modules; native Hermes bundles 2.1 MB. Android generated bundle at 15:21:34 UTC follows final source at 15:18:26 UTC. iOS export is not an Apple build.
- Source whitespace check passes. Semantic labels/schema keys and standard arithmetic/encoding/HTTP/IP values were reviewed; runtime budgets, transport paths and URLs live in named config. Backup covers selected pre-change files, not a complete unchanged-source mirror.
- Current npm audit: 17 high, zero critical; leaf findings are unpatched braces/node-forge. source-map-js is patched at 1.2.2. Exact native dependencies match the Expo manifest. Sonatype tool unavailable; official provenance/integrity and npm audit fallback used without a Trust Score claim.
- Prior 1.1.0 APK checksum is unchanged. Updated web preview is running on http://127.0.0.1:4173, including the protected companion route; restart completed after replacing the older preview middleware.

- Android build/sign exits 0: BUILD SUCCESSFUL in 29m 55s; 387 actionable tasks, 359 executed and 28 up-to-date. Final source was bundled before packaging; release lint passed. SDK/Gradle deprecation warnings remain.
- APK inspector exits 0: APK_CONTENT_OK with 2 C++ runtime ABI entries, 1 font, manifest/dex/offline Hermes bundle. Actual manifest includes POST_NOTIFICATIONS and RECEIVE_BOOT_COMPLETED.
- Delivered release/Ankita-2.0.0-android.apk: 44,962,735 bytes, Ankita label, com.chief.mobile, version 2.0.0/code 3, min SDK 24/target 36, ARM64 and x86_64. Signature v2/v3, one signer; certificate SHA-256 caae18af80a5b3ebe469954a0d861dc73ae51244012a41670ab0e54b2803bf56 matches the prior identity.
- Independent Node and PowerShell SHA-256 agree: d7251dc736bc48c9b407b8cc286bd263ddfb841dd59923e9f081b275e6f863ab. Previous 1.1 APK remains unchanged at 746acd75af95d24d715fd8c68d0088f45ce957ed3f6f25fef684e3d8e682de2d.
- README/changelog/plan/execution ledger updated; no signing material, runtime pairing credentials or unrelated dumps were included in the delivery APK.

Residual checks: no attached ADB devices. Physical Android installation/upgrade, keyboard/safe areas, native picker, SecureStore/OS notifications, native redirect/DNS handling, frame time/large-library memory use, rollback disk failure, phone-to-PC TLS, native iOS and paid provider/Composio/search accounts remain unverified. No Git/remote mobile publication was created.


## 1.1.0 redesign — historical evidence

- Scope: all active mobile screens now use Ankita's graphite desktop language, native fonts, mascot identities, compact rows and thumb navigation. Provider/tool/storage behavior is preserved. Original source, Android configuration and screenshots were backed up outside the project before editing; this folder has no Git repository.
- Baseline: **33 tests, 33 pass, 0 fail**, followed by the original real HTTP browser loop. The new navigation regression failed against the original export with `Phone chat needs thumb-reachable primary navigation`, `0 !== 1`. The redesigned export passes it and the unsent starter/draft assertions.
- Long-chat reproduction: 240 messages were restored, but a programmatic scroll stopped at offset **3848**, viewport **376**, content **5453**, with early replies still mounted. Virtualized rows revise estimated heights; the old bottom-only rule incorrectly disabled following during forward progress. The new scroll rule retains forward following and pauses when the user scrolls upward. Two focused regressions: old rule **1 pass / 1 fail** (`false !== true`); current rule **2 pass / 0 fail**.
- Live production and development loops pass both latest-reply restore and a real upward wheel gesture followed by width/row remeasurement. Only **13 assistant replies** were mounted in the 240-message fixture. This is a bounded rendering check, not a physical-phone frame-rate benchmark.
- Fixture correction: injecting saved state before reload was overwritten by the app's legitimate background-save handler. The stress fixture now seeds through `addInitScript` before the next app startup. Production persistence was not changed to accommodate the test.
- Focus reproduction: Chrome paints its automatic input ring even when `getComputedStyle` reports `auto 0px`. Screenshots before/after changing to `solid 0px` prove the visible frame disappears. Fields, search and composer share the explicit zero-width reset; the assertion checks outline style, width and all border widths.
- Development startup: cold Metro compilation exceeded the ordinary 15-second navigation deadline. The verifier now gives only development navigation/readiness a named 120-second cold-start allowance; ordinary interactions keep their 15-second deadline. Its owned process tree is cleaned up afterward.
- Literal/source review: palette, phone geometry, motion and list budgets are named tokens; app/export branding comes from app config; verifier dimensions and deadlines are fixture/config values. Remaining inline literals are display copy, semantic native styles, component states/roles and mathematical identities, not environment assumptions. No dependencies changed. Source `git diff --no-index --check` against the original backup printed no whitespace errors.

## 1.1.0 executed evidence and delivery

- `npm test -- --test-concurrency=1`: **35 tests, 35 pass, 0 fail, 0 skipped**, duration **5066.2571 ms**. Includes OpenAI-compatible and Anthropic real HTTP fixtures, Composio continuation/cancellation, storage, metadata synchronization and both new transcript-follow regressions.
- `npm run typecheck`: exit **0** against installed native types after the final shared input reset.
- `npm run build:web`: exit **0**, **389 modules**, **736 KB** JavaScript, one **390 KB Ionicons** font. No custom display-font startup gate.
- `npm run verify:ui` and `npm run verify:dev`: both exit **0** with **MOBILE_UI_OK** and **MOBILE_PHONE_LAYOUT_OK**. Each runs **6 real HTTP generation requests**, with zero console errors or animation/pointer warnings. They cover 320/390/1280-pixel viewports, all settings sections, large text, long names/code, a 240-message transcript (**13 mounted assistant replies**), upward scrolling without jumps, isolated drafts, borderless focused inputs and reduced motion. Development warnings were enabled.
- `npm run build:bundles`: exit **0**, final web **389**, Android **661** and iOS **663** modules. Native Hermes bundles are **1.7 MB** each, with Ionicons as the only font family. These are exports, not an Apple-signed build.
- Final `scripts/build-apk.ps1`: exit **0**, **BUILD SUCCESSFUL in 5m 13s**, **344 actionable tasks: 14 executed, 330 up-to-date**. The generated native bundle timestamp follows the final source edits. Initial native regeneration/build also passed, in **23m 41s**. SDK metadata and upstream Gradle deprecation warnings remain; no dependency updates were made.
- `scripts/verify-apk.ps1`: exit **0**, **APK_CONTENT_OK: 2 C++ runtime ABI entries; 1 fonts; manifest, dex and offline Hermes bundle present**. Signature schemes **v2/v3** verified, one signer. The certificate SHA-256 remains `caae18af80a5b3ebe469954a0d861dc73ae51244012a41670ab0e54b2803bf56`, matching the 1.0 upgrade identity.
- Delivery: `release/Ankita-1.1.0-android.apk`, **42,803,226 bytes**, label **Ankita**, package **com.chief.mobile**, version **1.1.0 / code 2**, minimum SDK **24**, target SDK **36**, ARM64 and x86_64. Independent Node and PowerShell SHA-256 agree: `746acd75af95d24d715fd8c68d0088f45ce957ed3f6f25fef684e3d8e682de2d`.
- README, changelog and design brief updated. Latest successful screenshots are in `release/screenshots`; the earlier failure screenshot is preserved in the original external backup. Whitespace checks on source, scripts and tests against that backup printed no errors. Dependency declarations are identical to the baseline.

Limits: `adb devices -l` listed **no attached devices**. Physical Android installation/upgrade, native keyboard/safe areas, SecureStore, native animation/frame time and actual phone memory usage were not exercised. iOS was exported but not signed or run. Provider/Composio behavior used real HTTP fixtures, not paid providers or a user's connected accounts. The previous signing/data namespaces are preserved in code and APK metadata; an actual on-device upgrade still needs testing. No Git repository or remote mobile publication was created.

## 1.0.0 evidence (historical)

## Reproductions and fixes

- Baseline `npm test` attempted to run a directory as a module. Corrected discovery to `node --test` and added behavioral regressions.
- User log: provider `/models` blocked by CORS from Expo web origin. Real HTTP fixture deliberately omits CORS headers; same-origin relay discovers models and streams two actual generation requests successfully.
- User log: raw text child warning under View. Replaced string-valued conditional guards with booleans. Fresh Expo development loop ran with `Development-level warnings: ON` and zero console errors.
- Review: hung relay session could block Stop. Added abortable waiting and session deadline; regression aborts an unresolved promise.
- Review: explicit stream completion waited for connection closure. Real HTTP server now sends DONE and leaves socket open; generation returns and cancels its reader.
- Review: changing a provider during discovery displayed old models. Invalidate and abort requests on edits; browser loop changes URL while a delayed request is pending and checks no obsolete model/success is displayed.
- Visual inspection: glass background covered composer placeholder. Added explicit foreground stacking and layout regression; final screenshots inspected after motion settles.
- User log: `this.props.onContentSizeChange is not a function`. Captured the actual RN Web transcript layout callback, switched to an empty chat, and invoked the pending measurement. Before: exact reported TypeError. After separating the transcript and empty layout: the same regression passes in production preview and Expo development.
- Personal instructions: real HTTP request bodies prove both global and teammate instructions are present in OpenAI system messages and Anthropic system fields.
- Provider caching: the browser opens a saved model picker and selects its model with zero new model-discovery requests.
- Final review: provider removal now clears dependent teammate bindings; deleting an inactive teammate preserves the current teammate's stream. Both have regressions, including deletion during a live HTTP browser stream.
- Final review: Composio connection refresh follows catalog pagination instead of missing accounts after the first page. The HTTP fixture exercises multiple pages and repeated-cursor rejection.
- Teammate identity: both the default and former saved default prompt are tested so neither overrides a custom teammate's name.
- Sidebar: browser asserts the conversation touch row is 44–48 CSS pixels; screenshots confirm single-line rows without oversized cards.
- Android linker: generated commands invoke `CLANG_~1` and omit libc++; explicit C++ driver mode fixes filename-based driver selection. The workaround is applied to native subprojects via an Expo config plugin. [LLVM documents the driver mapping](https://clang.llvm.org/doxygen/structclang_1_1driver_1_1ParsedClangName.html).
- Android release lint: the first full run reached bytecode merging, then failed with `java.lang.OutOfMemoryError: Metaspace` at the 384 MiB metadata limit. The helper now exposes heap/metadata parameters and defaults to 768 MiB metadata; one worker still limits concurrent native work. The retry passed the previously failing AsyncStorage analysis and the final `:app:lintVitalRelease` gate.

## Executed evidence

- `npm test`: **33 tests, 33 pass, 0 fail**. Includes both OpenAI-compatible and Anthropic HTTP fixtures, Composio REST fixtures, tool continuation/cancellation/limits, rate limits, JSON bounds, export identity and final review regressions.
- `npm run typecheck`: exit 0 against actual installed React Native types.
- `npm run build:web`: production export with the four custom fonts and Ionicons.
- `npm run verify:ui`: `MOBILE_UI_OK`, six real HTTP generation requests, zero console errors or animation/pointer warnings; onboarding, delayed discovery invalidation, cached models without refetch, teammate create/edit/switch and inactive deletion during streaming, instruction payloads, Composio catalog/account/tool continuation/key removal fixtures, streaming, Stop, appearance, profile, About, 44dp sidebar, delayed scroll callback, reload, browser-key loss and clear.
- `npm run verify:dev`: the same loop passes with `Development-level warnings: ON` and `Performance optimizations: OFF`; isolated Expo process tree is cleaned up after verification.
- `expo install --check`: `Dependencies are up to date`.
- `npm audit`: **0 vulnerabilities** after font/blur dependencies.
- `npm run build:bundles`: final exports passed for web (394 modules), Android (666 modules) and iOS (668 modules), with offline Hermes native bundles and bundled Manrope/Sora fonts. This is bundle verification, not an iOS signed application build.
- Screenshots: `release/screenshots`, including onboarding, chat, settings, conversation library, appearance and narrow/wide layouts.
- Android Gradle release: `BUILD SUCCESSFUL in 11m 56s`; **344 actionable tasks: 57 executed, 287 up-to-date**. Final release lint passed at the updated metadata budget. SDK metadata/deprecation warnings remain upstream build warnings.
- Signing helper: reproduced PowerShell security-module autoload failure caused by duplicate type data, then used framework ACL/crypto APIs. Both initial key creation and reuse were exercised; the reused certificate fingerprint remained unchanged.
- `scripts/verify-apk.ps1`: deliberately rejected the intermediate debug-signed APK, then passed on the delivery artifact. **APK_CONTENT_OK: 2 C++ runtime ABI entries; 5 fonts; manifest, dex and offline Hermes bundle present**. Signature schemes v2/v3 verified; one signer, `CN=Chief`.
- Independent Node SHA-256 agrees with the PowerShell framework digest: `93a207f8c85dd00be13d25761c54f22e94741a77bc3f13eb7945de885052b18d`.

## Delivery status and limits

Delivered `release/Chief-1.0.0-android.apk`: **42,918,138 bytes**, package `com.chief.mobile`, version `1.0.0`/code `1`, minimum SDK **24**, target SDK **36**, ARM64 and x86_64. The delivery copy is signed with a private local release identity; certificate SHA-256 is `caae18af80a5b3ebe469954a0d861dc73ae51244012a41670ab0e54b2803bf56`. Preserve `.build-tools/signing` securely for compatible updates. Gradle packaging and the corrected signing/inspection helpers were executed separately; the original helper run ended at the PowerShell autoload failure after Gradle had succeeded.

This is an internal distribution APK. No Android device was attached (`adb devices` listed none), so physical installation, native runtime and Play Store publication have not been exercised. iOS bundle export passed, but an Apple-signed application was not built.

No real paid provider account, user credentials or physical phone were used in the fixture loop. Composio behavior was exercised against HTTP and browser fixtures, not a user's live account. Real provider billing/access and native keyboard, SecureStore and Android blur behavior still require device verification. Existing Expo servers need one restart to load the new relay middleware.
