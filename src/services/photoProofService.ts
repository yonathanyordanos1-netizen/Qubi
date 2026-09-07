import * as ImagePicker from 'expo-image-picker';

/**
 * Expo Go-compatible photo proof capture built on expo-image-picker
 * (no native prebuild required).
 *
 * Flow: request camera permission → launch camera → if the camera is denied
 * or unavailable, fall back to the photo library so verification never dead-
 * ends. Returns a compressed { uri, base64 } capture ready for the AI
 * verifier and Supabase upload, or null when the user cancels.
 */

export interface ProofCapture {
  uri: string;
  base64: string;
}

const CAMERA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 0.7,
  base64: true,
};

async function toCapture(result: ImagePicker.ImagePickerResult): Promise<ProofCapture | null> {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const base64 = asset.base64 ?? '';
  if (asset.uri == null) return null;
  return { uri: asset.uri, base64 };
}

export async function requestProofPermissions(): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  return perm.granted;
}

/** Launches the camera for quest proof; falls back to the library when the camera is blocked. */
export async function takeQuestProofPhoto(): Promise<ProofCapture | null> {
  try {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      // Camera declined — offer the gallery so the flow still completes.
      return await pickQuestProofPhoto();
    }
    const result = await ImagePicker.launchCameraAsync(CAMERA_OPTIONS);
    return await toCapture(result);
  } catch {
    // No camera on this device / emulator — same fallback.
    return await pickQuestProofPhoto();
  }
}

/** Gallery picker (also used as the explicit "choose existing" path). */
export async function pickQuestProofPhoto(): Promise<ProofCapture | null> {
  try {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync(CAMERA_OPTIONS);
    return await toCapture(result);
  } catch {
    return null;
  }
}
