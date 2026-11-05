# Provider reliability and app polish implementation plan

The requested outcome is a usable app with reliable provider setup, model discovery, generation tests and chat. Fix confirmed related failures and polish the existing screens.

## Approach

Keep Expo, the current graphite/light palettes and workspace navigation. Android is the reported failing platform. Keep native provider traffic direct and restore the cancellation APIs missing from the installed native runtime before app modules load. Browser traffic uses the existing same-origin relay, with recoverable session handling and bounded waits. Retain the relay's local-only, origin, token and route checks.

Provider setup will show which operation is running, allow cancellation, explain connection failures accurately and retain entered details. Keep labels left-aligned, use existing spacing and typography tokens and retain touch-size controls. Review phone and wide layouts visually.

## Work

- [x] Reproduce Android failure with the actual installed React Native controller before changing production code.
- [x] Add feature-probed startup compatibility and exercise native cancellation, model protocols and durable assistant changes.
- [x] Update the Kilo preset, migrate exact legacy saved roots and validate pasted legacy URLs using the documented current endpoint.
- [x] Reproduce provider setup and chat through a real CORS-less HTTP fixture using the actual app.
- [x] Reproduce recovery after a failed relay handshake and server restart before changing production code.
- [x] Add focused transport tests for concurrent handshakes, cancellation, explicit session expiry, unavailable relays and upstream authorization failures.
- [x] Fix shared browser transport without automatically replaying requests that might have reached a provider.
- [x] Add actionable provider errors and clear, cancellable operation states in the provider editor.
- [x] Run and inspect the existing chat, assistant, output and work acceptance flows. Fix additional confirmed blockers with regressions.
- [x] Polish observed screen issues using existing tokens and navigation conventions.
- [x] Run the complete unit suite, typecheck, web build, relevant real-browser verifiers and native bundle exports.
- [x] Build and verify the signed Android installer with the existing update identity.
- [x] Record exact results, traces and remaining physical-device or live-provider coverage limits.

## Verification

Use fresh browser contexts and fixture keys. Keep diagnostic screenshots in a runtime temporary directory. Never print or send a user's saved API key. Check request arrival and actual streamed replies, not only button states.

## Review focus

- A failed initial handshake must not disable future provider requests for the whole tab.
- A changed local relay token must be refreshed without classifying it as provider authentication failure.
- An upstream authorization error must reach the user without another generation attempt.
- Cancellation must settle while shared setup is pending and keep edited provider details intact.
- Saving, reopening, switching providers and changing models must preserve the intended endpoint, key and current chat draft.
