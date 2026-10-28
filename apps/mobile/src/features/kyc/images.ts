import { fitWithin, kycMimeType } from "@handyfix/shared";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** A photo chosen on this phone and shrunk, not uploaded yet. */
export type LocalDoc = { uri: string; mimeType: string };

const PERMISSION_DENIED = "PermissionDenied";

/** Matched by name, not `instanceof`: subclassing Error is unreliable once the code is compiled for older Android engines. */
export const isPermissionDenied = (e: unknown): boolean => e instanceof Error && e.name === PERMISSION_DENIED;

function permissionDenied(message: string): Error {
  const e = new Error(message);
  e.name = PERMISSION_DENIED;
  return e;
}

const MAX_SIDE = 1600; // an ID is readable at this size, and the file stays well under the 5 MB limit
const JPEG_QUALITY = 0.8;

/**
 * Opens the camera (front camera for a selfie) or the gallery and returns a shrunk JPEG.
 * Returns null when the pro cancels. Throws a readable Error for a denied permission or a bad file.
 */
export async function pickKycImage(source: "camera" | "gallery", options: { frontCamera?: boolean } = {}): Promise<LocalDoc | null> {
  const base: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, allowsEditing: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw permissionDenied("Camera permission is off. Turn it on in Settings, or choose a photo from your gallery.");
    }
    result = await ImagePicker.launchCameraAsync({
      ...base,
      cameraType: options.frontCamera ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
  } else {
    result = await ImagePicker.launchImageLibraryAsync(base);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const original = kycMimeType(asset.mimeType, asset.fileName ?? asset.uri);
  const target = fitWithin(asset.width, asset.height, MAX_SIDE);
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (target) context.resize({ width: target.width, height: target.height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: "image/jpeg" };
  } catch {
    // Shrinking failed (rare). The original is fine when it is a supported type; the upload still enforces 5 MB.
    if (!original || original === "application/pdf") throw new Error("Use a JPG, PNG or WebP photo.");
    return { uri: asset.uri, mimeType: original };
  }
}
