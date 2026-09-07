import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/**
 * QubiHeaderLogo — crash-fix: loads strictly from ./Qubi/Qubi_2.jpg
 * All <Image> must declare explicit width/height to prevent Expo Go Hermes layout crash.
 */
const QUBI = require('../../Qubi/Qubi_2.jpg');

export function QubiHeaderLogo({ size = 36 }: { size?: number }) {
  const r = size * 0.24;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: r, alignSelf: 'center' }]}>
      <Image
        source={QUBI}
        style={{ width: size * 0.88, height: size * 0.88, borderRadius: size * 0.18, alignSelf: 'center', transform: [{ translateX: -1 }] }}
        resizeMode="contain"
        accessible
        accessibilityLabel="Qubi"
      />
    </View>
  );
}

export function QubiHeaderAvatar({ size = 42 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(249,115,22,0.18)', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Image
        source={QUBI}
        style={{ width: size, height: size, borderRadius: 14, alignSelf: 'center', transform: [{ translateX: -1 }] }}
        resizeMode="cover"
        accessible
        accessibilityLabel="Qubi avatar"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignSelf: 'center',
  },
});

export default QubiHeaderLogo;
