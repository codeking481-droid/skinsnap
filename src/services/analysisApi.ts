import { Image, Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MAX_PREPARED_PHOTO_BYTES } from '../photoValidation';
import {
  diagnosticRequestId,
  fetchFailureCode,
  retryAfterSeconds as readRetryAfterSeconds,
  safeServerErrorCode,
  type AnalysisDiagnostic,
} from '../analysisDiagnostics';
import { getVerifiedEntitlement } from './billing';
import { ensureAuthenticatedSession, getSessionToken, sessionFailureMessage, verifyAuthenticatedSession } from './session';
import { isAnalysisResponseAllowed } from '../subscriptionRules';
import { isSafeCosmeticText, parseRoutineGuidance } from '../routinePresentation';
import { runAnalysisOnce } from '../analysisRequestRegistry';
import { parseAnalysisQuality, parseAnalysisPreferences, parseObservationEvidence, type AnalysisPreferences, type AnalysisQuality, type ObservationEvidence } from '../analysisQuality';
import {
  analysisFailureStage,
  analysisRequestTimeoutMs,
  cleanupPreparedPhoto,
  createNativePhotoUploadRequest,
  createNativePhotoPart,
  photoPreparationAttempts,
  resizedDimensions,
  type NativePhotoPart,
  validatePreparedPhoto,
} from '../photoUpload';

export type AnalysisDiagnosticStage =
  | 'dimensions'
  | 'manipulation'
  | 'file-access'
  | 'multipart'
  | 'connectivity'
  | 'upload'
  | 'authentication'
  | 'quota'
  | 'vision'
  | 'gemini'
  | 'groq'
  | 'database'
  | 'response-parsing';

const OBSERVATION_CATEGORIES = [
  'visible-shine',
  'apparent-dryness',
  'uneven-looking-tone',
  'visible-blemishes',
  'general-texture',
  'natural-pores',
  'color-variation',
  'overall-finish',
] as const;

export type SkinObservation = ObservationEvidence & {
  category: typeof OBSERVATION_CATEGORIES[number];
  observation: string;
  confidence: 'low' | 'moderate' | 'high';
};

export type SkinAnalysisResult = AnalysisQuality & {
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
  | 'photo-not-suitable'
  | 'subscription-required'
  | 'development-test-not-authorized'
  | 'development-test-unavailable'
  | 'service-unavailable'
  | 'authentication-required'
  | 'consent-required'
  | 'photo-unavailable'
  | 'rate-limited'
  | 'admin-test-cap-reached'
  | 'retry-limit'
  | 'invalid-response'
  | 'network-error';

export class AnalysisRequestError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
    readonly stage: AnalysisDiagnosticStage | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'AnalysisRequestError';
  }
}

type PreparedPhoto =
  | { kind: 'native'; part: NativePhotoPart; file: File; width: number; height: number }
  | { kind: 'web'; blob: Blob };

function logStageFailure(stage: AnalysisDiagnosticStage, code: string, diagnostic?: AnalysisDiagnostic): void {
  if (!__DEV__) return;
  const handledProviderFailure = (stage === 'gemini' || stage === 'groq' || stage === 'database')
    && (code.startsWith('analysis-provider-') || code.startsWith('routine-provider-') || code.startsWith('database-'));
  const handledVisionFailure = stage === 'vision' && (code.startsWith('vision-provider-') || code.startsWith('vision-invalid-'));
  const log = code === 'rate-limited' || handledProviderFailure || handledVisionFailure ? console.info : console.warn;
  log('[SkinSnap analysis]', { stage, code, ...diagnostic });
}

function rateLimitMessage(mode: 'premium' | 'development', retryAfter: number | null): string {
  const limit = mode === 'development'
    ? 'The development test account is limited to two charged analysis attempts in a rolling 30-day period.'
    : 'The current account analysis limit has been reached.';
  if (retryAfter === null) {
    return `${limit} This request stopped before Gemini or Groq ran.`;
  }
  if (retryAfter === 0) {
    return `${limit} The server says you may retry now. This request stopped before Gemini or Groq ran.`;
  }
  const wait = retryAfter < 60
    ? `about ${retryAfter} second${retryAfter === 1 ? '' : 's'}`
    : retryAfter < 3600
      ? `about ${Math.ceil(retryAfter / 60)} minute${Math.ceil(retryAfter / 60) === 1 ? '' : 's'}`
      : retryAfter < 86400
        ? `about ${Math.ceil(retryAfter / 3600)} hour${Math.ceil(retryAfter / 3600) === 1 ? '' : 's'}`
        : `about ${Math.ceil(retryAfter / 86400)} day${Math.ceil(retryAfter / 86400) === 1 ? '' : 's'}`;
  return `${limit} The server says to try again in ${wait}. This request stopped before Gemini or Groq ran.`;
}

