import React, { useEffect, useState } from 'react';
import { Platform, Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeProvider';
import { useSettingsStore } from '../../state/settingsStore';
import { fontFamilyFor } from '../../theme/typography';
import { AppColors, withAlpha } from '../../theme/colors';
import { glassTier } from '../../theme/liquidGlass';
import { NativeGlass, NativeGlassContainer, useNativeGlass } from '../LiquidGlass';

type TabDef = {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
  label: string;
};

/**
 * Genuine Apple Liquid Glass floating tab bar (Mobbin floating-capsule trend,
 * iOS 26 HIG).
 *
 * iOS 26+ path: a `GlassContainer` merges two real lenses — a `regular`
 * interactive capsule (the bar) and a `clear` interactive circle (the camera
 * FAB, brand-tinted orange) overlapping its top edge. The lenses merge into
 * one continuous glass system exactly like native iOS 26 chrome. Tab icons,
 * labels and the active pill live in the glass `contentView`, above the
 * refraction layer.
 *
 * Fallback path (Android / older iOS / Reduce Transparency): the same layout
 * rendered with Tier-2 frosted `BlurView` chrome from the theme tokens.
 *
 * NOTE: a notched cutout is intentionally NOT used — `UIGlassEffect` renders
 * across its bounds and cannot be cut by an SVG mask. Capsule + merged
 * overlapping FAB is the genuine Apple pattern.
 */
const TABS: TabDef[] = [
  { name: 'home', icon: 'home', iconOutline: 'home-outline', label: 'Home' },
  { name: 'tasks', icon: 'checkbox', iconOutline: 'checkbox-outline', label: 'Tasks' },
  { name: 'camera', icon: 'camera', iconOutline: 'camera-outline', label: '' },
  { name: 'ranks', icon: 'trophy', iconOutline: 'trophy-outline', label: 'Ranks' },
  { name: 'profile', icon: 'person', iconOutline: 'person-outline', label: 'Profile' },
];

const CENTER_INDEX = 2;
interface TabRect { x:number; w:number; }
export interface CustomTabBarProps { currentIndex:number; onSelect:(i:number)=>void; onCameraPress:()=>void; }

const BAR_HEIGHT = 68;
const FAB_SIZE = 60;
/** FAB overhang above the bar top — merged into one lens via container spacing. */
const FAB_OVERHANG = 26;

const haptic = (style: Haptics.ImpactFeedbackStyle) => {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.impactAsync(style).catch(()=>{});
};

export function CustomTabBar({ currentIndex, onSelect, onCameraPress }: CustomTabBarProps) {
  const { isDark } = useTheme();
  const native = useNativeGlass();
  const insets = useSafeAreaInsets();
  const activeColor = isDark ? '#FFFFFF' : '#0F172A';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.48)';
  const tier2 = glassTier('tier2', isDark);
  const blurTint: React.ComponentProps<typeof BlurView>['tint'] =
    Platform.OS === 'ios' ? (isDark ? 'systemThickMaterialDark' : 'systemThinMaterialLight') : (isDark ? 'dark' : 'light');

  const [tabRects, setTabRects] = useState<TabRect[]>(TABS.map(()=>({x:0,w:0})));
  const indX = useSharedValue(0);
  const indW = useSharedValue(0);
  const measured = React.useRef(false);
  const centerScale = useSharedValue(1);
  const centerActive = currentIndex===CENTER_INDEX;

  useEffect(()=>{
    const rect = tabRects[currentIndex];
    if(currentIndex===CENTER_INDEX) return;
    if(!rect || rect.w<=0) return;
    if(!measured.current){ measured.current=true; indX.value=rect.x; indW.value=rect.w; return; }
    indX.value = withSpring(rect.x, { damping:18, stiffness:220, mass:0.7 });
    indW.value = withSpring(rect.w, { damping:18, stiffness:220, mass:0.7 });
  }, [currentIndex, tabRects, indX, indW]);

  useEffect(()=>{ centerScale.value = withSpring(centerActive?1.06:1, { damping:12, stiffness:180, mass:0.6 }); }, [centerActive, centerScale]);

  const indicatorStyle = useAnimatedStyle(()=>({ transform:[{ translateX: indX.value }], width: indW.value }));
  const centerStyle = useAnimatedStyle(()=>({ transform:[{ scale: centerScale.value }] }));
  const measureTab = (index:number, x:number, width:number)=>{
    const safeX = Number.isFinite(x)?x:0;
    const safeW = Number.isFinite(width)&&width>0?width:0;
    setTabRects(prev=>{ if(prev[index].x===safeX && prev[index].w===safeW) return prev; const next=[...prev]; next[index]={x:safeX,w:safeW}; return next; });
  };
  const handleTabPress = (index:number)=>{ haptic(Haptics.ImpactFeedbackStyle.Light); onSelect(index); };
  const handleCameraPress = ()=>{ haptic(Haptics.ImpactFeedbackStyle.Medium); centerScale.value = withSpring(0.9, { damping:10, stiffness:220, mass:0.5 }); onCameraPress(); };

  const capsuleBottom = Math.max(14, insets.bottom + 8);
  const fabTint = withAlpha(AppColors.primary, 0.5);

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom:capsuleBottom, left:16, right:16 }]}>
      <NativeGlassContainer
        spacing={FAB_OVERHANG + 4}
        style={styles.glassSystem}
        pointerEvents="box-none"
      >
        {/* ── Camera FAB: clear interactive lens, brand-orange tint, merged ── */}
        <View pointerEvents="box-none" style={styles.fabFloat}>
          <Animated.View style={[styles.fabFloatInner, centerStyle]}>
            <RnPressable
              hitSlop={12}
              onPressIn={()=>{ centerScale.value = withSpring(0.88, {damping:14,stiffness:260}); }}
              onPressOut={()=>{ centerScale.value = withSpring(centerActive?1.06:1,{damping:12,stiffness:180}); }}
              onPress={handleCameraPress}
              style={styles.fabPressable}
              accessibilityRole="button"
              accessibilityLabel="Verify with camera"
            >
              <NativeGlass
                glass="clear"
                interactive
                tintColor={native ? fabTint : undefined}
                fallbackIntensity={tier2.blurIntensity}
                fallbackTint={blurTint}
                style={[
                  styles.fabGlass,
                  !native && {
                    backgroundColor: undefined,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.45)',
                    shadowColor: '#F97316',
                    shadowOffset: { width:0, height:6 },
                    shadowOpacity: 0.30,
                    shadowRadius: 10,
                    elevation: 10,
                  },
                ]}
              >
                {!native ? (
                  <LinearGradient
                    colors={['#F97316','#EA580C']}
                    start={{x:0,y:0}}
                    end={{x:1,y:1}}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Ionicons name="camera" size={26} color="#FFFFFF" />
              </NativeGlass>
            </RnPressable>
          </Animated.View>
        </View>

        {/* ── Bar capsule: regular interactive lens ── */}
        <NativeGlass
          glass="regular"
          interactive
          fallbackIntensity={tier2.blurIntensity}
          fallbackTint={blurTint}
          style={[
            styles.barGlass,
            !native && {
              backgroundColor: tier2.fill,
              borderWidth: tier2.borderWidth,
              borderColor: tier2.borderColor,
              shadowColor: '#0F172A',
              shadowOffset: tier2.shadowOffset,
              shadowOpacity: tier2.shadowOpacity,
              shadowRadius: tier2.shadowRadius,
              elevation: tier2.elevation,
            },
          ]}
        >
          <View style={styles.tabBarInner}>
            {currentIndex!==CENTER_INDEX ? (
              <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor:'rgba(249,115,22,0.20)', borderRadius:24, borderWidth:1, borderColor:'rgba(249,115,22,0.25)' }]} />
              </Animated.View>
            ) : null}
            <View style={styles.tabRow}>
              {[0,1].map((index)=>(
                <TabButton key={TABS[index].name} item={TABS[index]} isActive={currentIndex===index} activeColor={activeColor} inactiveColor={inactiveColor} onLayout={(x,w)=>measureTab(index,x,w)} onPress={()=>handleTabPress(index)} />
              ))}
              <View style={styles.centerSpacer} />
              {[3,4].map((index)=>(
                <TabButton key={TABS[index].name} item={TABS[index]} isActive={currentIndex===index} activeColor={activeColor} inactiveColor={inactiveColor} onLayout={(x,w)=>measureTab(index,x,w)} onPress={()=>handleTabPress(index)} />
              ))}
            </View>
          </View>
        </NativeGlass>
      </NativeGlassContainer>
    </View>
  );
}

