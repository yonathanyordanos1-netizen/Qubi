import { TextStyle } from 'react-native';
import { AppColors } from './colors';

/**
 * Poppins (display / headings) + Space Grotesk (body / labels) text styles.
 * Loaded at boot via useAppFonts — see src/theme/useAppFonts.ts.
 */

/**
 * Weight → family map. Display weights (w700+) use Fredoka (rounded, playful);
 * body/label weights use Nunito (warm, legible). Fredoka tops out at 700 Bold —
 * its rounded heft reads bolder than its numeric weight, so it covers w800/w900.
 */
const F = {
  w400: 'Nunito_400Regular',
  w500: 'Nunito_500Medium',
  w600: 'Nunito_700Bold',
  w700: 'Fredoka_600SemiBold',
  w800: 'Fredoka_700Bold',
  w900: 'Fredoka_700Bold',
} as const;

export type FontWeight = keyof typeof F;

/** Resolve a weight to its loaded font family. */
export const fontFamilyFor = (weight: FontWeight = 'w500') => F[weight];

interface Opts {
  color?: string;
}

/** mega: 44 / w900 / tight — XP counters, celebration numerals */
export const mega = ({ color = AppColors.ink }: Opts = {}): TextStyle => ({
  fontFamily: F.w900,
  fontSize: 44,
  lineHeight: 46,
  letterSpacing: -2,
  color,
});

/** display: 36 / w900 / h1.1 / ls-1.4 */
export const display = ({ color = AppColors.ink }: Opts = {}): TextStyle => ({
  fontFamily: F.w900,
  fontSize: 36,
  lineHeight: 36 * 1.1,
  letterSpacing: -1.4,
  color,
});

/** headline: 24 / w800 / h1.2 / ls-0.5 */
export const headline = ({ color = AppColors.ink }: Opts = {}): TextStyle => ({
  fontFamily: F.w800,
  fontSize: 24,
  lineHeight: 24 * 1.2,
  letterSpacing: -0.5,
  color,
});

/** title: 18 / w700 / h1.3 / ls-0.3 */
export const title = ({ color = AppColors.ink }: Opts = {}): TextStyle => ({
  fontFamily: F.w700,
  fontSize: 18,
  lineHeight: 18 * 1.3,
  letterSpacing: -0.3,
  color,
});

/** body: 15 / w500 / h22 — spec */
export const body = ({ color = AppColors.muted }: Opts = {}): TextStyle => ({
  fontFamily: F.w500,
  fontSize: 15,
  lineHeight: 22,
  color,
});

/** label: 13 / w600 / ls0.2 */
export const label = ({ color = AppColors.ink }: Opts = {}): TextStyle => ({
  fontFamily: F.w600,
  fontSize: 13,
  lineHeight: 13 * 1.3,
  letterSpacing: 0.2,
  color,
});

/** Legacy helper used by the onboarding wizard. */
export const bold = (size: number, color: string, letterSpacing?: number): TextStyle => ({
  fontFamily: F.w800,
  fontSize: size,
  lineHeight: size * 1.2,
  color,
  letterSpacing: letterSpacing ?? -0.5,
});

export const categoryNames = ['Fitness', 'Intellect', 'Discipline'] as const;
export const categoryColors = [AppColors.primary, AppColors.secondaryContainer, AppColors.tertiaryContainer];

export function categoryColor(index: number): string {
  if (index < 0 || index >= categoryColors.length) return AppColors.primary;
  return categoryColors[index];
}

/** Full Material-style text scale, mirroring AppFonts.apply(). */
export const textStyles = {
  displayLarge: { ...display(), fontSize: 40, lineHeight: 40 * 1.1, letterSpacing: -1.5 },
  displayMedium: display(),
  displaySmall: { ...display(), fontSize: 28, lineHeight: 28 * 1.15, letterSpacing: -0.8 },
  headlineLarge: headline(),
  headlineMedium: { ...headline({}), fontFamily: F.w700, fontSize: 21, lineHeight: 21 * 1.25, letterSpacing: -0.3 },
  headlineSmall: { fontFamily: F.w700, fontSize: 18, lineHeight: 18 * 1.3, letterSpacing: -0.2 },
  titleLarge: { fontFamily: F.w700, fontSize: 17, lineHeight: 17 * 1.3, letterSpacing: -0.3 },
  titleMedium: { fontFamily: F.w700, fontSize: 15, lineHeight: 15 * 1.3 },
  titleSmall: { fontFamily: F.w700, fontSize: 13, lineHeight: 13 * 1.3 },
  bodyLarge: { fontFamily: F.w500, fontSize: 16, lineHeight: Math.round(16 * 1.45) },
  bodyMedium: { fontFamily: F.w500, fontSize: 14, lineHeight: Math.round(14 * 1.45) },
  bodySmall: { fontFamily: F.w500, fontSize: 12, lineHeight: Math.round(12 * 1.4) },
  labelLarge: { fontFamily: F.w700, fontSize: 15, lineHeight: 15 * 1.3, letterSpacing: 0.1 },
  labelMedium: { fontFamily: F.w600, fontSize: 13, lineHeight: 13 * 1.3, letterSpacing: 0.2 },
  labelSmall: { fontFamily: F.w600, fontSize: 11, lineHeight: 11 * 1.3, letterSpacing: 0.4 },
} as const satisfies Record<string, TextStyle>;
