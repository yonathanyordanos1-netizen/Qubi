import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * SceneBackdrop — the illustrated "mascot lives in a world" backdrop from the
 * Boons / Triton inspo, drawn in pure code so it needs no art assets.
 *
 * Warm Qubi sunrise sky (gold → peach) with soft clouds and a rounded green
 * hill at the base. When a generated PNG is available (Gemini Nano Banana),
 * pass it as `source` and it replaces the code scene in the exact same slot —
 * so upgrading to real art is a one-prop change, no layout churn.
 */
export function SceneBackdrop({
  source,
  radius = 36,
  sky = ['#FFE7BF', '#FFF3E2'],
  hill = '#8AD86B',
  hillDeep = '#63C244',
}: {
  source?: ImageSourcePropType;
  radius?: number;
  sky?: [string, string];
  hill?: string;
  hillDeep?: string;
}) {
  if (source != null) {
    return (
      <View style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius, overflow: 'hidden' }]}>
        <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: radius, borderBottomRightRadius: radius, overflow: 'hidden' }]}>
      <LinearGradient colors={sky} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* soft sun glow, upper-right */}
      <View style={styles.sun} />
      {/* clouds */}
      <View style={[styles.cloud, { top: 54, left: 26, width: 66, height: 22 }]} />
      <View style={[styles.cloud, { top: 40, left: 44, width: 40, height: 18 }]} />
      <View style={[styles.cloud, { top: 82, right: 30, width: 78, height: 24 }]} />
      <View style={[styles.cloud, { top: 70, right: 54, width: 44, height: 18 }]} />
      {/* rounded hills at the base — the mascot appears to stand on them */}
      <View style={[styles.hill, { backgroundColor: hillDeep, bottom: -34, left: -30, right: 40, height: 96 }]} />
      <View style={[styles.hill, { backgroundColor: hill, bottom: -46, left: 30, right: -40, height: 108 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sun: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  cloud: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  hill: {
    position: 'absolute',
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
  },
});

export default SceneBackdrop;