function TabButton({ item, isActive, activeColor, inactiveColor, onLayout, onPress }: { item:TabDef; isActive:boolean; activeColor:string; inactiveColor:string; onLayout:(x:number,w:number)=>void; onPress:()=>void; }){
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(()=>({ transform:[{ scale: scale.value }] }));
  const iconName = isActive ? item.icon : item.iconOutline;

  useEffect(() => {
    if (isActive) {
      scale.value = withSpring(1.15, { damping: 10, stiffness: 200 }, () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    }
  }, [isActive, scale]);

  return (
    <RnPressable style={styles.tabButton} onLayout={(e)=> onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)} onPressIn={()=>{ scale.value = withSpring(0.92,{damping:16,stiffness:260,mass:0.5}); }} onPressOut={()=>{ scale.value = withSpring(1,{damping:14,stiffness:200,mass:0.5}); }} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: isActive }} accessibilityLabel={item.label}>
      <Animated.View style={[styles.iconWrap, style]}>
        <Ionicons name={iconName} size={23} color={isActive?activeColor:inactiveColor} />
        {isActive ? (
          <Text numberOfLines={1} style={{ marginTop:2, fontSize:9, fontFamily:fontFamilyFor('w600'), color:activeColor, letterSpacing:0.3 }}><Text>{item.label}</Text></Text>
        ) : null}
      </Animated.View>
    </RnPressable>
  );
}

const styles = StyleSheet.create({
  container:{ position:'absolute', zIndex:100, elevation:24 },
  /** Merging glass system: top padding reserves the FAB overhang. */
  glassSystem:{ paddingTop: FAB_OVERHANG, alignItems:'center' },
  fabFloat:{ position:'absolute', top:0, left:0, right:0, alignItems:'center', zIndex:2 },
  fabFloatInner:{ width:FAB_SIZE + 8, alignItems:'center' },
  fabPressable:{ alignItems:'center', justifyContent:'center' },
  fabGlass:{ width:FAB_SIZE, height:FAB_SIZE, borderRadius:FAB_SIZE/2, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  barGlass:{ width:'100%', height:BAR_HEIGHT, borderRadius:BAR_HEIGHT/2, overflow:'hidden' },
  tabBarInner:{ flex:1, height:BAR_HEIGHT, paddingHorizontal:10, justifyContent:'center' },
  tabRow:{ flex:1, flexDirection:'row', alignItems:'center', height:'100%' },
  centerSpacer:{ flex:1 },
  tabButton:{ flex:1, alignItems:'center', justifyContent:'center', height:'100%', minWidth:48 },
  iconWrap:{ alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:22 },
  indicator:{ position:'absolute', left:6, top:10, height:48, borderRadius:24, overflow:'hidden' },
});