function photoPreparationError(
  stage: 'dimensions' | 'manipulation' | 'file-access',
  code: string,
  message: string,
): AnalysisRequestError {
  logStageFailure(stage, code);
  return new AnalysisRequestError('photo-unavailable', message, stage);
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

async function readServiceErrorCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  } catch {
    return '';
  }
}

export function parseAnalysisResult(
  value: unknown,
  options: { savedHistory?: boolean } = {},
): SkinAnalysisResult {
  if (!isRecord(value)
    || !isShortText(value.resultId, 128)
    || !isShortText(value.createdAt, 64)
    || !Number.isFinite(Date.parse(value.createdAt))
    || !['clear', 'limited'].includes(String(value.imageQuality))
    || !isShortText(value.summary, 800)
    || !isSafeCosmeticText(value.summary)
    || !Array.isArray(value.observations)
    || value.observations.length > 12
    || !Array.isArray(value.morningRoutine)
    || (!options.savedHistory && value.morningRoutine.length === 0)
    || value.morningRoutine.length > 8
    || !Array.isArray(value.eveningRoutine)
    || (!options.savedHistory && value.eveningRoutine.length === 0)
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
      || !isSafeCosmeticText(item.observation)
      || !['low', 'moderate', 'high'].includes(String(item.confidence))) {
      throw new AnalysisRequestError('invalid-response', 'The analysis service returned an unsupported observation.');
    }
    let evidence: ObservationEvidence;
    try { evidence = parseObservationEvidence(item, isSafeCosmeticText); }
    catch { throw new AnalysisRequestError('invalid-response', 'The observation evidence could not be validated.'); }
    return {
      ...evidence,
      category: item.category as SkinObservation['category'],
      observation: item.observation,
      confidence: item.confidence as SkinObservation['confidence'],
    };
  });
  const readGuidance = (list: unknown[]): string[] => {
    try {
      return parseRoutineGuidance(list, options.savedHistory === true);
    } catch {
      throw new AnalysisRequestError('invalid-response', 'The analysis service returned unsupported guidance.');
    }
  };

  let quality: AnalysisQuality;
  try { quality = parseAnalysisQuality(value, isSafeCosmeticText); }
  catch { throw new AnalysisRequestError('invalid-response', 'The photo quality assessment could not be validated.'); }
  if (quality.imageAssessment?.usable === false) throw new AnalysisRequestError('invalid-response', 'This photo was not suitable for a completed analysis.');
  return {
    ...quality,
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

async function readPhotoDimensions(photoUri: string): Promise<{ width: number; height: number }> {
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(photoUri, (width, height) => resolve({ width, height }), reject);
    });
    if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)
      || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error('invalid-dimensions');
    }
    return dimensions;
  } catch {
    throw photoPreparationError('dimensions', 'invalid-image-dimensions', 'The selected image dimensions could not be read. Choose another photo or retake it.');
  }
}

