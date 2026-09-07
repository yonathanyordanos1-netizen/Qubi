import React from 'react';
import { SixStepWizard } from '../../src/screens/onboarding/SixStepWizard';

/**
 * Onboarding Route — 6-Step Gamified Duolingo Wizard (Spec)
 * Delegates to SixStepWizard which implements:
 * - 6-segment progress (h10/r6/gap6, active #F97316)
 * - Steps 1-6 as spec, mascot squircle 96x96 r24, speech bubbles
 * - Back arrow on steps 2-6, hasCompletedOnboarding flag, OTP transition
 */
export default function OnboardingRoute() {
  return <SixStepWizard />;
}
