import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera } from 'lucide-react-native';

/**
 * Pure vector camera badge (lucide-react-native) — no image assets, no text
 * wrappers, so it can never trigger missing-asset or "string inside <View>"
 * rendering crashes.
 */
export function CameraIcon({
  size = 20,
  color = '#FFFFFF',
  backgroundColor = '#0B0B0B',
}: {
  size?: number;
  color?: string;
  backgroundColor?: string;
}) {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          width: Math.round(size * 1.8),
          height: Math.round(size * 1.8),
          borderRadius: Math.round(size * 0.9),
        },
      ]}
    >
      <Camera color={color} size={size} strokeWidth={2.2} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
