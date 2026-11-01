import { Platform } from 'react-native';
// ANKITA phone palette follows the desktop companion. Legacy colors remain for
// the unused source scaffold; active screens use the semantic PALETTES below.
// All colors are unit: hex sRGB. Spacing/radius in dp (unit: density-independent pixels).
// Screens must import from here; no inline color/spacing literals elsewhere.

export const COLOR = {
  // Warm near-black backdrop (evening desk).
  background: '#111113',
  // Slightly lifted surface for cards / chat bubbles.
  surface: '#1D1D21',
  // Cream ink for headings / wordmark.
  cream: '#F4F3F7',
  // Muted cream for secondary text.
  creamMuted: '#96959F',
  // Signature Chief yellow (underline, crown, primary CTA).
  honey: '#F5B942',
  // Soft sunset orange for gradients / highlights.
  sunset: '#E8836B',
  // Leafy green from the window vines (success / Tasks).
  leaf: '#8FD0A2',
  // Code blue (Code & Debug accent).
  codeBlue: '#9BB8FF',
  // Rose for Manage/notes accent.
  rose: '#F08CA0',
  // Lavender for Tools / memory accent.
  lavender: '#C3AEE6',
} as const;

export type ChiefColorName = keyof typeof COLOR;
const systemFont = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }); // Platform-native UI font; no display-font loading delay.
export const TYPE = { body: systemFont, medium: systemFont, strong: systemFont, display: systemFont, code: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) } as const;
export const MOTION = { durationMs: 180, thinkingMs: 700, pressScale: 0.97, blurIntensity: 40, dotSize: 5, screenOffset: 6, mascotMs: 650, mascotLift: -3 } as const; // Milliseconds, dp offsets/dots and unitless press scale.
export const VISUAL = { heroSize: 28, heroLine: 35, heroSizeCompact: 24, heroLineCompact: 30, artwork: 132, orbit: 184, orbitInset: 28, markSize: 94, libraryTitle: 25, previewLines: 2, stroke: 1, profileSize: 64 } as const; // dp/sp: mobile geometry.
export const GLASS = { dark: '#25262BCC', light: '#FFFFFFCC', darkEdge: '#FFFFFF18', lightEdge: '#00000012' } as const;

export const LEGACY_PALETTE = { background: '#1E1B16', cream: '#FFF6E8', honey: '#F5B942' };
export const PALETTES = {
  dark: { background: '#181A1E', surface: '#202329', elevated: '#2B2F36', text: '#F1F3F6', muted: '#A2A9B4', border: '#343840', inverse: '#181A1E', success: '#79CEAA', danger: '#FFA4AD', overlay: '#080B10A8', navigation: '#121418' },
  light: { background: '#FAFBFC', surface: '#FFFFFF', elevated: '#EEF1F5', text: '#252A33', muted: '#667080', border: '#DEE3EB', inverse: '#FFFFFF', success: '#26764D', danger: '#B53243', overlay: '#17203360', navigation: '#F0F2F6' },
} as const; // Hex colors in sRGB; themes are global, not assigned per screen.
export const ACCENTS = {
  lavender: { name: 'Graphite', dark: '#D5D8DE', light: '#454B55' }, // Stable saved accent key; default now matches the desktop.
  blue: { name: 'Blue', dark: '#A4C7FF', light: '#346DCE' },
  sage: { name: 'Sage', dark: '#B2CCB0', light: '#527D50' },
  amber: { name: 'Amber', dark: '#EBC894', light: '#906328' },
} as const;
export const METRICS = {
  icon: 22, smallIcon: 17, touch: 44, avatar: 40, largeAvatar: 72, brand: 112,
  header: 72, contentWidth: 760, desktopWidth: 1440, panelWidth: 480,
  navigationBreakpoint: 960, navigationWidth: 280, welcomeMark: 52, promptIcon: 36, toolCardHeight: 64,
  keyboardOffset: 0, composerMaxHeight: 140, minimumInputHeight: 44,
  textLine: 25, largeTextLine: 29, largeText: 18, titleLine: 42, letterSpacing: -0.6,
  eyebrowTracking: 0.8,
  previewWidth: 148, previewHeight: 180, hairline: 1, opacityPressed: 0.72,
  disabledOpacity: 0.35, pillInset: 6, sheetTop: 60, smallRadius: 12,
  wideBreakpoint: 740, inputSize: 15, tinyFont: 11, timestampFont: 12,
  lineLimit: 2, subtitleLimit: 1, historyTitleLimit: 52, historyPreviewLimit: 160,
  drawerWidth: 340, drawerFraction: '86%', sessionHeight: 72,
} as const; // Layout in dp/sp; opacity values are unitless ratios.

export const RADIUS = {
  // Cards, input bar (unit: dp).
  card: 20,
  // Pills, badges, chips (unit: dp).
  pill: 999,
  // Buttons (unit: dp).
  button: 12,
  // Speech-bubble tail corner (unit: dp).
  tail: 8,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Font sizes (unit: sp — scaled pixels). Rounded bold headings echo the Chief wordmark.
export const FONT_SIZE = {
  hero: 34,
  title: 20,
  body: 16,
  caption: 13,
} as const;

export const PHONE = { headerName: 16, headerDetail: 12, modelChip: 30, heroMascot: 80, headerMascot: 34, actionHeight: 34, compactHeight: 700, actionHitSlop: 6, jumpOffset: 52, listWindow: 7, listInitial: 12, listBatch: 8, listBatchMs: 40, scrollThrottleMs: 32, followSlop: 60, sheetHandle: 32, sheetHandleHeight: 4, draftLimit: 24 } as const; // dp/sp (including bottom-follow tolerance), bounded FlatList counts, milliseconds and retained in-memory draft count.
export const MASCOT = { body: '#E6E8ED', eye: '#191B20', highlight: '#F5F6F8', colors: ['#C8BEA7', '#AFC8BE', '#BBC5DE', '#C9BED6'], heightRatio: 0.83, radiusRatio: 0.37, eyeWidth: 0.085, eyeHeight: 0.13, eyeGap: 0.16, eyeShift: 0.1, shadeInset: 0.08, hashSeed: 0, hashMultiplier: 31 } as const; // sRGB colors and body-relative geometry; stable identity hash differentiates teammates.

// Feature accents shown in the poster row: Work/Code/Tasks/Search/Tools/Memory.
export const FEATURE_ACCENTS = [
  COLOR.honey,
  COLOR.codeBlue,
  COLOR.rose,
  COLOR.leaf,
  COLOR.lavender,
  COLOR.sunset,
] as const;
