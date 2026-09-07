import { ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';

import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeProvider';

/**
 * v4 Studio Elevation — pure white content cards
 * bg: #FFFFFF, border: rgba(0,0,0,0.05), shadow: #0F172A 0.04/6/16 elev 3
 */

export interface LiquidGlassCardProps {
  children: ReactNode;
  radius?: number;
  blur?: number;
  tint?: string;
  borderColor?: string;
  padding?: number;
  overlay?: ReactNode;
  onTap?: (() => void) | null;
  semanticLabel?: string;
}

export function LiquidGlassCard({
  children,
  radius = 24,
  blur: _blur,
  tint,
  borderColor,
  padding = 16,
  overlay,
  onTap,
  semanticLabel,
}: LiquidGlassCardProps) {
  const { isDark } = useTheme();
  const fill = tint ?? (isDark ? '#161E2E' : '#FFFFFF');
  const edge = borderColor ?? (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9');

  const surface = (
    <View
      style={[
        {
          backgroundColor: fill,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: edge,
          overflow: 'hidden',
          shadowColor: isDark ? '#000000' : '#0F172A',
          shadowOffset: { width: 0, height: isDark ? 8 : 6 },
          shadowOpacity: isDark ? 0.35 : 0.04,
          shadowRadius: isDark ? 20 : 16,
          elevation: isDark ? 0 : 3,
        },
      ]}
    >
      <View style={{ padding }}>
        <View style={{ flex: 1 }}>
          {children}
          {overlay != null && (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {overlay}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  if (onTap == null) return surface;

  return (
    <Pressable accessible accessibilityRole="button" accessibilityLabel={semanticLabel} onPress={onTap}>
      {surface}
    </Pressable>
  );
}

export function GlassSheen({ opacity = 0.04 }: { opacity?: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[withAlpha('#FFFFFF', opacity), withAlpha('#FFFFFF', 0)]}
      locations={[0, 0.45]}
      style={StyleSheet.absoluteFill}
    />
  );
}

export function GlassSurface({
  children,
  radius = 24,
  padding = 16,
  onTap,
  color,
  borderColor,
}: {
  children: ReactNode;
  radius?: number;
  padding?: number;
  onTap?: (() => void) | null;
  color?: string;
  borderColor?: string;
}) {
  const { isDark } = useTheme();
  const body = <View style={{ padding }}>{children}</View>;
  const surface = (
    <View
      style={[
        {
          backgroundColor: color ?? (isDark ? '#161E2E' : '#FFFFFF'),
          borderRadius: radius,
          borderWidth: 1,
          borderColor: borderColor ?? (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'),
          overflow: 'hidden',
          shadowColor: isDark ? '#000000' : '#0F172A',
          shadowOffset: { width: 0, height: isDark ? 8 : 6 },
          shadowOpacity: isDark ? 0.35 : 0.04,
          shadowRadius: isDark ? 20 : 16,
          elevation: isDark ? 0 : 3,
        },
      ]}
    >
      {onTap != null ? (
        <Pressable onPress={onTap} android_ripple={{ color: withAlpha(AppColors.primary, 0.08) }}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
  return surface;
}

// ═══ Real Apple Liquid Glass (expo-glass-effect, iOS 26+) ═══════════════════

/**
 * Reactive check for genuine native Liquid Glass rendering.
 *
 * True only when ALL hold:
 *  - iOS with the Glass API present at runtime (`isGlassEffectAPIAvailable`,
 *    the crash-prevention guard Expo added for iOS 26 betas — issue #40911),
 *  - the app binary was compiled with Liquid Glass support
 *    (`isLiquidGlassAvailable`),
 *  - the user has NOT enabled Reduce Transparency (HIG: respect the
 *    accessibility setting; re-evaluated live via AccessibilityInfo).
 */
export function useNativeGlass(): boolean {
  const [available, setAvailable] = useState<boolean>(false);
  useEffect(() => {
    let mounted = true;
    const check = async (): Promise<void> => {
      try {
        const reduceTransparency = await AccessibilityInfo.isReduceTransparencyEnabled();
        if (mounted) setAvailable(!reduceTransparency && checkNativeGlass());
      } catch {
        if (mounted) setAvailable(checkNativeGlass());
      }
    };
    void check();
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', () => {
      void check();
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return available;
}

function checkNativeGlass(): boolean {
  try {
    if (Platform.OS !== 'ios') return false;
    if (!isGlassEffectAPIAvailable()) return false;
    if (!isLiquidGlassAvailable()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * True at runtime only when the device can render native Liquid Glass
 * (iOS 26+ with the Glass API present). Everything else — Android, web,
 * older iOS — falls back to the frosted BlurView look.
 *
 * Evaluated once at module load; availability cannot change mid-session.
 * Prefer `useNativeGlass()` in new code (it also respects Reduce
 * Transparency); this constant remains for cheap non-reactive reads.
 */
function detectNativeGlass(): boolean {
  try {
    if (Platform.OS !== 'ios') return false;
    return isGlassEffectAPIAvailable() === true && isLiquidGlassAvailable() === true;
  } catch {
    return false;
  }
}

export const NATIVE_GLASS = detectNativeGlass();

export interface NativeGlassContainerProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * The distance (pt) at which neighbouring glass elements start to merge
   * into one continuous lens — the genuine iOS 26 behaviour for a tab bar
   * with a docked/overlapping FAB. No-op on the fallback path.
   */
  spacing?: number;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}

/**
 * Groups neighbouring `NativeGlass` surfaces so the native renderer merges
 * them into one continuous lens (bar + FAB). Falls back to a plain View —
 * children keep their own BlurView fallback styling.
 */
export function NativeGlassContainer({ children, style, spacing, pointerEvents }: NativeGlassContainerProps) {
  const native = useNativeGlass();
  if (native) {
    return (
      <GlassContainer spacing={spacing} style={style} pointerEvents={pointerEvents}>
        {children}
      </GlassContainer>
    );
  }
  return (
    <View style={style} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}

export type NativeGlassMaterial = 'clear' | 'regular' | 'none';

export interface NativeGlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Real-glass material on iOS 26+: 'clear' = sheer lens (FABs, chips),
   * 'regular' = frosted chrome (bars, sheets), 'none' = content without
   * the lens (lets a parent GlassContainer provide the effect).
   */
  glass?: NativeGlassMaterial;
  /** Optional tint for the real glass (e.g. brand orange wash). */
  tintColor?: string;
  /**
   * Makes the lens respond to touches with Apple's interactive distortion.
   * Genuine iOS 26 behaviour for bars and controls. No-op on fallback.
   */
  interactive?: boolean;
  /**
   * Natively animate a material transition (e.g. regular → clear on scroll
   * collapse) via `glassEffectStyle: { style, animate, animationDuration }`.
   * This is Apple's recommended way to fade glass — NEVER animate `opacity`
   * (values < 1 stop the glass shader rendering).
   */
  animateTransition?: boolean;
  animationDuration?: number;
  /** BlurView fallback intensity for non-glass platforms. */
  fallbackIntensity?: number;
  /** BlurView fallback tint for non-glass platforms. */
  fallbackTint?: React.ComponentProps<typeof BlurView>['tint'];
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  /** Force the fallback even when native glass is available (testing). */
  forceFallback?: boolean;
}

/**
 * Floating-surface primitive: genuine native iOS Liquid Glass
 * (`UIGlassEffect` via `UIVisualEffectView`) where available, frosted
 * BlurView everywhere else. Same layout box on both paths.
 *
 * CONSTRAINT (Apple): never set opacity < 1 on this view or its parents —
 * the glass shader stops rendering. Fade via conditional rendering or the
 * `animateTransition` material animation instead.
 */
export function NativeGlass({
  children,
  style,
  glass = 'regular',
  tintColor,
  interactive = false,
  animateTransition = false,
  animationDuration,
  fallbackIntensity = 70,
  fallbackTint,
  pointerEvents,
  forceFallback = false,
}: NativeGlassProps) {
  const { isDark } = useTheme();
  const native = useNativeGlass() && !forceFallback;
  if (native) {
    return (
      <GlassView
        style={[style, { opacity: 1 }]}
        glassEffectStyle={
          animateTransition ? { style: glass, animate: true, animationDuration } : glass
        }
        tintColor={tintColor}
        isInteractive={interactive}
        colorScheme={isDark ? 'dark' : 'light'}
        pointerEvents={pointerEvents}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      intensity={fallbackIntensity}
      tint={fallbackTint ?? (isDark ? 'dark' : 'light')}
      style={style}
      pointerEvents={pointerEvents}
    >
      {children}
    </BlurView>
  );
}
