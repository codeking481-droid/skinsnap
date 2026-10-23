import type { UploadOptions, UploadProgress, UploadType } from 'expo-file-system';

export const PHOTO_UPLOAD_FIELD = 'photo';
export const PHOTO_UPLOAD_NAME = 'skin-photo.jpg';
export const PHOTO_UPLOAD_MIME_TYPE = 'image/jpeg';

const GEMINI_ATTEMPT_TIMEOUT_MS = 35_000;
const GEMINI_ATTEMPT_LIMIT = 2;
const GEMINI_RETRY_DELAY_MS = 10_000;
const GROQ_REQUEST_TIMEOUT_MS = 25_000;
const REQUEST_FINALIZATION_BUFFER_MS = 15_000;
const MIN_UPLOAD_BYTES_PER_SECOND = 128 * 1024;

export function analysisRequestTimeoutMs(photoBytes: number, maxPhotoBytes: number): number {
  const safePhotoBytes = Number.isFinite(photoBytes)
    ? Math.max(0, Math.min(photoBytes, maxPhotoBytes))
    : maxPhotoBytes;
  const uploadBudgetMs = Math.ceil((safePhotoBytes / MIN_UPLOAD_BYTES_PER_SECOND) * 1000);
  const providerBudgetMs = (GEMINI_ATTEMPT_TIMEOUT_MS * GEMINI_ATTEMPT_LIMIT)
    + GEMINI_RETRY_DELAY_MS
    + GROQ_REQUEST_TIMEOUT_MS;
  return providerBudgetMs + REQUEST_FINALIZATION_BUFFER_MS + uploadBudgetMs;
}

export type NativePhotoPart = {
  uri: string;
  name: typeof PHOTO_UPLOAD_NAME;
  type: typeof PHOTO_UPLOAD_MIME_TYPE;
};

export type NativePhotoUploadRequest = {
  uri: string;
  options: Pick<UploadOptions, 'httpMethod' | 'uploadType' | 'fieldName' | 'mimeType' | 'headers' | 'signal' | 'onProgress'>;
};

export type NativeMultipartPart =
  | { string: string; headers: Record<string, string>; fieldName?: string }
  | { uri: string; headers: Record<string, string>; fieldName?: string; name?: string; type?: string };

export type NativeMultipartFormData = FormData & {
  append(name: string, value: NativePhotoPart): void;
  getParts(): NativeMultipartPart[];
};

export type PhotoPreparationAttempt = {
  maxEdge: number;
  quality: number;
};

export type PreparedPhotoMetadata = {
  exists: boolean;
  size: number;
  mimeType: string;
  width: number;
  height: number;
};

export type PreparedPhotoValidation =
  | { valid: true }
  | { valid: false; reason: 'missing' | 'empty' | 'invalid-mime' | 'invalid-dimensions' | 'too-large' };

export type PreparedPhotoFile = {
  exists: boolean;
  delete: () => void;
};

export function validatePreparedPhoto(metadata: PreparedPhotoMetadata, maxBytes: number): PreparedPhotoValidation {
  if (!metadata.exists) return { valid: false, reason: 'missing' };
  if (!Number.isFinite(metadata.size) || metadata.size <= 0) return { valid: false, reason: 'empty' };
  if (metadata.mimeType !== PHOTO_UPLOAD_MIME_TYPE) return { valid: false, reason: 'invalid-mime' };
  if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)
    || metadata.width <= 0 || metadata.height <= 0
    || metadata.width > 2048 || metadata.height > 2048) {
    return { valid: false, reason: 'invalid-dimensions' };
  }

  if (metadata.size > maxBytes) return { valid: false, reason: 'too-large' };
  return { valid: true };
}

export function cleanupPreparedPhoto(file: PreparedPhotoFile): boolean {
  try {
    if (file.exists) file.delete();
    return true;
  } catch {
    return false;
  }
}

export function photoPreparationAttempts(width: number, height: number): PhotoPreparationAttempt[] {
  const longestEdge = Math.max(width, height);
  return [
    { maxEdge: Math.min(longestEdge, 2048), quality: 0.86 },
    { maxEdge: Math.min(longestEdge, 1800), quality: 0.76 },
    { maxEdge: Math.min(longestEdge, 1536), quality: 0.68 },
    { maxEdge: Math.min(longestEdge, 1280), quality: 0.6 },
  ];
}

export function resizedDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function createNativePhotoPart(uri: string): NativePhotoPart {
  return { uri, name: PHOTO_UPLOAD_NAME, type: PHOTO_UPLOAD_MIME_TYPE };
}

export function createNativePhotoUploadRequest(
  photo: NativePhotoPart,
  multipartUploadType: UploadType,
  authorization: string,
  idempotencyKey: string,
  signal: AbortSignal,
  onProgress?: (progress: UploadProgress) => void,
): NativePhotoUploadRequest {
  return {
    uri: photo.uri,
    options: {
      httpMethod: 'POST',
      uploadType: multipartUploadType,
      fieldName: PHOTO_UPLOAD_FIELD,
      mimeType: photo.type,
      headers: {
        Authorization: authorization,
        'Idempotency-Key': idempotencyKey,
      },
      signal,
      ...(onProgress ? { onProgress } : {}),
    },
  };
}

export function appendPhotoPart(
  form: Pick<NativeMultipartFormData, 'append'>,
  photo: NativePhotoPart,
): void {
  form.append(PHOTO_UPLOAD_FIELD, photo);
}

export function hasNativePhotoPart(
  parts: NativeMultipartPart[],
  photo: NativePhotoPart,
): boolean {
  return parts.some((part) => {
    if (!('uri' in part)) return false;
    const disposition = part.headers['content-disposition'] ?? '';
    return part.fieldName === PHOTO_UPLOAD_FIELD
      && part.uri === photo.uri
      && part.name === PHOTO_UPLOAD_NAME
      && part.type === PHOTO_UPLOAD_MIME_TYPE
      && disposition.includes(`name="${PHOTO_UPLOAD_FIELD}"`)
      && disposition.includes(`filename="${PHOTO_UPLOAD_NAME}"`)
      && part.headers['content-type'] === PHOTO_UPLOAD_MIME_TYPE;
  });
}

export function analysisFailureStage(code: string): 'vision' | 'gemini' | 'groq' | 'database' | null {
  if (code.startsWith('vision-provider-') || code.startsWith('vision-invalid-')) return 'vision';
  if (code.startsWith('analysis-provider-') || code.startsWith('analysis-invalid-')) return 'gemini';
  if (code.startsWith('routine-provider-') || code.startsWith('routine-invalid-')) return 'groq';
  if (code.startsWith('database-')) return 'database';
  return null;
}
