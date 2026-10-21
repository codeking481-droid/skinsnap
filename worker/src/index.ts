interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  REVENUECAT_SECRET_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

type AuthenticatedUser = {
  id: string;
  email?: string;
};

type SkinObservation = {
  category: 'visible-shine' | 'apparent-dryness' | 'uneven-looking-tone' | 'visible-blemishes' | 'general-texture';
  observation: string;
  confidence: 'low' | 'moderate' | 'high';
};

type AnalysisResult = {
  resultId: string;
  createdAt: string;
  imageQuality: 'clear' | 'limited';
  summary: string;
  observations: SkinObservation[];
  morningRoutine: string[];
  eveningRoutine: string[];
  precautions: string[];
};

class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_ANALYSIS_PHOTO_BYTES = 12 * 1024 * 1024;
const MONTHLY_ANALYSIS_LIMIT = 20;
const ENTITLEMENT_ID = 'skinsnap_premium';
const OBSERVATION_CATEGORIES = new Set([
  'visible-shine',
  'apparent-dryness',
  'uneven-looking-tone',
  'visible-blemishes',
  'general-texture',
]);

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new ApiError(503, 'service-not-configured', `${name} is not configured on the analysis service.`);
  return result;
}

function supabaseUrl(env: Env): string {
  const value = required(env.SUPABASE_URL, 'Supabase');
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(body: Request | Response): Promise<unknown> {
  try {
    return await body.json();
  } catch {
    if (body instanceof Request) {
      throw new ApiError(400, 'invalid-request', 'The request body must be valid JSON.');
    }
    throw new ApiError(502, 'upstream-invalid-response', 'A connected service returned an invalid response.');
  }
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new ApiError(401, 'authentication-required', 'Sign in to continue.');
  return match[1];
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser> {
  const token = getBearerToken(request);
  const response = await fetch(`${supabaseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: required(env.SUPABASE_ANON_KEY, 'Supabase authentication'),
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, 'authentication-required', 'Your sign-in has expired. Sign in again.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'authentication-unavailable', 'Could not verify your sign-in right now.');
  }
  const user = await readJson(response);
  if (!isRecord(user) || typeof user.id !== 'string' || !user.id) {
    throw new ApiError(502, 'authentication-invalid-response', 'The authentication service returned an invalid account.');
  }
  return { id: user.id, email: typeof user.email === 'string' ? user.email : undefined };
}

function supabaseHeaders(env: Env): HeadersInit {
  const key = required(env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase server access');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function databaseRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl(env)}/rest/v1/${path}`, {
      ...init,
      headers: { ...supabaseHeaders(env), ...init.headers },
    });
  } catch {
    throw new ApiError(503, 'database-unavailable', 'The secure data service is unavailable. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 409) return response;
    throw new ApiError(503, 'database-unavailable', 'The secure data service could not complete this request.');
  }
  return response;
}

async function hasPremiumEntitlement(env: Env, userId: string): Promise<boolean> {
  const key = required(env.REVENUECAT_SECRET_API_KEY, 'Subscription verification');
  let response: Response;
  try {
    response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(503, 'subscription-verification-unavailable', 'Subscription verification is temporarily unavailable.');
  }
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new ApiError(503, 'subscription-verification-unavailable', 'Subscription verification is temporarily unavailable.');
  }
  const payload = await readJson(response);
  const subscriber = isRecord(payload) && isRecord(payload.subscriber) ? payload.subscriber : null;
  const entitlements = subscriber && isRecord(subscriber.entitlements) ? subscriber.entitlements : null;
  const entitlement = entitlements?.[ENTITLEMENT_ID];
  if (!isRecord(entitlement)) return false;
  const expiration = entitlement.expires_date;
  if (expiration === null) return true;
  return typeof expiration === 'string' && Number.isFinite(Date.parse(expiration)) && Date.parse(expiration) > Date.now();
}

async function verifyPremium(env: Env, userId: string): Promise<void> {
  if (!await hasPremiumEntitlement(env, userId)) {
    throw new ApiError(403, 'subscription-required', 'An active SkinSnap subscription is required.');
  }
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

type SkinObservations = Pick<AnalysisResult, 'imageQuality' | 'summary' | 'observations'>;
type RoutineGuidance = Pick<AnalysisResult, 'morningRoutine' | 'eveningRoutine' | 'precautions'>;

function parseModelResult(text: string): SkinObservations {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'analysis-invalid-response', 'The analysis provider returned an unreadable response.');
  }
  if (!isRecord(value)
    || typeof value.summary !== 'string'
    || value.summary.trim().length === 0
    || value.summary.length > 800
    || !['clear', 'limited'].includes(String(value.imageQuality))
    || !Array.isArray(value.observations)
    || value.observations.length > 12) {
    throw new ApiError(502, 'analysis-invalid-response', 'The analysis provider returned an unsupported response.');
  }
  const observations: SkinObservation[] = value.observations.map((item) => {
    if (!isRecord(item)
      || typeof item.category !== 'string'
      || !OBSERVATION_CATEGORIES.has(item.category)
      || typeof item.observation !== 'string'
      || !item.observation.trim()
      || item.observation.length > 400
      || !['low', 'moderate', 'high'].includes(String(item.confidence))) {
      throw new ApiError(502, 'analysis-invalid-response', 'The analysis provider returned an unsupported observation.');
    }
    return {
      category: item.category as SkinObservation['category'],
      observation: item.observation,
      confidence: item.confidence as SkinObservation['confidence'],
    };
  });
  return { imageQuality: value.imageQuality as SkinObservations['imageQuality'], summary: value.summary, observations };
}

