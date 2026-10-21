import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MAX_PREPARED_PHOTO_BYTES } from '../photoValidation';
import { getVerifiedEntitlement } from './billing';
import { getSessionToken, verifyAuthenticatedSession } from './session';
import { isAnalysisResponseAllowed } from '../subscriptionRules';

const OBSERVATION_CATEGORIES = [
  'visible-shine',
  'apparent-dryness',
  'uneven-looking-tone',
  'visible-blemishes',
  'general-texture',
] as const;

export type SkinObservation = {
  category: typeof OBSERVATION_CATEGORIES[number];
  observation: string;
  confidence: 'low' | 'moderate' | 'high';
};

export type SkinAnalysisResult = {
  resultId: string;
  createdAt: string;
  imageQuality: 'clear' | 'limited';
  summary: string;
  observations: SkinObservation[];
  morningRoutine: string[];
  eveningRoutine: string[];
  precautions: string[];
};

export type AnalysisErrorCode =
  | 'subscription-required'
  | 'service-unavailable'
  | 'authentication-required'
  | 'consent-required'
  | 'photo-unavailable'
  | 'rate-limited'
  | 'retry-limit'
  | 'invalid-response'
  | 'network-error';

export class AnalysisRequestError extends Error {
  constructor(readonly code: AnalysisErrorCode, message: string) {
    super(message);
    this.name = 'AnalysisRequestError';
  }
}

function backendUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value?.startsWith('https://') ? value.replace(/\/+$/, '') : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function parseAnalysisResult(value: unknown): SkinAnalysisResult {
  if (!isRecord(value)
    || !isShortText(value.resultId, 128)
    || !isShortText(value.createdAt, 64)
    || !Number.isFinite(Date.parse(value.createdAt))
    || !['clear', 'limited'].includes(String(value.imageQuality))
    || !isShortText(value.summary, 800)
    || !Array.isArray(value.observations)
    || value.observations.length > 12
    || !Array.isArray(value.morningRoutine)
    || value.morningRoutine.length === 0
    || value.morningRoutine.length > 8
    || !Array.isArray(value.eveningRoutine)
    || value.eveningRoutine.length === 0
    || value.eveningRoutine.length > 8
    || !Array.isArray(value.precautions)
    || value.precautions.length > 8) {
    throw new AnalysisRequestError('invalid-response', 'The analysis service returned an unsupported response.');
  }

  const observations: SkinObservation[] = value.observations.map((item) => {
    if (!isRecord(item)
      || typeof item.category !== 'string'
      || !OBSERVATION_CATEGORIES.includes(item.category as SkinObservation['category'])
      || !isShortText(item.observation, 400)
      || !['low', 'moderate', 'high'].includes(String(item.confidence))) {
      throw new AnalysisRequestError('invalid-response', 'The analysis service returned an unsupported observation.');
    }
    return {
      category: item.category as SkinObservation['category'],
      observation: item.observation,
      confidence: item.confidence as SkinObservation['confidence'],
    };
  });
  const readGuidance = (list: unknown[]): string[] => list.map((item) => {
    if (!isShortText(item, 240)) {
      throw new AnalysisRequestError('invalid-response', 'The analysis service returned unsupported guidance.');
    }
    return item;
  });

  return {
    resultId: value.resultId,
    createdAt: value.createdAt,
    imageQuality: value.imageQuality as SkinAnalysisResult['imageQuality'],
    summary: value.summary,
    observations,
    morningRoutine: readGuidance(value.morningRoutine),
    eveningRoutine: readGuidance(value.eveningRoutine),
    precautions: readGuidance(value.precautions),
  };
}

