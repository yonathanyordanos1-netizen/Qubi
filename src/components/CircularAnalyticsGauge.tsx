import { useEffect, useId } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilyFor } from '../theme/typography';
import { NeoSurface } from './NeoSurface';

/**
 * Qubi v5 readiness dial — Oura-style gradient arc sweep.
 *
 * Renders ONLY the arc sweep; the score text is rendered once in the center
 * (passed via `scoreText`) to eliminate double-number ghosting artifacts.
 * Gradient sweep: #0B0B0B (warm orange) → #378ADD (sage green).
 * Ported from circular_analytics_gauge.dart.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CircularAnalyticsGauge({
  value = 40,
  size = 128,
  strokeWidth = 12,
  fillColor = AppColors.primary,
  gradientColors,
  scoreText,
  scoreColor,
  sublabel,
}: {
  value?: number;
  size?: number;
  strokeWidth?: number;
  fillColor?: string;
  /** Optional stroke gradient (e.g. [orange, primary, accent]). Replaces flat `fillColor`. */
  gradientColors?: string[];
  /** Score text rendered ONCE in the center (prevents double-number ghosting). */
  scoreText?: string;
  scoreColor?: string;
  sublabel?: string;
}) {
  const { isDark } = useTheme();
  const textPrimary = scoreColor ?? (isDark ? AppColors.inkLight : AppColors.ink);
  const textMuted = isDark ? AppColors.mutedLightDark : AppColors.muted;

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const trackGrad = `${uid}track`;
  const fillGrad = `${uid}fill`;

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // TweenAnimationBuilder equivalent: animate progress over 1600ms easeOutCubic.
  const target = Math.min(100, Math.max(0, value));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(target / 100, { duration: 1600, easing: Easing.out(Easing.cubic) });
  }, [target, progress]);

  const arcProps = useAnimatedProps(() => ({
    // Dash trick: full-length dash, offset reveals only `progress` of it.
    strokeDashoffset: circumference * (1 - progress.value),
    opacity: progress.value < 0.005 ? 0 : 1,
  }));

  const trackColors: string[] = isDark ? ['#232932', '#161B22'] : ['#EAE4DD', '#D8D1C9'];
  const fillStops =
    gradientColors != null && gradientColors.length > 1
      ? gradientColors.map((c, i) => ({ c, o: i / (gradientColors.length - 1) }))
      : null;

  return (
    <View style={{ width: size, height: size, borderRadius: center, backgroundColor: AppColors.cardWhite, borderWidth: 1, borderColor: AppColors.cardBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        {/* Arc sweep only — no text rendered here. */}
        <View style={{ position: 'absolute', width: size, height: size }}>
          <Svg width={size} height={size}>
            <Defs>
              {/* Groove: subtly shaded track so it reads recessed rather than flat. */}
              <SvgGradient id={trackGrad} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={trackColors[0]} />
                <Stop offset="1" stopColor={trackColors[1]} />
              </SvgGradient>
              {fillStops != null && (
                <SvgGradient id={fillGrad} x1="0" y1="0" x2="1" y2="1">
                  {fillStops.map((s, i) => (
                    <Stop key={i} offset={s.o} stopColor={s.c} />
                  ))}
                </SvgGradient>
              )}
            </Defs>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={`url(#${trackGrad})`}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
            <AnimatedCircle
              cx={center}
              cy={center}
              r={radius}
              stroke={
                fillStops != null
                  ? `url(#${fillGrad})`
                  : fillColor
              }
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
              animatedProps={arcProps}
            />
          </Svg>
        </View>
        {/* Single score text — absolutely centered so it never clips top/bottom. */}
        {scoreText != null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                fontSize: 34,
                lineHeight: 40,
                fontWeight: '900',
                textAlign: 'center',
                fontFamily: fontFamilyFor('w800'),
                letterSpacing: -1,
                color: textPrimary,
              }}
            >
              {scoreText}
            </Text>
            {sublabel != null && (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  fontWeight: '600',
                  marginTop: 2,
                  opacity: 0.7,
                  textAlign: 'center',
                  fontFamily: fontFamilyFor('w600'),
                  color: textMuted,
                }}
              >
                {sublabel}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
