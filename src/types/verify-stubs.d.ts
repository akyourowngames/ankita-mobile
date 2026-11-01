// Build-verification stubs only. Production Expo builds resolve real modules.
// Why shorthand: lets `tsc --noEmit` run without installing
// 500MB of expo/react-native deps, while keeping imports typed as any.
// NOTE: no `export {}` here — this stays a script .d.ts so `declare module`
// acts as ambient declaration and top-level `JSX` registers globally.
// Verification uses real installed types, never ambient any replacements.
export {};
