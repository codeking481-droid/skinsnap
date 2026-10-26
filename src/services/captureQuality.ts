import { Image, Platform } from 'react-native';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { assessCapture, isOverexposed, type CaptureCheck } from '../smartCapture';

// Local decoder probe only. Never uploads or retains its small temporary copy.
export async function inspectCapture(uri: string, mime?: string): Promise<CaptureCheck> {
  if (Platform.OS === 'web') return inspectWebCapture(uri, mime);
  let temporary: File | null = null;
  try {
    const source = new File(uri);
    if (!source.exists || source.size < 1) return assessCapture(0, 0, 0);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) =>
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
    const check = assessCapture(dimensions.width, dimensions.height, source.size, mime);
    if (!check.usable) return check;
    const probe = await manipulateAsync(uri, [{ resize: dimensions.width >= dimensions.height ? { width: 64 } : { height: 64 } }], { compress: 0.7, format: SaveFormat.JPEG });
    if (!probe.uri || probe.uri === uri) throw new Error('invalid-probe');
    temporary = new File(probe.uri);
    if (!temporary.exists || temporary.size < 1 || !probe.width || !probe.height) throw new Error('invalid-probe');
    const sampledImage = jpeg.decode(await temporary.bytes(), { useTArray: true, formatAsRGBA: true });
    if (isOverexposed(sampledImage.data, sampledImage.width, sampledImage.height)) {
      return { usable: false, warnings: [], message: 'Find softer light and avoid direct sun or a bright light aimed at your face, then retake the photo.' };
    }
    return check;
  } catch { return { usable: false, warnings: [], message: 'This image could not be decoded. Choose another photo or retake it.' }; }
  finally { if (temporary?.exists) temporary.delete(); }
}

async function inspectWebCapture(uri: string, mime?: string): Promise<CaptureCheck> {
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('photo-unavailable');
    const blob = await response.blob();
    if (blob.size < 1 || blob.size > 32 * 1024 * 1024) {
      return assessCapture(1, 1, blob.size, mime || blob.type);
    }
    let image: CanvasImageSource;
    let width: number;
    let height: number;
    let bitmap: ImageBitmap | null = null;
    let objectUrl: string | null = null;
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
      image = bitmap;
    } else {
      objectUrl = URL.createObjectURL(blob);
      const decodedImage = new globalThis.Image();
      decodedImage.src = objectUrl;
      await decodedImage.decode();
      width = decodedImage.naturalWidth;
      height = decodedImage.naturalHeight;
      image = decodedImage;
    }
    try {
      const check = assessCapture(width, height, blob.size, mime || blob.type);
      if (!check.usable) return check;
      const sampleWidth = Math.min(64, width);
      const sampleHeight = Math.min(64, height);
      const canvas = document.createElement('canvas');
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas-unavailable');
      context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      if (isOverexposed(pixels, sampleWidth, sampleHeight)) {
        return { usable: false, warnings: [], message: 'Find softer light and avoid direct sun or a bright light aimed at your face, then retake the photo.' };
      }
      return check;
    } finally {
      bitmap?.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return { usable: false, warnings: [], message: 'This image could not be decoded. Choose another photo or retake it.' };
  }
}
