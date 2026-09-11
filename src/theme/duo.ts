/**
 * Duolingo design language — canonical tokens.
 *
 * The Qubi look leans into the *friendly* Duolingo / Likelingo aesthetic seen in
 * `./inspo`: clean white cards with a soft gray border and a signature bottom
 * "lip" (a thicker bottom border that reads as a subtle 3D edge), colored 3D
 * pill buttons, generous whitespace and bold rounded numerals. This intentionally
 * replaces the earlier harsh black-neubrutalist borders + hard offset shadows,
 * which read as noisy on device.
 *
 * Import these instead of hardcoding card/border values in screens.
 */
import type { ViewStyle } from 'react-native';
import { AppColors } from './colors';

/** Duolingo palette — the six brand hues + their darker "edge" shades. */
export const Duo = {
  green: '#58CC02',
  greenEdge: '#58A700',
  blue: '#1CB0F6',
  blueEdge: '#1899D6',
  purple: '#8B5CF6',
  purpleEdge: '#7C3AED',
  red: '#FF4B4B',
  redEdge: '#EA2B2B',
  yellow: '#FFC800',
  yellowEdge: '#E6A700',
  orange: AppColors.primary, // #F97316
  orangeEdge: '#C2410C',
  ink: '#3C3C3C', // Duolingo eel (dark text)
  wolf: '#777777', // secondary text
  swan: '#E5E5E5', // hairline / card border (light)
  polar: '#F7F7F7', // subtle fill
} as const;

/** Radii — squircle-friendly, chunkier than the old 12/16 scale. */
export const DuoRadius = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/** Depth of the signature bottom-lip on cards & buttons. */
export const DUO_LIP = 4;

interface CardOpts {
  isDark: boolean;
  radius?: number;
  /** Accent border tint (defaults to neutral swan / white-alpha). */
  border?: string;
  /** Fill override. */
  fill?: string;
  /** Drop the bottom lip for flush sub-cards. */
  flat?: boolean;
}

/**
 * The canonical Duolingo card: solid fill, 2px soft border and a 4px bottom lip.
 * No drop shadow — Duolingo surfaces are flat and rely on the lip for depth.
 */
export function duoCard({ isDark, radius = DuoRadius.lg, border, fill, flat }: CardOpts): ViewStyle {
  const borderColor = border ?? (isDark ? 'rgba(255,255,255,0.10)' : Duo.swan);
  return {
    backgroundColor: fill ?? (isDark ? '#171310' : '#FFFFFF'),
    borderRadius: radius,
    borderWidth: 2,
    borderColor,
    borderBottomWidth: flat ? 2 : DUO_LIP,
    // Whisper-soft ambient shadow so cards lift off the cream canvas without
    // the harsh black offset of the old neubrutalist style.
    shadowColor: '#5B3A1A',
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: isDark ? 0 : 1,
  };
}

/** A soft-tinted "info" chip fill for a given accent (e.g. XP pills, badges). */
export function duoTintFill(hex: string, isDark: boolean): ViewStyle {
  return {
    backgroundColor: isDark ? `${hex}22` : `${hex}1A`,
  };
}
