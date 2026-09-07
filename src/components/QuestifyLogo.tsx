import { Image, View } from 'react-native';

import { AppColors } from '../theme/colors';

/**
 * Renders the official Qubi app logo — crash-fix: loads strictly from ./Qubi/Qubi_2.jpg.
 * The logo art fills its whole canvas, so it is drawn edge-to-edge inside a
 * rounded-square frame — no letterboxing. Use `circle` where an avatar-style
 * treatment fits the surrounding layout. Ported from Qubi_logo.dart.
 */

export enum QubiLogoShape {
  circle = 'circle',
  rounded = 'rounded',
}

const LOGO = require('../../Qubi/Qubi_2.jpg');

export function QubiLogo({
  size = 96,
  shape = QubiLogoShape.rounded,
  glow = false,
  semanticLabel = 'Qubi',
}: {
  size?: number;
  shape?: QubiLogoShape;
  glow?: boolean;
  semanticLabel?: string;
}) {
  const radius = shape === QubiLogoShape.circle ? size / 2 : size * 0.235;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={semanticLabel}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        ...(glow
          ? {
              shadowColor: AppColors.primary,
              shadowOpacity: 0.4,
              shadowRadius: size * 0.32,
              shadowOffset: { width: 0, height: size * 0.07 },
            }
          : null),
      }}
    >
      <Image source={LOGO} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
