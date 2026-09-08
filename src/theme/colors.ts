/**
 * Qubi Design System v8 "Qubi Glow" — derived from the Qubi mascot
 * (warm cocoa fur, quest-orange glow, star gold, sky-teal backdrop).
 * Canvas Light: warm cream #FFF9F3, Dark: warm OLED #0D0A08.
 * Accent: #F97316 (Quest Orange) / #FFC531 (Star Gold) / #0EA5E9 (Sky Teal).
 * Glass: native `GlassView` on iOS 26+, `BlurView` fallback elsewhere.
 * Radii: sm12 md16 lg24 xl32 — avatars are circular (see QubiAvatar).
 * Text: Light #1C1917 / Dark #FAF7F2.
 */

/* ── Canvas & Surfaces ─────────────────────────────────────────────── */
export const AppColors = {
  canvas: '#FAFAFA',
  canvasAlt: '#F8F9FA',
  canvasDark: '#0B0F19',
  surfaceContainerLowest: 'rgba(255,255,255,0.9)',     /* glassest base */
  surfaceContainerLow: 'rgba(255,255,255,0.7)',        /* card bg */
  surfaceContainer: 'rgba(255,255,255,0.5)',           /* elevated */
  surfaceContainerHigh: '#F8FAFC',                     /* hover / selection */
  surfaceContainerHighest: '#F1F5F9',                  /* muted cards */

  /* ── Card tokens — minimalist spec, glass-ready ───────────────────── */
  cardWhite: '#FFFFFF',
  cardBorder: 'rgba(255,255,255,0.3)',
  cardBorderStrong: 'rgba(255,255,255,0.2)',
  cardShadow: 'rgba(0,0,0,0.15)',

  /* ── Glass effect tokens (matched to native GlassView) ─────────────── */
  glassLight: 'rgba(255,255,255,0.4)',     /* iOS 26+ native GlassView default */
  glassDark: 'rgba(15,23,42,0.4)',          /* dark mode native GlassView */
  glassEdge: 'rgba(255,255,255,0.2)',
  glassEdgeDark: 'rgba(255,255,255,0.15)',
  outlineVariant: 'rgba(255,255,255,0.3)',
  glassBackingLight: 'rgba(255,255,255,0.14)',
  glassBackingDark: 'rgba(15,23,42,0.28)',

  /* ── Brand — Quest Orange + Star Gold + warm cocoa ───────────────── */
  primary: '#F97316',
  primaryDeep: '#EA580C',
  primarySoft: '#FFF3E8',
  primaryFixedDim: '#0EA5E9',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#1C1917',
  /** Glowing star gold (mascot star) — streaks, rewards, highlights. */
  star: '#FFC531',
  starDeep: '#E8930C',
  /** Warm cream wash (mascot backdrop top). */
  cream: '#FFF7ED',
  /** Deep cocoa brown (mascot fur) — dark-mode glow text, warm depth. */
  cocoa: '#422006',
  /** Ember — pressed/edge tone for 3D CTA shadows. */
  ember: '#C2410C',

  /* ── Sky Cyan secondary accent ───────────────────────────────────── */
  secondary: '#0EA5E9',
  secondaryDeep: '#0284C7',
  secondarySoft: '#F0F9FF',
  sky: '#0EA5E9',
  skySoft: '#E0F2FE',
  skyDeep: '#0284C7',

  /* ── Success / XP ────────────────────────────────────────────────── */
  success: '#10B981',
  successSoft: '#ECFDF5',
  successDeep: '#059669',
  accent: '#0284C7',
  secondaryContainer: '#E0F2FE',
  tertiaryContainer: '#475569',
  error: '#EF4444',
  onError: '#FFFFFF',

  /* ── Gamification tokens ─────────────────────────────────────────── */
  gold: '#F59E0B',
  silver: '#94A3B8',
  bronze: '#D97706',
  platinum: '#E2E8F0',
  diamond: '#38BDF8',

  /* ── Text hierarchy — warm minimalist ───────────────────────────── */
  ink: '#1C1917', // warm cocoa headings
  inkLight: '#FAF7F2',
  muted: '#78716C', // warm stone body
  mutedLight: '#A8A29E',
  heading: '#1C1917',
  body: '#78716C',
  subtitle: '#A8A29E',
  placeholder: '#A8A29E',

  /* ── Tracks / chips ──────────────────────────────────────────────── */
  gaugeTrack: '#F1F5F9',
  gaugeTrackDark: '#1E293B',
  chip: '#0EA5E922',
  chipMuted: '#F0F9FF',

  /* ── Legacy compat (still referenced across screens) ─────────────────── */
  chipBg: '#F1F5F9',
  border: '#F1F5F9',
  borderDark: '#1E293B',
  cardLight: '#FFFFFF',
  cardDark: '#1E293B',
  mutedLightDark: '#94A3B8',
  rewardBlue: '#0EA5E9',
  rewardInkMid: '#0EA5E9',

  /* ── Gamification semantic aliases ───────────────────────────────── */
  streakAmber: '#F59E0B',
  streakAmberDeep: '#D97706',
  xpGreen: '#10B981',
  xpGreenSoft: '#ECFDF5',
  questOrange: '#F97316',
  questOrangeDeep: '#C2410C',

  /* ── Duolingo "Feather" path semantics ────────────────────────────── */
  pathGreen: '#58CC02',
  pathGreenDeep: '#58A700',
  pathGold: '#FFC800',
  pathGoldDeep: '#E6A800',
  pathLocked: '#E5E5E5',
  pathLockedBorder: '#DCDCDC',
  pathLockedInk: '#B0B0B0',

  /* ── Neubrutalism + Liquid Glass accents (Duolingo-inspired) ────────── */
  duoGreen: '#58CC02',
  duoGreenDeep: '#58A700',
  duoYellow: '#FFC800',
  duoRed: '#FF4B4B',
  duoBlue: '#1CB0F6',
  duoBlueDeep: '#0B9BD8',
  neoInk: '#000000',
} as const;

/** Applies an alpha to a hex color → rgba() string */
export function withAlpha(hexColor: string, alpha: number): string {
  let c = hexColor.trim();
  if (c.length === 9 && c.startsWith('#')) c = c.slice(0, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return hexColor;
  const r = Number.parseInt(c.slice(1, 3), 16);
  const g = Number.parseInt(c.slice(3, 5), 16);
  const b = Number.parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
