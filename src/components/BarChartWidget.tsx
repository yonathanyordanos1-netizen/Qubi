import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { AppColors, withAlpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilyFor } from '../theme/typography';

/**
 * A unified weekly bar chart widget.
 *
 * Features: 180dp fixed height, pill-cap bars (top rounded corners only),
 * warm orange gradient fill (#0B0B0B → #0B0B0B) for active bars, subtle
 * background tracks for empty bars, day labels below each bar, floating
 * value badges on tap (haptic feedback), smooth animated height transitions.
 * Ported from bar_chart_widget.dart.
 */

const BAR_COLORS: [string, string] = [AppColors.primary, AppColors.primaryDeep];
const TRACK_BG = AppColors.cardBorder; // #F1F5F9 ultra-light track

export function BarChartWidget({
  values,
  labels,
  activeIndex = -1,
  barColors,
  trackColor,
  height = 180,
  onBarTap,
}: {
  values: number[];
  labels: string[];
  activeIndex?: number;
  barColors?: [string, string];
  trackColor?: string;
  height?: number;
  onBarTap?: (index: number) => void;
}) {
  const { isDark } = useTheme();
  const [tappedIndex, setTappedIndex] = useState(-1);
  const maxVal = values.reduce((m, v) => (v > m ? v : m), 1);
  const trackBg = trackColor ?? TRACK_BG;

  const toggle = (i: number) => {
    if (!(values[i] > 0)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTappedIndex((prev) => (prev === i ? -1 : i));
    onBarTap?.(i);
  };

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end' }}>
      {values.map((value, i) => {
        // Bar height: stub for empty, proportional otherwise (68 reserved for badge+label).
        const barHeight =
          value === 0 ? 20 : 12 + (value / maxVal) * (height - 68);
        return (
          <Pressable key={i} style={{ flex: 1 }} onPress={() => toggle(i)}>
            <View style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* Floating value badge */}
              <View
                style={{
                  overflow: 'hidden',
                  marginBottom: tappedIndex === i && value > 0 ? 6 : 0,
                  paddingHorizontal: tappedIndex === i && value > 0 ? 10 : 0,
                  paddingVertical: tappedIndex === i && value > 0 ? 4 : 0,
                  backgroundColor:
                    tappedIndex === i && value > 0 ? AppColors.primary : 'transparent',
                  borderRadius: 8,
                  shadowColor:
                    tappedIndex === i && value > 0 ? withAlpha(AppColors.primary, 0.3) : 'transparent',
                  shadowOpacity: 1,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                {tappedIndex === i && value > 0 && (
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: fontFamilyFor('w800'),
                      color: '#FFFFFF',
                    }}
                  >
                    {`${value} XP`}
                  </Text>
                )}
              </View>
              {/* Bar value label above bar */}
              {value > 0 && tappedIndex !== i && (
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: fontFamilyFor('w700'),
                    color:
                      i === activeIndex ? AppColors.primary : isDark ? AppColors.mutedLightDark : AppColors.muted,
                    paddingBottom: 4,
                  }}
                >
                  {`${value}`}
                </Text>
              )}
              {/* Thin elegant line — 4px capsule rather than blocky bar */}
              <View style={{ width: '100%', paddingHorizontal: 10, alignItems: 'center' }}>
                {value > 0 ? (
                  <LinearGradient
                    colors={barColors ?? BAR_COLORS}
                    start={{ x: 0.5, y: 1 }}
                    end={{ x: 0.5, y: 0 }}
                    style={{
                      width: 8,
                      height: barHeight,
                      borderRadius: 999,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 8,
                      height: barHeight,
                      borderRadius: 999,
                      backgroundColor: trackBg,
                    }}
                  />
                )}
              </View>
              <View style={{ height: 6 }} />
              {/* Day label */}
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: fontFamilyFor(i === activeIndex ? 'w800' : 'w600'),
                  color:
                    i === activeIndex ? AppColors.primary : isDark ? AppColors.mutedLightDark : AppColors.muted,
                }}
              >
                {labels[i]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
