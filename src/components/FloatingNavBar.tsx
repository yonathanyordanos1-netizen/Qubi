import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { StrokeIcon } from './AppIcons';
import { CameraIcon } from './CameraIcon';
import { Pressable } from './Pressable';
import { fontFamilyFor } from '../theme/typography';
import { AppColors } from '../theme/colors';
import { NATIVE_GLASS, NativeGlass } from './LiquidGlass';

/**
 * Qubi v9 �?Cal AI–inspired split floating navigation with liquid
 * sliding indicator.
 *
 * Layout: [==== White Tab Pill (4 tabs) ====] [�?Orange Camera FAB]
 * A grey highlight pill slides continuously between tabs for a smooth
 * liquid-glass transition feel. Ported from floating_nav_bar.dart.
 */

const TABS: ReadonlyArray<readonly [string, string]> = [
  ['home', 'Home'],
  ['calendar', 'Tasks'],
  ['users', 'Friends'],
  ['trophy', 'Ranks'],
  ['user', 'Profile'],
];

interface TabRect {
  x: number;
  w: number;
}

export function FloatingNavBar({
  currentIndex,
  onSelect,
  onVerify,
}: {
  currentIndex: number;
  onSelect: (index: number) => void;
  onVerify: () => void;
}) {
  const [tabRects, setTabRects] = useState<(TabRect | null)[]>(TABS.map(() => null));
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const activeColor = isDark ? '#FFFFFF' : '#0B0B0B';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15, 23, 42, 0.5)';
  const indicatorBg = isDark ? 'rgba(255,255,255,0.16)' : '#EDEDF2';

  const indX = useSharedValue(0);
  const indW = useSharedValue(0);
  const measured = useRef(false);

  useEffect(() => {
    const rect = tabRects[currentIndex];
    if (rect == null) return;
    if (!measured.current) {
      // First measurement snaps into place instantly.
      measured.current = true;
      indX.value = rect.x;
      indW.value = rect.w;
      return;
    }
    indX.value = withTiming(rect.x, { duration: 400, easing: Easing.out(Easing.cubic) });
    indW.value = withTiming(rect.w, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [currentIndex, tabRects, indX, indW]);

  // Entrance: slide up + fade in.
  const enterY = useSharedValue(0.4 * 64);
  const enterO = useSharedValue(0);
  useEffect(() => {
    enterY.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) });
    enterO.value = withTiming(1, { duration: 350 });
  }, [enterY, enterO]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: 6 + indX.value,
    top: 6,
    width: indW.value,
    height: 52,
  }));
  const enterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: enterY.value }],
    opacity: enterO.value,
  }));

  const measureTab = (index: number) => (e: { nativeEvent: { layout: { x: number; width: number } } }) => {
    const { x, width } = e.nativeEvent.layout;
    setTabRects((prev) => {
      if (prev[index]?.x === x && prev[index]?.w === width) return prev;
      const next = [...prev];
      next[index] = { x, w: width };
      return next;
    });
  };

  return (
    /* Professional Apple-style bottom tab bar �?anchored to bottom with safe area */
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.navRoot,
        { bottom: insets.bottom },
        enterStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 64 + insets.bottom }}>
        {/* ── Main nav pill (tabs + sliding indicator) �?Apple Liquid Glass ── */}
        <View style={{ flex: 1, height: 64 }}>
          <View
            style={{
              height: 64,
              borderRadius: 0,
              overflow: 'hidden',
              // Authentic Apple Liquid Glass spec
              backgroundColor: NATIVE_GLASS ? (isDark ? 'rgba(15,23,42,0.3)' : 'rgba(255,255,255,0.35)') : 'rgba(255, 255, 255, 0.38)', // Ultra-sheer liquid base
              borderWidth: 0,
              borderTopWidth: 1.5,
              borderColor: NATIVE_GLASS ? (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)') : 'rgba(255, 255, 255, 0.65)', // Glass specular highlights
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.1,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            {/* Frosted glass backdrop �?Apple chrome material */}
            <BlurView
              intensity={90}
              tint="light"
              blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={{ flex: 1 }}>
              {/* Sliding liquid indicator */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    backgroundColor: indicatorBg,
                    borderRadius: 28,
                  },
                  indicatorStyle,
                ]}
              />
              {/* Tab row �?liquid press physics (spring scale 0.96) */}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 6, flexDirection: 'row' }}>
                {TABS.map(([icon, label], i) => (
                  <TabItem
                    key={icon}
                    icon={icon}
                    label={label}
                    active={i === currentIndex}
                    activeColor={activeColor}
                    inactiveColor={inactiveColor}
                    onLayout={measureTab(i)}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      onSelect(i);
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* ── Liquid glass camera FAB �?glass sphere with inner glow ── */}
        <View style={{ alignSelf: 'center', alignItems: 'center', justifyContent: 'center', height: 64, width: 84 }}>
          <Pressable
            scale={0.9}
            onTap={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onVerify();
            }}
          >
            {/* Liquid glass sphere �?frosted glass + inner glow */}
            <BlurView
              intensity={90}
              tint="light"
              blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.65)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <View style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(255,255,255,0.42)' }
              ]}>
                {/* Inner glow gradient �?Apple refraction depth */}
                <View style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: 'rgba(55,138,221,0.18)',
                    borderRadius: 30,
                  },
                ]} />
                <CameraIcon size={24} color="#FFFFFF" backgroundColor="transparent" />
              </View>
            </BlurView>
          </Pressable>
        </View>
      </View>
      {/* Safe area filler */}
      <View style={{ height: insets.bottom, backgroundColor: 'rgba(255, 255, 255, 0.38)' }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  navRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 24,
  },
});

/** Single tab with Apple-style liquid press physics (spring scale to 0.96). */
function TabItem({
  icon,
  label,
  active,
  activeColor,
  inactiveColor,
  onLayout,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onLayout: (e: { nativeEvent: { layout: { x: number; width: number } } }) => void;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const pressIn = () => {
    scale.value = withSpring(0.96, { damping: 14, stiffness: 220 });
  };
  const pressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
  };
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <RnPressable style={{ flex: 1 }} hitSlop={0} onLayout={onLayout} onPressIn={pressIn} onPressOut={pressOut} onPress={onPress}>
      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center', flex: 1 }, style]}>
        <StrokeIcon
          name={icon as never}
          size={20}
          color={active ? activeColor : inactiveColor}
          strokeWidth={active ? 2.2 : 1.9}
        />
        <View style={{ height: 2 }} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            fontSize: 10,
            lineHeight: 13,
            fontFamily: fontFamilyFor(active ? 'w700' : 'w600'),
            color: active ? activeColor : inactiveColor,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </RnPressable>
  );
}

export const NAV_TABS = TABS;
