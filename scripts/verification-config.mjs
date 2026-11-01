// Milliseconds: distinguish cold Metro compilation from ordinary UI actions.
// A listening dev server may return HTML before its first JS bundle is ready.
export const VERIFY_TIMEOUTS = { interactionMs: 15_000, developmentMs: 120_000, visualSettleMs: 600 }; // Let built-in modal exits and screen fades settle before screenshots.
