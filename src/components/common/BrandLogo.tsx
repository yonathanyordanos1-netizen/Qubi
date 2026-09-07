import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export function BrandLogo({ size = 40, showTile = true }: { size?: number; showTile?: boolean }) {
  // Crash-fix: use Qubi_2.jpg (Expo Go) — explicit width/height prevents layout crash
  const qubi = require('../../../Qubi/Qubi_2.jpg');
  if (!showTile) {
    return <Image source={qubi} style={{ width: size, height: size, borderRadius: size / 2, alignSelf: 'center', transform: [{ translateX: -1 }] }} resizeMode="contain" accessible accessibilityLabel="Qubi" />;
  }
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2, alignSelf: 'center' }]}>
      <Image source={qubi} style={{ width: size * 0.88, height: size * 0.88, borderRadius: (size * 0.88) / 2, alignSelf: 'center', transform: [{ translateX: -1 }] }} resizeMode="contain" accessible accessibilityLabel="Qubi" />
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
  },
});

export default BrandLogo;