async function analyzeWithGemini(env: Env, file: File): Promise<SkinObservations> {
  const apiKey = required(env.GEMINI_API_KEY, 'Gemini');
  const content = new Uint8Array(await file.arrayBuffer());
  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Provide cautious, non-diagnostic observations of visible skin features only. Do not identify the person or infer age, ethnicity, gender, health conditions, or any protected or sensitive trait. Do not diagnose or recommend medical treatment. Lighting, filters, and camera quality can affect observations. Return JSON with imageQuality (clear or limited), summary (string), and observations (array of {category, observation, confidence}). Categories may only be visible-shine, apparent-dryness, uneven-looking-tone, visible-blemishes, general-texture. Confidence must be low, moderate, or high. If the face or skin is not clearly visible, set imageQuality to limited, say why in the summary, and return no observations.' },
            { inline_data: { mime_type: file.type, data: base64(content) } },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch {
    throw new ApiError(503, 'analysis-provider-unavailable', 'The analysis provider could not be reached. Please retry.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'analysis-provider-unavailable', 'The analysis provider is temporarily unavailable. Please retry.');
  }
  const payload = await readJson(response);
  const candidates = isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0];
  const responseContent = isRecord(firstCandidate) && isRecord(firstCandidate.content) ? firstCandidate.content : null;
  const parts = responseContent && Array.isArray(responseContent.parts) ? responseContent.parts : [];
  const firstPart = parts[0];
  if (!isRecord(firstPart) || typeof firstPart.text !== 'string') {
    throw new ApiError(502, 'analysis-invalid-response', 'The analysis provider returned no usable observations.');
  }
  return parseModelResult(firstPart.text);
}

function parseRoutineResult(text: string): RoutineGuidance {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'routine-invalid-response', 'The routine service returned an unreadable response.');
  }
  if (!isRecord(value)) throw new ApiError(502, 'routine-invalid-response', 'The routine service returned an unsupported response.');
  const readList = (key: keyof RoutineGuidance, max: number): string[] => {
    const list = value[key];
    if (!Array.isArray(list) || list.length > max || list.some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 240)) {
      throw new ApiError(502, 'routine-invalid-response', 'The routine service returned unsupported guidance.');
    }
    return list as string[];
  };
  const result = {
    morningRoutine: readList('morningRoutine', 8),
    eveningRoutine: readList('eveningRoutine', 8),
    precautions: readList('precautions', 8),
  };
  if (!result.morningRoutine.length || !result.eveningRoutine.length) {
    throw new ApiError(502, 'routine-invalid-response', 'The routine service returned incomplete guidance.');
  }
  return result;
}

