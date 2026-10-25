import { Image, Platform } from 'react-native';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { assessCapture, type CaptureCheck } from '../smartCapture';

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
    const probe = await manipulateAsync(uri, [{ resize: dimensions.width >= dimensions.height ? { width: 256 } : { height: 256 } }], { compress: 0.3, format: SaveFormat.JPEG });
    if (!probe.uri || probe.uri === uri) throw new Error('invalid-probe');
    temporary = new File(probe.uri);
    if (!temporary.exists || temporary.size < 1 || !probe.width || !probe.height) throw new Error('invalid-probe');
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
    let width: number;
    let height: number;
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } else {
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new globalThis.Image();
        image.src = objectUrl;
        await image.decode();
        width = image.naturalWidth;
        height = image.naturalHeight;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    return assessCapture(width, height, blob.size, mime || blob.type);
  } catch {
    return { usable: false, warnings: [], message: 'This image could not be decoded. Choose another photo or retake it.' };
  }
}
