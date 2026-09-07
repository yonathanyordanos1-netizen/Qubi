import { AppColors } from './colors';

export interface Palette {
  canvas: string;
  card: string;
  surfaceLowest: string;
  surfaceLow: string;
  surfaceContainer: string;
  surfaceHigh: string;
  surfaceHighest: string;
  border: string;
  glassEdge: string;
  glassBacking: string;
  ink: string;
  muted: string;
  mutedSoft: string;
  gaugeTrack: string;
  scrimTextOnGlass: string;
  primary: string;
  primaryDeep: string;
  primaryFixedDim: string;
  primarySoft: string;
  onPrimary: string;
  onPrimaryContainer: string;
  success: string;
  error: string;
  onError: string;
  secondaryContainer: string;
  tertiaryContainer: string;
  streakAmber: string;
  skyBlue: string;
}

export const lightPalette: Palette = {
  canvas: '#FFF9F3', // Qubi Glow — warm cream canvas (mascot backdrop)
  card: '#FFFFFF', // Cards #FFFFFF
  surfaceLowest: '#FFFFFF',
  surfaceLow: '#FFFFFF',
  surfaceContainer: '#FFFFFF',
  surfaceHigh: '#FDF1E7', // warm hover / selection
  surfaceHighest: '#F9E8D8', // warm muted cards
  border: '#F5E9DA', // warm hairline
  glassEdge: '#F5E9DA',
  glassBacking: '#FFFFFF',
  ink: '#1C1917', // warm cocoa ink (stone-900)
  muted: '#78716C', // warm stone body
  mutedSoft: '#A8A29E',
  gaugeTrack: '#F5E9DA',
  scrimTextOnGlass: '#1C1917',
  primary: '#F97316',
  primaryDeep: '#EA580C',
  primaryFixedDim: '#0EA5E9',
  primarySoft: '#FFF3E8',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#1C1917',
  success: '#10B981',
  error: '#EF4444',
  onError: '#FFFFFF',
  secondaryContainer: '#F0F9FF',
  tertiaryContainer: '#64748B',
  streakAmber: '#F59E0B',
  skyBlue: '#0EA5E9',
};

export const darkPalette: Palette = {
  canvas: '#0D0A08', // Warm OLED cocoa-black (mascot fur shadow)
  card: '#171310', // Warm cards
  surfaceLowest: '#171310',
  surfaceLow: '#171310',
  surfaceContainer: '#1E1814',
  surfaceHigh: '#251D17',
  surfaceHighest: '#2E241C',
  border: '#2E241C',
  glassEdge: 'rgba(255,255,255,0.08)', // soft glowing border
  glassBacking: '#171310',
  ink: '#FAF7F2', // warm porcelain
  muted: '#A8A29E', // warm stone
  mutedSoft: '#78716C',
  gaugeTrack: '#2E241C',
  scrimTextOnGlass: '#FAF7F2',
  primary: '#F97316',
  primaryDeep: '#EA580C',
  primaryFixedDim: '#0EA5E9',
  primarySoft: '#431407',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#FFEDD5',
  success: '#10B981',
  error: '#F87171',
  onError: '#0F172A',
  secondaryContainer: '#0C4A6E',
  tertiaryContainer: '#64748B',
  streakAmber: '#F59E0B',
  skyBlue: '#0EA5E9',
};
