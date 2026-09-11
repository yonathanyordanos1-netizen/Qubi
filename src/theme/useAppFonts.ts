import { useFonts } from '@expo-google-fonts/poppins';
import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';

/**
 * Loads the app's typefaces once at boot:
 *  - Fredoka → display / headings / titles / big numerals (rounded, Duolingo-feel)
 *  - Nunito  → body copy, labels, secondary numbers (warm, highly legible)
 *
 * The whole app routes text through `fontFamilyFor()` (see typography.ts), so
 * swapping the families here restyles every screen at once. Poppins/Space Grotesk
 * are no longer loaded — nothing references their families directly.
 * Returns true when every family is ready.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  return loaded;
}
