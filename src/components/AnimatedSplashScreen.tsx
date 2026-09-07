/**
 * @deprecated — SPEC §1 UNIFICATION: the Qubi launch splash now lives in
 * `app/splash.tsx` as the single source of truth. This file is a thin
 * re-export shim so legacy imports keep working without duplication.
 */
export { Splash, Splash as AnimatedSplashScreen } from '../../app/splash';
export type { SplashProps as AnimatedSplashScreenProps } from '../../app/splash';

