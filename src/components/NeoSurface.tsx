import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { neoShadowA, neoShadowB, neoSurfaceDecoration } from './neoSurfaceStyles';

/**
 * A View with the shared neumorphic decoration: two stacked shadow layers
 * (bottom-right shade + top-left highlight) beneath a warm tinted fill.
 */
export function NeoSurface({
  children,
  radius = 16,
  style,
}: {
  children?: ReactNode;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useTheme();
  return (
    <View style={[{ position: 'relative' }, neoSurfaceDecoration(isDark, { radius }), style]}>
      <View pointerEvents="none" style={neoShadowA(isDark, radius)} />
      <View pointerEvents="none" style={neoShadowB(isDark, radius)} />
      <View style={{ borderRadius: radius, overflow: 'hidden', backgroundColor: 'transparent' }}>
        {children}
      </View>
    </View>
  );
}