async function prepareNativePhoto(photoUri: string, dimensions: { width: number; height: number }): Promise<PreparedPhoto> {
  let manipulationSucceeded = false;
  let lastSize = 0;
  for (const attempt of photoPreparationAttempts(dimensions.width, dimensions.height)) {
    let prepared: Awaited<ReturnType<typeof manipulateAsync>>;
    try {
      const target = resizedDimensions(dimensions.width, dimensions.height, attempt.maxEdge);
      prepared = await manipulateAsync(photoUri, [{ resize: target }], {
        compress: attempt.quality,
        format: SaveFormat.JPEG,
      });
    } catch {
      continue;
    }
    manipulationSucceeded = true;
    if (!prepared.uri) {
      continue;
    }
    let discardedFile: File | null = null;
    let keepPreparedFile = false;
    try {
      if (prepared.uri === photoUri) throw photoPreparationError('manipulation', 'prepared-copy-required', 'A separate temporary photo copy could not be created. Your original photo was not changed.');
      const file = new File(prepared.uri);
      discardedFile = file;
      const { size, type } = file;
      const validation = validatePreparedPhoto({
        exists: file.exists,
        size,
        mimeType: type,
        width: prepared.width,
        height: prepared.height,
      }, MAX_PREPARED_PHOTO_BYTES);
      if (!validation.valid) {
        if (validation.reason === 'too-large') {
          lastSize = size;
          continue;
        }
        const message = validation.reason === 'missing'
          ? 'The prepared photo is not available to upload. Please choose it again or retake it.'
          : validation.reason === 'empty'
            ? 'The prepared photo is empty or unreadable. Choose another photo or retake it.'
            : validation.reason === 'invalid-mime'
              ? 'The prepared photo format could not be verified. Choose another photo or retake it.'
              : 'The prepared image dimensions could not be verified. Choose another photo or retake it.';
        throw photoPreparationError('file-access', `prepared-file-${validation.reason}`, message);
      }
      keepPreparedFile = true;
      return {
        kind: 'native',
        part: createNativePhotoPart(file.uri),
        file,
        width: prepared.width,
        height: prepared.height,
      };
    } catch (error) {
      if (error instanceof AnalysisRequestError) throw error;
      throw photoPreparationError('file-access', 'prepared-file-unreadable', 'The prepared photo could not be read securely. Choose another photo or retake it.');
    } finally {
      if (discardedFile && !keepPreparedFile && !cleanupPreparedPhoto(discardedFile)) {
        throw photoPreparationError('file-access', 'discarded-copy-cleanup-failed', 'SkinSnap could not remove an unused temporary photo copy. Clear the app cache before sharing this device.');
      }
    }
  }
  if (!manipulationSucceeded) {
    throw photoPreparationError('manipulation', 'image-manipulation-failed', 'The selected image could not be converted to JPEG. Choose another photo or retake it.');
  }
  if (lastSize > MAX_PREPARED_PHOTO_BYTES) {
    throw photoPreparationError('file-access', 'prepared-file-too-large', 'This image is still larger than the secure 12 MB upload limit after compression. Choose another photo or retake it.');
  }
  throw photoPreparationError('manipulation', 'image-manipulation-failed', 'The selected image could not be prepared as JPEG. Choose another photo or retake it.');
}

async function prepareWebPhoto(photoUri: string, dimensions: { width: number; height: number }): Promise<PreparedPhoto> {
  let manipulationSucceeded = false;
  try {
    for (const attempt of photoPreparationAttempts(dimensions.width, dimensions.height)) {
      const prepared = await manipulateAsync(photoUri, [{ resize: resizedDimensions(dimensions.width, dimensions.height, attempt.maxEdge) }], {
        compress: attempt.quality,
        format: SaveFormat.JPEG,
      });
      manipulationSucceeded = true;
      if (!prepared.uri || prepared.width <= 0 || prepared.height <= 0 || prepared.width > 2048 || prepared.height > 2048) {
        continue;
      }
      const response = await fetch(prepared.uri);
      if (!response.ok) {
        throw photoPreparationError('file-access', 'prepared-file-unreadable', 'The prepared photo could not be read securely. Choose another photo or retake it.');
      }
      const blob = await response.blob();
      if (blob.type !== 'image/jpeg' || blob.size <= 0) {
        throw photoPreparationError('file-access', 'prepared-file-invalid', 'The prepared photo format or size could not be verified. Choose another photo or retake it.');
      }
      if (blob.size <= MAX_PREPARED_PHOTO_BYTES) return { kind: 'web', blob };
    }
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    if (!manipulationSucceeded) {
      throw photoPreparationError('manipulation', 'image-manipulation-failed', 'The selected image could not be converted to JPEG. Choose another photo or retake it.');
    }
    throw photoPreparationError('file-access', 'prepared-file-unreadable', 'The prepared photo could not be read securely. Choose another photo or retake it.');
  }
  throw photoPreparationError('file-access', 'prepared-file-too-large', 'This image is still larger than the secure 12 MB upload limit after compression. Choose another photo or retake it.');
}

