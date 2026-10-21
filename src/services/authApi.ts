import { clearSessionToken, getSessionToken, saveAuthenticatedSession } from './session';
import { parseAnalysisResult, type SkinAnalysisResult } from './analysisApi';

export class AuthApiError extends Error {
  constructor(message: string) {
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
  const token = await getSessionToken();
  if (!token) throw new AuthApiError('Sign in to view your saved analysis history.');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/history`, {
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
  return ((payload as { items: unknown[] }).items).map(parseAnalysisResult);
}

export async function deleteAccountData(): Promise<void> {
  const { apiUrl } = config();
  const token = await getSessionToken();
  if (!token) throw new AuthApiError('Sign in before deleting your account.');
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthApiError('Could not reach the account service. Your account was not deleted; retry when online.');
  }
  if (!response.ok) throw new AuthApiError('Account deletion could not be confirmed. Your account was not deleted; please retry.');
  try {
    await clearSessionToken();
  } catch {
    throw new AuthApiError('Your account was deleted, but this device could not clear its local sign-in. Remove the app data before sharing this device.');
  }
}

export async function signOut(): Promise<void> {
  const { supabaseUrl, anonKey } = config();
  const token = await getSessionToken();
  if (!token) return;
  let response: Response | null = null;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/logout`, {
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