async function preparePhotoForUpload(photoUri: string): Promise<Blob> {
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      photoUri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  const scale = Math.min(1, 2048 / longestEdge);
  const actions = scale < 1
    ? [{ resize: { width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale) } }]
    : [];
  const prepared = await manipulateAsync(photoUri, actions, {
    compress: 0.86,
    format: SaveFormat.JPEG,
  });
  const response = await fetch(prepared.uri);
  if (!response.ok) throw new Error('The selected photo could not be prepared.');
  const photo = await response.blob();
  if (photo.size <= 0 || photo.size > MAX_PREPARED_PHOTO_BYTES) {
    throw new Error('The prepared photo exceeds the secure upload limit.');
  }
  return photo;
}

export async function requestSkinAnalysis(
  photoUri: string,
  photoUploadConsent: boolean,
  idempotencyKey: string,
): Promise<SkinAnalysisResult> {
  if (!photoUploadConsent) {
    throw new AnalysisRequestError('consent-required', 'Confirm photo upload consent before requesting analysis.');
  }
  const entitlement = await getVerifiedEntitlement();
  if (!entitlement.active) {
    if (entitlement.reason === 'inactive' || entitlement.reason === 'preview') {
      throw new AnalysisRequestError('subscription-required', 'An active, verified SkinSnap subscription is required.');
    }
    throw new AnalysisRequestError('service-unavailable', 'Billing verification is unavailable. No photo was uploaded.');
  }

  const url = backendUrl();
  if (!url) {
    throw new AnalysisRequestError('service-unavailable', 'Secure analysis is not configured yet. Your photo has not been uploaded.');
  }
  const session = await verifyAuthenticatedSession();
  if (!session.valid) {
    throw new AnalysisRequestError(
      'authentication-required',
      session.reason === 'expired'
        ? 'Your sign-in has expired. Sign in again to continue.'
        : session.reason === 'identity-mismatch'
          ? 'Your signed-in account could not be matched to its subscription. No photo was uploaded.'
          : 'A valid signed-in account is required before a photo can be sent securely.',
    );
  }
  const token = await getSessionToken();
  if (!isAnalysisResponseAllowed(entitlement.active, Boolean(url), Boolean(token))) {
    if (!token) {
      throw new AnalysisRequestError('authentication-required', 'Sign-in is required before a photo can be sent securely.');
    }
    throw new AnalysisRequestError('service-unavailable', 'Secure analysis is not configured yet. Your photo has not been uploaded.');
  }

  let photo: Blob;
  try {
    photo = await preparePhotoForUpload(photoUri);
  } catch {
    throw new AnalysisRequestError('photo-unavailable', 'The selected image could not be prepared for secure analysis. Try another image or retake the photo.');
  }

  const form = new FormData();
  form.append('photo', photo, 'skin-photo.jpg');
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    response = await fetch(`${url}/v1/analysis`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new AnalysisRequestError('network-error', 'Could not reach the secure analysis service. Please try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401) {
    throw new AnalysisRequestError('authentication-required', 'Your sign-in has expired. Sign in again to continue.');
  }
  if (response.status === 403) {
    throw new AnalysisRequestError('subscription-required', 'The server could not verify an active subscription.');
  }
  if (response.status === 429) {
    throw new AnalysisRequestError('rate-limited', 'You have reached the current analysis limit. Try again later.');
  }
  if (response.status === 409) {
    let errorCode: unknown;
    try {
      const payload: unknown = await response.json();
      errorCode = isRecord(payload) ? payload.error : null;
    } catch {
      errorCode = null;
    }
    if (errorCode === 'analysis-retry-limit') {
      throw new AnalysisRequestError('retry-limit', 'This request could not be completed after a retry. Start a new scan to try again.');
    }
    throw new AnalysisRequestError('service-unavailable', 'This analysis request is still processing. Please retry shortly.');
  }
  if (!response.ok) {
    throw new AnalysisRequestError('service-unavailable', 'The analysis service is unavailable. No result was generated.');
  }

  try {
    return parseAnalysisResult(await response.json());
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    throw new AnalysisRequestError('invalid-response', 'The analysis service returned an unreadable response.');
  }
}
