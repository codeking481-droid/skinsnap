export type CaptureCheck = { usable: boolean; warnings: string[]; message: string };
export function assessCapture(width: number, height: number, size: number, mime?: string): CaptureCheck {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(size) || size < 1)
    return { usable: false, warnings: [], message: 'This photo cannot be opened. Retake it or choose another image.' };
  if (mime && !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'].includes(mime.toLowerCase()))
    return { usable: false, warnings: [], message: 'Choose a still JPEG, PNG, WebP, HEIC or other supported camera photo.' };
  if (size > 32 * 1024 * 1024 || width * height > 100_000_000)
    return { usable: false, warnings: [], message: 'This image is too large to prepare safely. Choose a smaller photo or retake it.' };
  const warnings: string[] = [];
  if (Math.min(width, height) < 320) warnings.push('This photo is small. A higher-resolution photo may show more detail.');
  if (width / height > 1.8 || width / height < 0.45) warnings.push('This is a very wide or narrow photo. Check that your face is clearly visible and reasonably centered.');
  return { usable: true, warnings, message: warnings.length ? warnings.join(' ') : 'This file can be prepared. Check the preview for lighting, focus and framing.' };
}
