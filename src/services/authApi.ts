import { clearSessionToken, ensureAuthenticatedSession, getSessionToken, saveAuthenticatedSession, sessionFailureMessage } from './session';
import { parseAnalysisResult, type SkinAnalysisResult } from './analysisApi';
import { deleteRoutineProgress } from '../routineStorage';

export class AuthApiError extends Error {
  constructor(message: string, readonly accountDeleted = false) {
    super(message);
    this.name = 'AuthApiError';
  }
}

type AuthMode = 'sign-in' | 'sign-up';

function config() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!supabaseUrl?.startsWith('https://') || !anonKey || !apiUrl?.startsWith('https://')) {
    throw new AuthApiError('Secure account sign-in is not configured in this build yet.');
  }
  return { supabaseUrl, anonKey, apiUrl };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (typeof record.msg === 'string') return record.msg;
      if (typeof record.message === 'string') return record.message;
      if (typeof record.error_description === 'string') return record.error_description;
    }
  } catch {
    return 'The account service returned an unreadable response.';
  }
  return 'The account service could not complete this request.';
}

export async function authenticateWithEmail(
  mode: AuthMode,
  email: string,
  password: string,
): Promise<{ confirmationRequired: boolean }> {
  const { supabaseUrl, anonKey, apiUrl } = config();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) throw new AuthApiError('Enter your email and password to continue.');

  const endpoint = mode === 'sign-in'
    ? `${supabaseUrl}/auth/v1/token?grant_type=password`
    : `${supabaseUrl}/auth/v1/signup`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      signal: AbortSignal.timeout(20000),
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
  } catch {
    throw new AuthApiError('Could not reach the account service. Check your connection and retry.');
  }
  if (!response.ok) throw new AuthApiError(await readErrorMessage(response));

  const session: unknown = await response.json();
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    throw new AuthApiError('The account service returned an invalid sign-in response.');
  }
  const values = session as Record<string, unknown>;
  if (typeof values.access_token !== 'string' || typeof values.refresh_token !== 'string') {
    if (mode === 'sign-up') return { confirmationRequired: true };
    throw new AuthApiError('The account service did not return a valid session.');
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${apiUrl}/v1/session`, {
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${values.access_token}` },
    });
  } catch {
    throw new AuthApiError('Could not verify the new session with SkinSnap. Check the secure API and retry.');
  }
  if (!backendResponse.ok) {
    throw new AuthApiError('The secure SkinSnap account service could not verify this session.');
  }
  const backendSession: unknown = await backendResponse.json();
  const revenueCatAppUserId = backendSession && typeof backendSession === 'object' && !Array.isArray(backendSession)
    ? (backendSession as Record<string, unknown>).revenueCatAppUserId
    : null;
  if (typeof revenueCatAppUserId !== 'string' || !revenueCatAppUserId) {
    throw new AuthApiError('The secure SkinSnap account service returned an invalid account identity.');
  }
  const expiresAt = Date.now() + (typeof values.expires_in === 'number' ? values.expires_in : 3600) * 1000;
  try {
    await saveAuthenticatedSession(values.access_token, revenueCatAppUserId, values.refresh_token, expiresAt);
  } catch {
    throw new AuthApiError('The account was verified, but this device could not securely save the sign-in.');
  }
  return { confirmationRequired: false };
}

export type AnalysisHistoryItem = SkinAnalysisResult;

export async function loadAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  const { apiUrl } = config();
  const session = await ensureAuthenticatedSession();
  if (!session.valid) throw new AuthApiError(sessionFailureMessage(session));
  const token = await getSessionToken();
  if (!token) throw new AuthApiError('A secure guest session is required to view saved analysis history.');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/history`, {
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthApiError('Could not reach analysis history. Check your connection and retry.');
  }
  if (response.status === 401) throw new AuthApiError('Your sign-in has expired. Sign in again to view your history.');
  if (!response.ok) throw new AuthApiError('Analysis history is temporarily unavailable. Please retry.');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray((payload as Record<string, unknown>).items)) {
    throw new AuthApiError('The history service returned an invalid response.');
  }
  return ((payload as { items: unknown[] }).items).map((item) => parseAnalysisResult(item, { savedHistory: true }));
}

export async function deleteAccountData(): Promise<void> {
  const { apiUrl } = config();
  const token = await getSessionToken();
  if (!token) throw new AuthApiError('Sign in before deleting your account.');
  let accountId: string;
  let identityResponse: Response;
  try {
    identityResponse = await fetch(`${apiUrl}/v1/session`, {
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: ['Bearer ', token].join('') },
    });
  } catch {
    throw new AuthApiError('Could not verify your account before deletion. Your account was not deleted; retry when online.');
  }
  if (!identityResponse.ok) throw new AuthApiError('Your account could not be verified before deletion. Your account was not deleted; sign in again and retry.');
  try {
    const identity: unknown = await identityResponse.json();
    const id = identity && typeof identity === 'object' && !Array.isArray(identity)
      ? (identity as Record<string, unknown>).userId
      : null;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('invalid-identity');
    accountId = id;
  } catch {
    throw new AuthApiError('The account service returned an invalid identity. Your account was not deleted; retry later.');
  }
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/account`, {
      signal: AbortSignal.timeout(20000),
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthApiError('The deletion response could not be received. Some or all data may already have been deleted. Retry when online; do not assume your data is unchanged.');
  }
  if (!response.ok) throw new AuthApiError('Account deletion is not confirmed. Some data may already have been removed; retry deletion to finish.');
  try {
    await deleteRoutineProgress(accountId);
  } catch {
    let sessionClearFailed = false;
    try {
      await clearSessionToken();
    } catch {
      sessionClearFailed = true;
    }
    throw new AuthApiError(
      `The server deleted your account, but this device could not remove its saved routine progress.${sessionClearFailed ? ' It also could not clear the local sign-in; remove the app data before sharing this device.' : ' Clear SkinSnap app storage before sharing this device.'}`,
      true,
    );
  }
  try {
    await clearSessionToken();
  } catch {
    throw new AuthApiError('Your account was deleted, but this device could not clear its local sign-in. Remove the app data before sharing this device.', true);
  }
}

export async function signOut(): Promise<void> {
  const { supabaseUrl, anonKey } = config();
  const token = await getSessionToken();
  if (!token) return;
  let response: Response | null = null;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/logout`, {
      signal: AbortSignal.timeout(20000),
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
  } catch {
    await clearSessionToken();
    throw new AuthApiError('This device signed out, but the server could not revoke the session. Sign in again only on a trusted device.');
  }
  await clearSessionToken();
  if (!response.ok) throw new AuthApiError('This device signed out, but the server could not revoke the session. Sign in again only on a trusted device.');
}
