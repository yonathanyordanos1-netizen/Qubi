import { Image, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, withAlpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';

// Crash-fix: Qubi_2.jpg relink — explicit style width/height required on <Image>
const QUBI = require('../../Qubi/Qubi_2.jpg');

export function QubiMascot({ size = 120, celebrating = false, bob = false, pulseGlow = false }: { size?: number; celebrating?: boolean; bob?: boolean; pulseGlow?: boolean }) {
  const { isDark } = useTheme();
  const bobY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.18);

  useEffect(() => {
    if (!bob) return;
    bobY.value = withRepeat(withTiming(-6, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [bob, bobY]);

  useEffect(() => {
    if (!pulseGlow) return;
    glowOpacity.value = withRepeat(
      withTiming(0.38, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulseGlow, glowOpacity]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bobY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ shadowOpacity: glowOpacity.value }));

  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center', width: '100%', alignSelf: 'center' }, bob && bobStyle]}>
      {celebrating && (
        <LinearGradient colors={[withAlpha(AppColors.primary, isDark ? 0.24 : 0.3), withAlpha(AppColors.primary, 0)]} style={{ position: 'absolute', width: size * 1.35, height: size * 1.35, borderRadius: size * 0.68 }} />
      )}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: AppColors.primary,
            shadowRadius: size * 0.28,
            shadowOffset: { width: 0, height: size * 0.1 },
            elevation: 5,
            overflow: 'hidden',
          },
          pulseGlow ? pulseStyle : { shadowOpacity: 0.28 },
        ]}
      >
        <LinearGradient
          colors={[AppColors.primary, AppColors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            // SPEC §3 — no asymmetric padding: image fills the frame flush so the
            // mascot can never drift right/down inside the gradient
            overflow: 'hidden',
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={QUBI}
            style={{ width: size, height: size, borderRadius: size / 2, alignSelf: 'center', transform: [{ translateX: -2 }] }}
            resizeMode="cover"
            accessible
            accessibilityLabel="Qubi"
          />
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}
