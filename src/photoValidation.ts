export const MAX_PREPARED_PHOTO_BYTES = 12 * 1024 * 1024;

export type PhotoValidation =
  | { valid: true }
  | { valid: false; reason: 'unreadable' | 'too-large' };

export function validatePhoto(width: number, height: number, sizeBytes?: number): PhotoValidation {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0
    || (sizeBytes !== undefined && (!Number.isFinite(sizeBytes) || sizeBytes <= 0))) {
    return { valid: false, reason: 'unreadable' };
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_PREPARED_PHOTO_BYTES) return { valid: false, reason: 'too-large' };
  return { valid: true };
}
