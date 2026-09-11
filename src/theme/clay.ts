/**
 * Claymorphism tokens — the Qubi "soft candy" design language.
 *
 * Per the ui-ux-pro-max design intelligence for mascot-led gamified apps:
 * soft inflated 3D shapes, big radii, multi-layer soft shadows, gradient candy
 * fills, spring-squish on press. This is what the Likelingo/Boons/Duolingo inspo
 * actually is — NOT harsh black neubrutalism.
 */
import type { ViewStyle } from 'react-native';

/** Rounded, chunky radii — bigger than a typical card scale. */
export const ClayRadius = {
  tile: 24,
  card: 28,
  cardLg: 34,
  button: 22,
  pill: 999,
} as const;

/** Brand hues + their darker "base" (the 3D underside) and lighter "top" (inflated highlight). */
export const Clay = {
  orange: '#FF8A3D', // slightly brighter, candy orange
  orangeTop: '#FFA45C',
  orangeBase: '#E0570A',
  green: '#5DD62C',
  greenTop: '#79E84A',
  greenBase: '#46A80F',
  sky: '#39BDF8',
  skyTop: '#5FCEFF',
  skyBase: '#1093D4',
  purple: '#9B6BFF',
  purpleTop: '#B48BFF',
  purpleBase: '#7A43E6',
  amber: '#FFC13D',
  amberTop: '#FFD264',
  amberBase: '#E29A0C',
  red: '#FF5A5A',
  redTop: '#FF7A7A',
  redBase: '#E23030',
  cream: '#FFFBEB', // warm background
  ink: '#3A2A1A', // warm cocoa ink
  wolf: '#8A7A6A', // secondary warm text
} as const;

export type ClayHue = 'orange' | 'green' | 'sky' | 'purple' | 'amber' | 'red';

export function clayRamp(hue: ClayHue): { top: string; base: string; mid: string } {
  switch (hue) {
    case 'green': return { top: Clay.greenTop, mid: Clay.green, base: Clay.greenBase };
    case 'sky': return { top: Clay.skyTop, mid: Clay.sky, base: Clay.skyBase };
    case 'purple': return { top: Clay.purpleTop, mid: Clay.purple, base: Clay.purpleBase };
    case 'amber': return { top: Clay.amberTop, mid: Clay.amber, base: Clay.amberBase };
    case 'red': return { top: Clay.redTop, mid: Clay.red, base: Clay.redBase };
    default: return { top: Clay.orangeTop, mid: Clay.orange, base: Clay.orangeBase };
  }
}

/** Soft ambient "clay" shadow — warm, diffuse, dropped down (never hard-offset black). */
export function claySoftShadow(isDark: boolean, strength: 'sm' | 'md' | 'lg' = 'md'): ViewStyle {
  const map = {
    sm: { radius: 10, y: 4, op: isDark ? 0 : 0.08 },
    md: { radius: 18, y: 9, op: isDark ? 0 : 0.10 },
    lg: { radius: 28, y: 16, op: isDark ? 0 : 0.14 },
  } as const;
  const s = map[strength];
  return {
    shadowColor: '#6B3E12',
    shadowOpacity: s.op,
    shadowRadius: s.radius,
    shadowOffset: { width: 0, height: s.y },
    elevation: isDark ? 0 : Math.round(s.radius / 4),
  };
}

interface ClayCardOpts {
  isDark: boolean;
  radius?: number;
  fill?: string;
  strength?: 'sm' | 'md' | 'lg';
}

/** Soft inflated card: rounded, warm fill, diffuse shadow, faint top rim highlight. */
export function clayCardStyle({ isDark, radius = ClayRadius.card, fill, strength = 'md' }: ClayCardOpts): ViewStyle {
  return {
    backgroundColor: fill ?? (isDark ? '#1E1712' : '#FFFFFF'),
    borderRadius: radius,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
    ...claySoftShadow(isDark, strength),
  };
}