async function generateRoutineWithGroq(env: Env, observations: SkinObservations): Promise<RoutineGuidance> {
  const apiKey = required(env.GROQ_API_KEY, 'Groq');
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0.2,
        max_completion_tokens: 1800,
        messages: [
          { role: 'system', content: 'Create cautious general cosmetic skincare guidance from the provided non-diagnostic visible observations only. Do not infer identity or protected traits; do not diagnose, treat disease, prescribe, promise results, or recommend brands. Give simple morning and evening routines, avoid strong actives or combinations unless observations support cautious general use, include sunscreen guidance in the morning, and list patch testing or professional-care precautions when appropriate. If image quality is limited, explain that recommendations are general and not tailored. Return only values matching the requested JSON schema.' },
          { role: 'user', content: JSON.stringify(observations) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'skinsnap_routine_guidance',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['morningRoutine', 'eveningRoutine', 'precautions'],
              properties: {
                morningRoutine: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                eveningRoutine: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
                precautions: { type: 'array', maxItems: 8, items: { type: 'string' } },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ApiError(503, 'routine-provider-unavailable', 'The routine service could not be reached. Please retry.');
  }
  if (!response.ok) throw new ApiError(503, 'routine-provider-unavailable', 'The routine service is temporarily unavailable. Please retry.');
  const payload = await readJson(response);
  const choices = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : [];
  const message = isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message : null;
  if (!message || typeof message.content !== 'string') {
    throw new ApiError(502, 'routine-invalid-response', 'The routine service returned no usable guidance.');
  }
  return parseRoutineResult(message.content);
}

async function getStoredAnalysis(env: Env, userId: string, idempotencyKey: string): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({
    select: 'status,result',
    user_id: `eq.${userId}`,
    idempotency_key: `eq.${idempotencyKey}`,
    limit: '1',
  });
  const response = await databaseRequest(env, `analysis_history?${query.toString()}`);
  const rows: unknown = await readJson(response);
  return Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : null;
}

async function reserveAnalysis(env: Env, userId: string, idempotencyKey: string): Promise<'reserved' | 'existing' | 'limited' | 'retry-limited'> {
  const response = await databaseRequest(env, 'rpc/reserve_skinsnap_analysis', {
    method: 'POST',
    body: JSON.stringify({
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_monthly_limit: MONTHLY_ANALYSIS_LIMIT,
    }),
  });
  const result: unknown = await readJson(response);
  if (result === 'reserved' || result === 'existing' || result === 'limited' || result === 'retry-limited') return result;
  throw new ApiError(503, 'analysis-reservation-failed', 'Could not reserve an analysis request safely.');
}

async function updateAnalysis(env: Env, userId: string, idempotencyKey: string, result: AnalysisResult): Promise<void> {
  const query = new URLSearchParams({ user_id: `eq.${userId}`, idempotency_key: `eq.${idempotencyKey}` });
  await databaseRequest(env, `analysis_history?${query.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'complete', result, completed_at: result.createdAt }),
  });
}

async function markAnalysisFailed(env: Env, userId: string, idempotencyKey: string): Promise<void> {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    idempotency_key: `eq.${idempotencyKey}`,
    status: 'eq.processing',
  });
  await databaseRequest(env, `analysis_history?${query.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'failed' }),
  });
}

async function handleAnalysis(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new ApiError(400, 'invalid-idempotency-key', 'A valid Idempotency-Key is required.');
  }
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_ANALYSIS_PHOTO_BYTES + 256 * 1024) {
    throw new ApiError(413, 'photo-too-large', 'The prepared image is too large. Choose a smaller image or retake the photo.');
  }
  await verifyPremium(env, user.id);
  required(env.GEMINI_API_KEY, 'Gemini');
  required(env.GROQ_API_KEY, 'Groq');
  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiError(400, 'invalid-photo', 'Send a JPEG, PNG, or WebP photo.');
  }
  if (!file.size || file.size > MAX_ANALYSIS_PHOTO_BYTES) {
    throw new ApiError(413, 'photo-too-large', 'The prepared image is too large. Choose a smaller image or retake the photo.');
  }
  const reservation = await reserveAnalysis(env, user.id, idempotencyKey);
  if (reservation === 'limited') {
    throw new ApiError(429, 'rate-limited', 'You have reached the current analysis limit. Try again later.');
  }
  if (reservation === 'retry-limited') {
    throw new ApiError(409, 'analysis-retry-limit', 'This request has used its retry limit. Start a new scan to try again.');
  }
  if (reservation === 'existing') {
    const conflict = await getStoredAnalysis(env, user.id, idempotencyKey);
    if (conflict?.status === 'complete' && isRecord(conflict.result)) return json(conflict.result);
    throw new ApiError(409, 'request-in-progress', 'This analysis request was already received and is still being processed.');
  }
  try {
    const observations = await analyzeWithGemini(env, file);
    const routine = await generateRoutineWithGroq(env, observations);
    const result: AnalysisResult = {
      ...observations,
      ...routine,
      resultId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await updateAnalysis(env, user.id, idempotencyKey, result);
    return json(result, 201);
  } catch (error) {
    try {
      await markAnalysisFailed(env, user.id, idempotencyKey);
    } catch (failureError) {
      console.error(
        'SkinSnap could not release the failed analysis reservation',
        failureError instanceof Error ? failureError.name : 'unknown error',
      );
    }
    throw error;
  }
}

