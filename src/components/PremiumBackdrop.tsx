import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppColors, withAlpha } from '../theme/colors';

/**
 * Ambient backdrop orbs — soft tinted glows that sit behind dashboard content
 * to give the canvas depth. Purely decorative; never intercepts touches.
 */

export function GlowOrb({
  size,
  opacity = 0.2,
  tint,
  style,
}: {
  size: number;
  opacity?: number;
  tint: string;
  style?: { left?: number; right?: number; top?: number; bottom?: number };
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', ...style }}>
      <LinearGradient
        colors={[withAlpha(tint, opacity), withAlpha(tint, 0)]}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    </View>
  );
}

/**
 * Full-screen ambient wash. Neutral grey/blue tints per design v3.
 */
export default function PremiumBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
      <GlowOrb size={260} opacity={0.16} tint={AppColors.rewardBlue} style={{ right: -120, top: -120 }} />
      <GlowOrb size={220} opacity={0.1} tint="#6B6B6B" style={{ left: -60, bottom: 90 }} />
    </View>
  );
}
