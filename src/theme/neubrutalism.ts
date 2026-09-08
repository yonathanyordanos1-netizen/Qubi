/**
 * Neubrutalism + Liquid Glass shared tokens (Expo SDK 57).
 *
 * Single source of truth for the hybrid visual style used across Qubi:
 * heavy dark borders + hard offset shadows (neubrutalism) paired with
 * semi-transparent `expo-blur` panels (liquid glass).
 *
 * Do not hardcode these values in screens — import from here.
 */
import type { ViewStyle } from 'react-native';

export const Neo = {
  borderWidth: 2.5,
  borderColor: '#000000',
  /** Thin variant for inner frames (e.g. onboarding hero card). */
  borderWidthThin: 2,
  radiusSm: 16,
  radiusMd: 20,
  radiusLg: 24,
  shadow: {
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 0,
  } as ViewStyle,
  shadowSm: {
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2.5, height: 2.5 },
    elevation: 0,
  } as ViewStyle,
} as const;

/** Duolingo-inspired primary accents. */
export const Duo = {
  green: '#58CC02',
  greenDeep: '#58A700',
  yellow: '#FFC800',
  red: '#FF4B4B',
  blue: '#1CB0F6',
  blueDeep: '#0B9BD8',
} as const;

/** Hard offset card: white fill, dark border, brutal shadow. */
export function neoCard(radius: number = Neo.radiusLg): ViewStyle {
  return {
    backgroundColor: '#FFFFFF',
    borderWidth: Neo.borderWidth,
    borderColor: Neo.borderColor,
    borderRadius: radius,
    ...Neo.shadow,
  };
}

/** Center-align helper for headers / modals / action sheets. */
export const neoCenter: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};
