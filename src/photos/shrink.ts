import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';

// The longest side a saved photo keeps: sharp on a big photo card (WJ-24), and
// small enough that a screen of them draws quickly. Phone cameras shoot 3000+
// px; photos picked on a Frameo frame arrive at 512 px and are left that size.
export const MAX_PHOTO_SIZE = 1024;
const JPEG_QUALITY = 0.8;

// The photo as a JPEG in the cache, scaled down to at most MAX_PHOTO_SIZE px on
// its long side. Always saved again, even when it already fits: the family jar
// only takes JPEGs (WJ-49), and a picked photo may be a PNG or HEIC.
export async function shrinkPhoto(uri: string): Promise<ImageResult> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const scale = MAX_PHOTO_SIZE / Math.max(original.width, original.height);
  if (scale < 1) {
    // Both sides given: on the web, a null side comes out as no height at all.
    context.resize({
      width: Math.round(original.width * scale),
      height: Math.round(original.height * scale),
    });
  }
  const shrunk = await context.renderAsync();
  return shrunk.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
}