async function handleHistory(env: Env, userId: string, url: URL): Promise<Response> {
  const requestedLimit = Number(url.searchParams.get('limit') ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 30;
  const query = new URLSearchParams({
    select: 'result,created_at',
    user_id: `eq.${userId}`,
    status: 'eq.complete',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const response = await databaseRequest(env, `analysis_history?${query.toString()}`);
  const rows: unknown = await readJson(response);
  if (!Array.isArray(rows)) throw new ApiError(502, 'history-invalid-response', 'Could not read analysis history.');
  return json({ items: rows.flatMap((row) => isRecord(row) && isRecord(row.result) ? [row.result] : []) });
}

async function getUserRecord(env: Env, table: 'routines' | 'progress_snapshots', userId: string): Promise<Response> {
  const query = new URLSearchParams({ select: 'data,updated_at', user_id: `eq.${userId}`, limit: '1' });
  const response = await databaseRequest(env, `${table}?${query.toString()}`);
  const rows: unknown = await readJson(response);
  return json(Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : { data: null });
}

async function getProfile(env: Env, userId: string): Promise<Response> {
  const query = new URLSearchParams({ select: 'id,display_name,created_at,updated_at', id: `eq.${userId}`, limit: '1' });
  const response = await databaseRequest(env, `profiles?${query.toString()}`);
  const rows: unknown = await readJson(response);
  return json(Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : { id: userId, display_name: null });
}

async function updateProfile(request: Request, env: Env, userId: string): Promise<Response> {
  const payload = await readJson(request);
  if (!isRecord(payload) || (payload.displayName !== null && typeof payload.displayName !== 'string')) {
    throw new ApiError(400, 'invalid-request', 'displayName must be a string or null.');
  }
  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : null;
  if (displayName && displayName.length > 80) throw new ApiError(400, 'invalid-request', 'displayName must be 80 characters or fewer.');
  const query = new URLSearchParams({ id: `eq.${userId}` });
  const response = await databaseRequest(env, `profiles?${query.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ display_name: displayName, updated_at: new Date().toISOString() }),
  });
  const rows: unknown = await readJson(response);
  return json(Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : { id: userId, display_name: displayName });
}

async function saveUserRecord(request: Request, env: Env, table: 'routines' | 'progress_snapshots', userId: string): Promise<Response> {
  const payload = await readJson(request);
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new ApiError(400, 'invalid-request', 'A JSON data object is required.');
  }
  const response = await databaseRequest(env, `${table}?on_conflict=user_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ user_id: userId, data: payload.data, updated_at: new Date().toISOString() }),
  });
  const rows: unknown = await readJson(response);
  return json(Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : { ok: true });
}

async function deleteAccount(env: Env, userId: string): Promise<Response> {
  const key = required(env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase server access');
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl(env)}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch {
    throw new ApiError(503, 'account-deletion-unavailable', 'Account deletion is temporarily unavailable. Please retry.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'account-deletion-unavailable', 'Account deletion could not be completed. Please retry.');
  }
  return json({ deleted: true });
}

async function claimDownsell(request: Request, env: Env, userId: string): Promise<Response> {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new ApiError(400, 'invalid-idempotency-key', 'A valid Idempotency-Key is required.');
  }
  if (await hasPremiumEntitlement(env, userId)) {
    throw new ApiError(409, 'offer-not-eligible', 'The exclusive offer is only available to unsubscribed accounts.');
  }
  const query = new URLSearchParams({ select: 'claim_id,idempotency_key,status', user_id: `eq.${userId}`, limit: '1' });
  const existing = await databaseRequest(env, `downsell_offer_claims?${query.toString()}`);
  const rows: unknown = await readJson(existing);
  if (Array.isArray(rows) && isRecord(rows[0])) {
    const record = rows[0];
    if (record.idempotency_key === idempotencyKey && record.status === 'claimed' && typeof record.claim_id === 'string') {
      return json({ eligible: true, claimId: record.claim_id, productIdentifier: 'skinsnap_yearly_downsell' });
    }
    throw new ApiError(409, 'offer-already-used', 'This one-time offer has already been shown to this account.');
  }

  const claimId = crypto.randomUUID();
  const created = await databaseRequest(env, 'downsell_offer_claims', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, claim_id: claimId, status: 'claimed', idempotency_key: idempotencyKey }),
  });
  if (!created.ok) {
    const raced = await databaseRequest(env, `downsell_offer_claims?${query.toString()}`);
    const racedRows: unknown = await readJson(raced);
    if (Array.isArray(racedRows) && isRecord(racedRows[0])
      && racedRows[0].idempotency_key === idempotencyKey
      && racedRows[0].status === 'claimed'
      && typeof racedRows[0].claim_id === 'string') {
      return json({ eligible: true, claimId: racedRows[0].claim_id, productIdentifier: 'skinsnap_yearly_downsell' });
    }
    throw new ApiError(409, 'offer-already-used', 'This one-time offer has already been shown to this account.');
  }
  return json({ eligible: true, claimId, productIdentifier: 'skinsnap_yearly_downsell' }, 201);
}