async function preparePhotoForUpload(photoUri: string): Promise<PreparedPhoto> {
  const dimensions = await readPhotoDimensions(photoUri);
  return Platform.OS === 'web'
    ? prepareWebPhoto(photoUri, dimensions)
    : prepareNativePhoto(photoUri, dimensions);
}

export function requestSkinAnalysis(
  photoUri: string, photoUploadConsent: boolean, idempotencyKey: string,
  mode: 'premium' | 'development' = 'premium', preferences: AnalysisPreferences = {},
): Promise<SkinAnalysisResult> {
  return runAnalysisOnce(idempotencyKey, () => performSkinAnalysis(photoUri, photoUploadConsent, idempotencyKey, mode, preferences));
}

async function performSkinAnalysis(
  photoUri: string,
  photoUploadConsent: boolean,
  idempotencyKey: string,
  mode: 'premium' | 'development' = 'premium',
  preferences: AnalysisPreferences = {},
): Promise<SkinAnalysisResult> {
  if (mode === 'development' && !__DEV__) throw new AnalysisRequestError('development-test-unavailable', 'Development analysis is not available in release builds.');
  const validatedPreferences = parseAnalysisPreferences(preferences);
  const requestId = diagnosticRequestId(idempotencyKey);
  if (!photoUploadConsent) {
    throw new AnalysisRequestError('consent-required', 'Confirm photo upload consent before requesting analysis.');
  }
  const url = backendUrl();
  if (!url) {
    throw new AnalysisRequestError('service-unavailable', 'Secure analysis is not configured yet. Your photo has not been uploaded.');
  }
  let session: Awaited<ReturnType<typeof verifyAuthenticatedSession>>;
  try {
    session = mode === 'premium'
      ? await ensureAuthenticatedSession()
      : await verifyAuthenticatedSession();
  } catch {
    logStageFailure('authentication', 'session-verification-failed');
    throw new AnalysisRequestError('authentication-required', 'Your account could not be verified. Sign in again before requesting analysis.', 'authentication');
  }
  if (!session.valid) {
    logStageFailure('authentication', `session-${session.reason}`, { requestId });
    throw new AnalysisRequestError(
      'authentication-required',
      sessionFailureMessage(session),
    );
  }
  if (mode === 'premium') {
    const entitlement = await getVerifiedEntitlement();
    if (!entitlement.active) {
      if (entitlement.reason === 'inactive' || entitlement.reason === 'preview') {
        throw new AnalysisRequestError('subscription-required', 'An active, verified SkinSnap subscription is required.');
      }
      throw new AnalysisRequestError('service-unavailable', 'Billing verification is unavailable. No photo was uploaded.');
    }
  }
  if (__DEV__) console.info('[SkinSnap analysis]', { stage: 'connectivity', code: 'authenticated-json-ok', requestId, httpStatus: 200 });
  let token: string | null;
  try {
    token = await getSessionToken();
  } catch {
    logStageFailure('authentication', 'session-token-unavailable');
    throw new AnalysisRequestError('authentication-required', 'Your secure sign-in could not be read. Sign in again before requesting analysis.', 'authentication');
  }
  if (!token) {
    logStageFailure('authentication', 'session-token-missing', { requestId });
    throw new AnalysisRequestError('authentication-required', 'Sign-in is required before a photo can be sent securely.', 'authentication');
  }
  if (mode === 'premium' && !isAnalysisResponseAllowed(true, Boolean(url), Boolean(token))) {
    throw new AnalysisRequestError('service-unavailable', 'Secure analysis is not configured yet. Your photo has not been uploaded.');
  }

  const photo = await preparePhotoForUpload(photoUri);
  let requestFailed = false;
  let requestError: unknown;
  try {
  let response: Response;
  const controller = new AbortController();
  let requestTimedOut = false;
  const photoBytes = photo.kind === 'native' ? photo.file.size : photo.blob.size;
  const timeoutMs = analysisRequestTimeoutMs(photoBytes, MAX_PREPARED_PHOTO_BYTES);
  const requestStartedAt = Date.now();
  let uploadBytesSent: number | undefined;
  let uploadTotalBytes: number | undefined;
  if (__DEV__) {
    console.info('[SkinSnap analysis]', { stage: 'upload', code: 'analysis-request-started', requestId, photoBytes, timeoutMs });
  }
  const timeout = setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const endpoint = `${url}${mode === 'development' ? '/v1/dev/analysis' : '/v1/analysis'}?client_request_id=${encodeURIComponent(requestId)}`;
    if (photo.kind === 'native') {
      const file = photo.file;
      const validation = validatePreparedPhoto({
        exists: file.exists,
        size: file.size,
        mimeType: file.type,
        width: photo.width,
        height: photo.height,
      }, MAX_PREPARED_PHOTO_BYTES);
      if (!validation.valid) {
        logStageFailure('file-access', `upload-file-${validation.reason}`, { requestId });
        throw new AnalysisRequestError(
          'photo-unavailable',
          'The prepared photo is no longer available to upload. Please choose it again or retake it.',
          'file-access',
        );
      }
      const uploadRequest = createNativePhotoUploadRequest(
        photo.part,
        UploadType.MULTIPART,
        `Bearer ${token}`,
        idempotencyKey,
        controller.signal,
        ({ bytesSent, totalBytes }) => {
          uploadBytesSent = bytesSent;
          uploadTotalBytes = totalBytes;
        },
      );
      const upload = await file.upload(endpoint, {
        ...uploadRequest.options,
        headers: { ...uploadRequest.options.headers, 'X-SkinSnap-Preferences': JSON.stringify(validatedPreferences).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')) },
      });
      response = new Response(upload.body, { status: upload.status, headers: upload.headers });
    } else {
      const form = new FormData();
      form.append('photo', photo.blob, 'skin-photo.jpg');
      response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
        'X-SkinSnap-Preferences': JSON.stringify(validatedPreferences).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')),
      },
      body: form,
      signal: controller.signal,
    });
    }
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    const failure = fetchFailureCode(error, requestTimedOut);
    logStageFailure('upload', failure.code, {
      requestId,
      httpStatus: null,
      serverErrorCode: null,
      errorName: failure.errorName,
      failureCause: failure.failureCause,
      elapsedMs: Date.now() - requestStartedAt,
      ...(uploadBytesSent !== undefined ? { uploadBytesSent } : {}),
      ...(uploadTotalBytes !== undefined ? { uploadTotalBytes } : {}),
    });
    throw new AnalysisRequestError(
      'network-error',
      requestTimedOut
        ? `This analysis is taking longer than expected (reference ${requestId}). It may still finish on the secure service. Check your history before starting another scan; retrying this request uses the same safe request reference.`
        : `SkinSnap could not reach the secure analysis service (${failure.failureCause}; reference ${requestId}). Check your connection and retry.`,
      'upload',
    );
  } finally {
    clearTimeout(timeout);
  }

  const serverErrorCode = response.ok ? null : safeServerErrorCode(await readServiceErrorCode(response.clone()));
  const diagnostic = {
    requestId,
    httpStatus: response.status,
    serverErrorCode,
  };
  if (response.status === 422 && serverErrorCode === 'photo-not-suitable') {
    const body: unknown = await response.clone().json().catch(() => null);
    const guidance = isRecord(body) && isShortText(body.message, 300) && isSafeCosmeticText(body.message)
      ? body.message : 'Choose a sharp photo with skin clearly visible in even light, without filters.';
    throw new AnalysisRequestError('photo-not-suitable', guidance, 'vision');
  }

  if (response.status === 401) {
    logStageFailure('authentication', serverErrorCode ?? 'http-401', diagnostic);
    throw new AnalysisRequestError('authentication-required', 'Your sign-in has expired. Sign in again to continue.', 'authentication');
  }
  if (response.status === 403) {
    if (mode === 'development') {
      const code = serverErrorCode ?? 'http-403';
      logStageFailure('authentication', code, diagnostic);
      if (serverErrorCode === 'development-test-not-authorized') {
        throw new AnalysisRequestError(
          'development-test-not-authorized',
          'This signed-in account is not enabled for the development AI test. No photo was analyzed.',
          'authentication',
        );
      }
      throw new AnalysisRequestError(
        'authentication-required',
        'The server could not verify this development test account. No photo was analyzed.',
        'authentication',
      );
    }
    logStageFailure('authentication', 'http-403');
    throw new AnalysisRequestError('subscription-required', 'The server could not verify an active subscription.', 'authentication');
  }
  if (response.status === 404 && mode === 'development') {
    if (serverErrorCode === 'not-found') {
      logStageFailure('authentication', 'development-route-unavailable', diagnostic);
      throw new AnalysisRequestError(
        'development-test-unavailable',
        'Development AI testing is not enabled on the server. No photo was analyzed.',
        'authentication',
      );
    }
    logStageFailure('upload', serverErrorCode ?? 'http-404', diagnostic);
    throw new AnalysisRequestError(
      'service-unavailable',
      'The development analysis request could not reach the test endpoint. No result was returned.',
      'upload',
    );
  }
  if (response.status === 429) {
    const retryAfter = readRetryAfterSeconds(response.headers.get('Retry-After'));
    logStageFailure('quota', serverErrorCode ?? 'http-429', diagnostic);
    if (serverErrorCode === 'admin-test-cap-reached') {
      throw new AnalysisRequestError(
        'admin-test-cap-reached',
        'The administrator testing safety cap has been reached for the current rolling 30-day period. The limit protects AI spending and resets automatically.',
        'quota',
        retryAfter,
      );
    }
    throw new AnalysisRequestError('rate-limited', rateLimitMessage(mode, retryAfter), 'quota', retryAfter);
  }
  if (response.status === 409) {
    logStageFailure('upload', serverErrorCode ?? 'http-409', diagnostic);
    if (serverErrorCode === 'analysis-retry-limit') {
      throw new AnalysisRequestError('retry-limit', 'This request could not be completed after a retry. Start a new scan to try again.');
    }
    throw new AnalysisRequestError('service-unavailable', 'This analysis request is still processing. Please retry shortly.');
  }
  if (!response.ok) {
    const retryAfter = readRetryAfterSeconds(response.headers.get('Retry-After'));
    const serverCode = serverErrorCode ?? '';
    const serverStage = analysisFailureStage(serverCode);
    const stage = serverStage ?? 'upload';
    logStageFailure(stage, serverCode || `http-${response.status}`, diagnostic);
    const providerRateLimit = serverCode === 'vision-provider-quota-exhausted';
    const message = providerRateLimit
      ? retryAfter !== null
        ? `The photo analysis provider is busy. Wait ${Math.max(1, Math.ceil(retryAfter))} seconds before retrying.`
        : 'The photo analysis provider has reached its usage limit. Please wait before retrying.'
      : serverStage === 'vision' || serverStage === 'gemini' || serverStage === 'groq' || serverStage === 'database'
      ? 'SkinSnap could not complete your analysis right now. Please try again shortly.'
      : 'The analysis service could not complete your request. Please try again.';
    throw new AnalysisRequestError('service-unavailable', message, stage, retryAfter);
  }

  try {
    return parseAnalysisResult(await response.json());
  } catch (error) {
    logStageFailure('response-parsing', error instanceof AnalysisRequestError ? error.code : 'invalid-json', {
      requestId,
      httpStatus: response.status,
      serverErrorCode: null,
    });
    if (error instanceof AnalysisRequestError) {
      throw new AnalysisRequestError(error.code, error.message, 'response-parsing');
    }
    throw new AnalysisRequestError('invalid-response', 'The analysis service returned an unreadable response.', 'response-parsing');
  }
  } catch (error) {
    requestFailed = true;
    requestError = error;
    throw error;
  } finally {
    if (photo.kind === 'native') {
      if (!cleanupPreparedPhoto(photo.file)) {
        logStageFailure('file-access', 'prepared-file-cleanup-failed', { requestId });
        if (requestError instanceof AnalysisRequestError) {
          throw new AnalysisRequestError(
            requestError.code,
            `${requestError.message} SkinSnap also could not remove its temporary prepared photo; clear the app cache before sharing this device.`,
            requestError.stage,
            requestError.retryAfterSeconds,
          );
        }
        if (!requestFailed) {
          throw new AnalysisRequestError(
            'photo-unavailable',
            'The analysis finished, but SkinSnap could not remove its temporary prepared photo. Retry this request or clear the app cache before sharing your device.',
            'file-access',
          );
        }
      }
    }
  }
}
