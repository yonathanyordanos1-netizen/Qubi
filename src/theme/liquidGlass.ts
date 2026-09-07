import { withAlpha } from './colors';

/**
 * Apple Liquid Glass material system — 3-tier hierarchy.
 *
 * Tier 1  Background surfaces / sub-cards   — sheerness with faint blur
 * Tier 2  Floating controls (tab bar, FAB)  — fluid fill + specular rim
 * Tier 3  Modals & action sheets            — deep blur, pronounced rim
 *
 * Blur values are consumed by <BlurView intensity>. All fills/borders are
 * rgba so materials composite correctly over any content.
 */

export interface GlassTier {
  /** BlurView intensity prop. */
  blurIntensity: number;
  /** Translucent base fill drawn over the blur. */
  fill: string;
  /** Specular rim border. */
  borderColor: string;
  borderWidth: number;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

const light: Record<'tier1' | 'tier2' | 'tier3', GlassTier> = {
  tier1: {
    blurIntensity: 40,
    fill: 'rgba(255, 255, 255, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  tier2: {
    blurIntensity: 90,
    fill: 'rgba(255, 255, 255, 0.38)',
    borderColor: 'rgba(255, 255, 255, 0.70)',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  tier3: {
    blurIntensity: 100,
    fill: 'rgba(255, 255, 255, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 14,
  },
};

const dark: Record<'tier1' | 'tier2' | 'tier3', GlassTier> = {
  tier1: {
    ...light.tier1,
    fill: 'rgba(28, 28, 30, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  tier2: {
    ...light.tier2,
    fill: 'rgba(24, 24, 26, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  tier3: {
    ...light.tier3,
    fill: 'rgba(20, 20, 22, 0.60)',
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
};

export const liquidGlass = { light, dark };

/** Specular edge reflection + top rim light stroke (apply over any tier). */
export const liquidGlassStyles = {
  floatingContainer: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  innerHighlight: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.85)',
  } as const,
  /** Glass specular highlight border for light mode. */
  specularBorder: 'rgba(255, 255, 255, 0.65)',
  /** Apple-style alert red for badges. */
  badgeRed: '#FF3B30',
} as const;

/** Convenience: tier lookup by mode. */
export function glassTier(tier: 'tier1' | 'tier2' | 'tier3', isDark: boolean): GlassTier {
  return isDark ? dark[tier] : light[tier];
}

/** Sheer card fill for Tier-1 surfaces (used by LiquidGlassCard). */
export function cardGlassFill(isDark: boolean): string {
  return isDark ? withAlpha('#1C1C1E', 0.5) : withAlpha('#FFFFFF', 0.5);
}

/** Card specular border for Tier-1 surfaces. */
export function cardGlassBorder(isDark: boolean): string {
  return isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.40)';
}
