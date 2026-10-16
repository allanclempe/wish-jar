import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';

// The longest side a saved photo keeps: sharp on a big photo card (WJ-24), and
// small enough that a screen of them draws quickly. Phone cameras shoot 3000+
// px; photos picked on a Frameo frame arrive at 512 px and are left alone.
export const MAX_PHOTO_SIZE = 1024;
const JPEG_QUALITY = 0.8;

// The photo scaled down to at most MAX_PHOTO_SIZE px on its long side, saved as
// a JPEG in the cache (with its Base64 when `base64`), or null when it already
// fits and should be kept as it is.
export async function shrinkPhoto(uri: string, base64 = false): Promise<ImageResult | null> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  if (Math.max(original.width, original.height) <= MAX_PHOTO_SIZE) return null;

  context.resize(
    original.width >= original.height
      ? { width: MAX_PHOTO_SIZE, height: null }
      : { width: null, height: MAX_PHOTO_SIZE },
  );
  const resized = await context.renderAsync();
  return resized.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64 });
}
