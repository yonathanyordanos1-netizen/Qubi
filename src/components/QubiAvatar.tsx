import { Image, View } from 'react-native';
import { AppColors, withAlpha } from '../theme/colors';

// Crash-fix: Qubi_2.jpg relink — explicit style width/height required on <Image>
const QUBI = require('../../Qubi/Qubi_2.jpg');

export interface QubiAvatarProps {
  /** Diameter in pt. */
  size?: number;
  /** Warm orange glow shadow (hero spots). Off by default for dense rows. */
  glow?: boolean;
  /** Ring color. Defaults to white with an orange hairline for app-style match. */
  ringColor?: string;
  accessibilityLabel?: string;
}

/**
 * Qubi Glow avatar — the mascot rendered CIRCULAR with a porcelain ring and
 * warm orange aura, matching the v8 theme. Use for headers, auth, onboarding
 * and any place the mascot represents the app/user.
 *
 * (Animated/celebrating spots keep using `QubiMascot`, which is circular too.)
 */
export function QubiAvatar({ size = 40, glow = false, ringColor, accessibilityLabel = 'Qubi' }: QubiAvatarProps) {
  const r = size / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: Math.max(1.5, size * 0.045),
        borderColor: ringColor ?? 'rgba(249,115,22,0.22)',
        overflow: 'hidden',
        ...(glow
          ? {
              shadowColor: AppColors.primary,
              shadowOffset: { width: 0, height: size * 0.1 },
              shadowOpacity: 0.35,
              shadowRadius: size * 0.3,
              elevation: 6,
            }
          : {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 6,
              elevation: 2,
            }),
      }}
    >
      <Image
        source={QUBI}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
        accessible
        accessibilityLabel={accessibilityLabel}
      />
      {/* Warm aura wash so the ring melts into cream/dark canvases */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: r,
          borderWidth: 1,
          borderColor: withAlpha('#FFFFFF', 0.65),
        }}
      />
    </View>
  );
}

export default QubiAvatar;
