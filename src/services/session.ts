import * as SecureStore from 'expo-secure-store';
import { getRevenueCatAppUserId, isRevenueCatConfiguredForPlatform, logInRevenueCatUser, logOutRevenueCatUser } from './billing';

const SESSION_TOKEN_KEY = 'skinsnap-auth-session-token';
const SESSION_REFRESH_TOKEN_KEY = 'skinsnap-auth-refresh-token';
const SESSION_EXPIRY_KEY = 'skinsnap-auth-expires-at';

export async function getSessionToken(): Promise<string | null> {
  const accessToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  const expiryValue = await SecureStore.getItemAsync(SESSION_EXPIRY_KEY);
  const expiresAt = Number(expiryValue);
  if (!accessToken || !Number.isFinite(expiresAt) || Date.now() + 60_000 < expiresAt) return accessToken;

  const refreshToken = await SecureStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY);
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!refreshToken || !baseUrl?.startsWith('https://') || !anonKey) return accessToken;

  try {
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return accessToken;
    const refreshed: unknown = await response.json();
    if (!refreshed || typeof refreshed !== 'object' || Array.isArray(refreshed)) return accessToken;
    const values = refreshed as Record<string, unknown>;
    if (typeof values.access_token !== 'string' || typeof values.refresh_token !== 'string') return accessToken;
    const nextExpiry = Date.now() + (typeof values.expires_in === 'number' ? values.expires_in : 3600) * 1000;
    await Promise.all([
      SecureStore.setItemAsync(SESSION_TOKEN_KEY, values.access_token),
      SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, values.refresh_token),
      SecureStore.setItemAsync(SESSION_EXPIRY_KEY, String(nextExpiry)),
    ]);
    return values.access_token;
  } catch {
    return accessToken;
  }
}

export type SessionCheck =
  | { valid: true }
  | { valid: false; reason: 'missing' | 'backend-unavailable' | 'expired' | 'identity-mismatch' };

export async function verifyAuthenticatedSession(): Promise<SessionCheck> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const token = await getSessionToken();
  if (!token) return { valid: false, reason: 'missing' };
  if (!baseUrl?.startsWith('https://')) return { valid: false, reason: 'backend-unavailable' };

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) return { valid: false, reason: 'expired' };
    if (!response.ok) return { valid: false, reason: 'backend-unavailable' };
    const session: unknown = await response.json();
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      return { valid: false, reason: 'backend-unavailable' };
    }
    const revenueCatAppUserId = (session as Record<string, unknown>).revenueCatAppUserId;
    if (typeof revenueCatAppUserId !== 'string' || !revenueCatAppUserId) {
      return { valid: false, reason: 'backend-unavailable' };
    }
    if (isRevenueCatConfiguredForPlatform() && await getRevenueCatAppUserId() !== revenueCatAppUserId) {
      return { valid: false, reason: 'identity-mismatch' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'backend-unavailable' };
  }
}

export async function saveAuthenticatedSession(
  token: string,
  revenueCatAppUserId: string,
  refreshToken?: string,
  expiresAt?: number,
): Promise<void> {
  if (!token.trim()) throw new Error('A non-empty authenticated session token is required.');
  await logInRevenueCatUser(revenueCatAppUserId);
  await Promise.all([
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),
    refreshToken
      ? SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, refreshToken, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      })
      : SecureStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
    expiresAt
      ? SecureStore.setItemAsync(SESSION_EXPIRY_KEY, String(expiresAt))
      : SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
  ]);
}

export async function clearSessionToken(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
    logOutRevenueCatUser(),
  ]);
}
