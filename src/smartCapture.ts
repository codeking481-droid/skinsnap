export type CaptureCheck = { usable: boolean; warnings: string[]; message: string };

const MIN_CAPTURE_DIMENSION = 600;

export function getCaptureGuideWidth(viewportWidth: number, availableHeight: number, centerOffset = 0): number {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(availableHeight) || !Number.isFinite(centerOffset)) return 0;
  const widthLimit = Math.max(0, viewportWidth - 48);
  const heightLimit = Math.max(0, (availableHeight - Math.max(0, centerOffset) * 2 - 16) / (4 / 3));
  return Math.min(300, widthLimit, heightLimit);
}

export function assessCapture(width: number, height: number, size: number, mime?: string): CaptureCheck {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(size) || size < 1)
    return { usable: false, warnings: [], message: 'This photo cannot be opened. Retake it or choose another image.' };
  if (mime && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'].includes(mime.toLowerCase()))
    return { usable: false, warnings: [], message: 'Choose a still JPEG, PNG, WebP, HEIC or other supported camera photo.' };
  if (size > 32 * 1024 * 1024 || width * height > 100_000_000)
    return { usable: false, warnings: [], message: 'This image is too large to prepare safely. Choose a smaller photo or retake it.' };
  if (Math.min(width, height) <= MIN_CAPTURE_DIMENSION)
    return { usable: false, warnings: [], message: 'Move closer or choose a photo larger than 600 × 600 pixels so visible details can be reviewed.' };
  const warnings: string[] = [];
  if (width / height > 1.8 || width / height < 0.45) warnings.push('This is a very wide or narrow photo. Check that your face is clearly visible and reasonably centered.');
  return { usable: true, warnings, message: warnings.length ? warnings.join(' ') : 'This file can be prepared. Check the preview for lighting, focus and framing.' };
}

export function isOverexposed(pixels: ArrayLike<number>, width: number, height: number): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4)
    throw new Error('invalid-sampled-image');

  const left = Math.floor(width * 0.15);
  const right = Math.ceil(width * 0.85);
  const top = Math.floor(height * 0.1);
  const bottom = Math.ceil(height * 0.9);
  let clippedPixels = 0;
  let sampledPixels = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset] >= 250 && pixels[offset + 1] >= 250 && pixels[offset + 2] >= 250) clippedPixels++;
      sampledPixels++;
    }
  }
  return clippedPixels / sampledPixels >= 0.35;
}