async function dismissDownsell(request: Request, env: Env, userId: string): Promise<Response> {
  const payload = await readJson(request);
  if (!isRecord(payload) || typeof payload.claimId !== 'string' || !payload.claimId) {
    throw new ApiError(400, 'invalid-request', 'A valid claimId is required.');
  }
  const lookup = new URLSearchParams({
    select: 'status',
    user_id: `eq.${userId}`,
    claim_id: `eq.${payload.claimId}`,
    limit: '1',
  });
  const current = await databaseRequest(env, `downsell_offer_claims?${lookup.toString()}`);
  const rows: unknown = await readJson(current);
  if (!Array.isArray(rows) || !isRecord(rows[0])) {
    throw new ApiError(404, 'claim-not-found', 'This exclusive offer claim was not found for your account.');
  }
  if (rows[0].status === 'dismissed') return json({ dismissed: true });
  if (rows[0].status !== 'claimed') throw new ApiError(409, 'claim-not-active', 'This exclusive offer is no longer active.');
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    claim_id: `eq.${payload.claimId}`,
    status: 'eq.claimed',
  });
  await databaseRequest(env, `downsell_offer_claims?${query.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'dismissed', dismissed_at: new Date().toISOString() }),
  });
  return json({ dismissed: true });
}

function applyCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowedOrigins.includes(origin)) throw new ApiError(403, 'origin-not-allowed', 'This app origin is not allowed.');
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) {
    throw new ApiError(403, 'origin-not-allowed', 'This app origin is not allowed.');
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '86400',
        ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      },
    });
  }
  if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok', service: 'skinsnap-api' });
  if (url.pathname === '/v1/session' && request.method === 'GET') {
    const user = await authenticate(request, env);
    return json({ userId: user.id, revenueCatAppUserId: user.id });
  }

  const user = await authenticate(request, env);
  if (url.pathname === '/v1/profile' && request.method === 'GET') return getProfile(env, user.id);
  if (url.pathname === '/v1/profile' && request.method === 'PATCH') return updateProfile(request, env, user.id);
  if (url.pathname === '/v1/subscriptions/yearly-downsell/claim' && request.method === 'POST') return claimDownsell(request, env, user.id);
  if (url.pathname === '/v1/subscriptions/yearly-downsell/dismiss' && request.method === 'POST') return dismissDownsell(request, env, user.id);
  if (url.pathname === '/v1/analysis' && request.method === 'POST') return handleAnalysis(request, env, user);
  if (url.pathname === '/v1/history' && request.method === 'GET') return handleHistory(env, user.id, url);
  if (url.pathname === '/v1/routine' && request.method === 'GET') return getUserRecord(env, 'routines', user.id);
  if (url.pathname === '/v1/routine' && request.method === 'PUT') return saveUserRecord(request, env, 'routines', user.id);
  if (url.pathname === '/v1/progress' && request.method === 'GET') return getUserRecord(env, 'progress_snapshots', user.id);
  if (url.pathname === '/v1/progress' && request.method === 'PUT') return saveUserRecord(request, env, 'progress_snapshots', user.id);
  if (url.pathname === '/v1/account' && request.method === 'DELETE') return deleteAccount(env, user.id);
  return json({ error: 'not-found', message: 'This API endpoint does not exist.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      if (error instanceof ApiError) {
        response = json({ error: error.code, message: error.message }, error.status);
      } else {
        console.error('SkinSnap API request failed', error instanceof Error ? error.name : 'unknown error');
        response = json({ error: 'internal-error', message: 'The request could not be completed. Please retry.' }, 500);
      }
    }
    try {
      return applyCors(request, env, response);
    } catch (error) {
      const corsError = error instanceof ApiError ? error : new ApiError(500, 'internal-error', 'The request could not be completed.');
      return json({ error: corsError.code, message: corsError.message }, corsError.status);
    }
  },
};
