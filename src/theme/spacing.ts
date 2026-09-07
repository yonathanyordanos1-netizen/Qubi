/** Radius + shadow + spacing tokens — v5 Ultra-Clean Minimalist */
export const AppSpacing = {
  // Radii spec: sm 12 · md 16 · lg 24 · xl 32 · pill 999
  radiusSm: 12,
  radiusMd: 16,
  radiusLg: 24,
  radiusXl: 32,
  // Legacy aliases (mapped to spec)
  radiusCard: 24,
  radiusSoft: 16,
  radiusPill: 999,
  radiusSheet: 32,
  radiusInput: 16,
  // Canvas padding tokens
  canvasPadding: 16,
  cardPadding: 16,
  sectionGap: 12,

  // Gamification radii
  radiusHero: 36,
  radiusButton: 20,
};

/** Soft ambient iOS card shadow — ultra-clean 1px border + whisper shadow */
export const Shadow = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 12,
  elevation: 2,
} as const;

/** Slightly stronger for elevated cards / hero */
export const ShadowStrong = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 20,
  elevation: 4,
} as const;

export const GlassShadow = Shadow;
export const CardShadow = Shadow;

/** Border helper — thin 1px subtle (#F1F5F9 light / #E2E8F0 strong) */
export const CardBorder = {
  borderWidth: 1,
  borderColor: '#F1F5F9',
} as const;
