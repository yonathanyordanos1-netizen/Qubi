import { View, ViewStyle } from 'react-native';

/**
 * Shared soft-embossed (neumorphic) surface used by tiles, pills and the nav
 * bar. Kept deliberately subtle — low-alpha dual shadows + a warm tinted fill.
 * Ported from neo_surface.dart. iOS renders both shadows via stacked layers
 * (one shadow per view); Android falls back to a single elevation shadow.
 */

export interface NeoSurfaceOpts {
  radius?: number;
}

export function neoSurfaceFill(isDark: boolean): string {
  return isDark ? '#171D24' : '#F7F3EE';
}

/** The primary (bottom-right) shadow of the pair. */
export function neoShadowA(isDark: boolean, radius: number): ViewStyle {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius,
    backgroundColor: 'transparent',
    shadowColor: isDark ? '#05070B' : '#6B5D55',
    shadowOpacity: isDark ? 0.8 : 0.333, // alpha CC ≈ .80 dark, 55 ≈ .33 light
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 5 },
    elevation: isDark ? 4 : 2,
  };
}

/** The secondary (top-left) highlight shadow of the pair. */
export function neoShadowB(isDark: boolean, radius: number): ViewStyle {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius,
    backgroundColor: 'transparent',
    shadowColor: isDark ? '#3B4354' : '#FFFFFF',
    shadowOpacity: isDark ? 0.122 : 1, // alpha 1F ≈ .12 dark, FF light
    shadowRadius: 10,
    shadowOffset: { width: -3, height: -4 },
    elevation: 0,
  };
}

export function neoSurfaceDecoration(isDark: boolean, opts: NeoSurfaceOpts = {}): ViewStyle {
  const radius = opts.radius ?? 16;
  return {
    backgroundColor: neoSurfaceFill(isDark),
    borderRadius: radius,
  };
}
