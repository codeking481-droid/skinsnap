import * as SecureStore from 'expo-secure-store';
import { getRevenueCatAppUserId, isRevenueCatConfiguredForPlatform, logInRevenueCatUser, logOutRevenueCatUser } from './billing';
import {
  AnonymousAuthError,
  requestAnonymousAuthSession,
  verifyAnonymousBackendIdentity,
} from '../anonymousAuth';

const SESSION_TOKEN_KEY = 'skinsnap-auth-session-token';
const SESSION_REFRESH_TOKEN_KEY = 'skinsnap-auth-refresh-token';
const SESSION_EXPIRY_KEY = 'skinsnap-auth-expires-at';
const SESSION_ANONYMOUS_KEY = 'skinsnap-auth-is-anonymous';
let anonymousSessionPromise: Promise<SessionCheck> | null = null;
let refreshPromise: Promise<string | null> | null = null;
let sessionGeneration = 0;
let storageWrites: Promise<void> = Promise.resolve();

function writeSession(action: () => Promise<void>): Promise<void> {
  const next = storageWrites.catch(() => undefined).then(action);
  storageWrites = next;
  return next;
}

export async function getSessionToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const pending = readOrRefreshSessionToken(sessionGeneration);
  refreshPromise = pending;
  try { return await pending; }
  finally { if (refreshPromise === pending) refreshPromise = null; }
}

async function readOrRefreshSessionToken(generation: number): Promise<string | null> {
  await storageWrites.catch(() => undefined);
  if (generation !== sessionGeneration) return null;
  const accessToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  const expiryValue = await SecureStore.getItemAsync(SESSION_EXPIRY_KEY);
  const expiresAt = Number(expiryValue);
  if (!accessToken || !Number.isFinite(expiresAt) || Date.now() + 60_000 < expiresAt) return generation === sessionGeneration ? accessToken : null;

  const refreshToken = await SecureStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY);
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!refreshToken || !baseUrl?.startsWith('https://') || !anonKey) return generation === sessionGeneration ? accessToken : null;

  try {
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return generation === sessionGeneration ? accessToken : null;
    const refreshed: unknown = await response.json();
    if (!refreshed || typeof refreshed !== 'object' || Array.isArray(refreshed)) return generation === sessionGeneration ? accessToken : null;
    const values = refreshed as Record<string, unknown>;
    if (typeof values.access_token !== 'string' || typeof values.refresh_token !== 'string') return generation === sessionGeneration ? accessToken : null;
    const nextExpiry = Date.now() + (typeof values.expires_in === 'number' ? values.expires_in : 3600) * 1000;
    if (generation !== sessionGeneration) return null;
    await writeSession(async () => {
      if (generation !== sessionGeneration) return;
      await Promise.all([
        SecureStore.setItemAsync(SESSION_TOKEN_KEY, values.access_token as string),
        SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, values.refresh_token as string),
        SecureStore.setItemAsync(SESSION_EXPIRY_KEY, String(nextExpiry)),
      ]);
    });
    return generation === sessionGeneration ? values.access_token : null;
  } catch {
    return generation === sessionGeneration ? accessToken : null;
  }
}

export type SessionCheck =
  | { valid: true; userId: string; revenueCatAppUserId: string; isAnonymous: boolean }
  | {
    valid: false;
    reason: 'missing' | 'backend-unavailable' | 'expired' | 'identity-mismatch'
      | 'configuration' | 'anonymous-auth-disabled' | 'rate-limited' | 'invalid-response';
    userId?: string;
    revenueCatAppUserId?: string;
  };
export type SessionFailureReason = Extract<SessionCheck, { valid: false }>['reason'];

export function sessionFailureMessage(session: Extract<SessionCheck, { valid: false }>): string {
  switch (session.reason) {
    case 'anonymous-auth-disabled':
      return 'Guest access for secure history and analysis is not enabled in the Supabase project yet. You can still use SkinSnap’s local features.';
    case 'rate-limited':
      return 'Too many guest sign-in attempts. Please wait a moment and try again.';
    case 'expired':
      return 'Your secure session expired. Sign in again; an unlinked guest profile may not be recoverable after reinstalling.';
    case 'identity-mismatch':
      return 'Your secure account and subscription identity do not match. No analysis was started; contact support or restore the correct account.';
    case 'configuration':
      return 'Secure guest access is not configured in this build.';
    case 'invalid-response':
      return 'The secure account service returned an invalid identity.';
    case 'missing':
      return 'A secure guest session could not be created. You can still use SkinSnap’s local features.';
    case 'backend-unavailable':
      return 'The secure account service is unavailable. Please try again.';
  }
}

export async function isAnonymousSession(): Promise<boolean> {
  return await SecureStore.getItemAsync(SESSION_ANONYMOUS_KEY) === 'true';
}

export async function verifyAuthenticatedSession(): Promise<SessionCheck> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const token = await getSessionToken();
  if (!token) return { valid: false, reason: 'missing' };
  if (!baseUrl?.startsWith('https://')) return { valid: false, reason: 'backend-unavailable' };

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/session`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) return { valid: false, reason: 'expired' };
    if (!response.ok) return { valid: false, reason: 'backend-unavailable' };
    const session: unknown = await response.json();
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      return { valid: false, reason: 'backend-unavailable' };
    }
    const sessionRecord = session as Record<string, unknown>;
    const userId = sessionRecord.userId;
    const revenueCatAppUserId = sessionRecord.revenueCatAppUserId;
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)
      || typeof revenueCatAppUserId !== 'string' || !revenueCatAppUserId) {
      return { valid: false, reason: 'backend-unavailable' };
    }
    if (isRevenueCatConfiguredForPlatform() && await getRevenueCatAppUserId() !== revenueCatAppUserId) {
      return { valid: false, reason: 'identity-mismatch', userId, revenueCatAppUserId };
    }
    return { valid: true, userId, revenueCatAppUserId, isAnonymous: await isAnonymousSession() };
  } catch {
    return { valid: false, reason: 'backend-unavailable' };
  }
}

export async function ensureAuthenticatedSession(): Promise<SessionCheck> {
  if (anonymousSessionPromise) return anonymousSessionPromise;
  anonymousSessionPromise = (async () => {
    const generation = sessionGeneration;
    const token = await getSessionToken();
    if (token) {
      const session = await verifyAuthenticatedSession();
      if (!session.valid && session.reason === 'identity-mismatch'
        && session.userId
        && session.revenueCatAppUserId
        && await isAnonymousSession()) {
        try {
          await logInRevenueCatUser(session.revenueCatAppUserId);
          return verifyAuthenticatedSession();
        } catch {
          return session;
        }
      }
      return session;
    }

    const refreshToken = await SecureStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY);
    if (refreshToken) return { valid: false, reason: 'expired' };

    let anonymous;
    try {
      anonymous = await requestAnonymousAuthSession(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      );
    } catch (error) {
      if (error instanceof AnonymousAuthError) return { valid: false, reason: error.reason };
      return { valid: false, reason: 'backend-unavailable' };
    }

    const expiresAt = Date.now() + anonymous.expiresIn * 1000;
    if (generation !== sessionGeneration) return { valid: false, reason: 'expired' };
    let savedGeneration: number;
    try {
      savedGeneration = await storeSessionTokens(
        anonymous.accessToken,
        anonymous.refreshToken,
        expiresAt,
        true,
      );
    } catch {
      return { valid: false, reason: 'backend-unavailable' };
    }
    try {
      if (savedGeneration !== sessionGeneration) return { valid: false, reason: 'expired' };
      await verifyAnonymousBackendIdentity(
        process.env.EXPO_PUBLIC_API_URL,
        anonymous.accessToken,
        anonymous.userId,
      );
    } catch (error) {
      if (error instanceof AnonymousAuthError) {
        if (error.reason === 'configuration' || error.reason === 'invalid-response') {
          return { valid: false, reason: error.reason };
        }
        return { valid: false, reason: 'backend-unavailable' };
      }
      return { valid: false, reason: 'backend-unavailable' };
    }

    try {
      await writeSession(async () => {
        if (savedGeneration !== sessionGeneration) throw new Error('Session changed.');
        await logInRevenueCatUser(anonymous.userId);
      });
    } catch {
      return { valid: false, reason: 'identity-mismatch', userId: anonymous.userId, revenueCatAppUserId: anonymous.userId };
    }
    return verifyAuthenticatedSession();
  })();
  try {
    return await anonymousSessionPromise;
  } finally {
    anonymousSessionPromise = null;
  }
}

async function storeSessionTokens(
  token: string,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
  isAnonymous: boolean,
): Promise<number> {
  sessionGeneration++;
  const generation = sessionGeneration;
  refreshPromise = null;
  await writeSession(async () => {
    if (generation !== sessionGeneration) return;
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    await Promise.all([
      refreshToken
        ? SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, refreshToken)
        : SecureStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
      expiresAt
        ? SecureStore.setItemAsync(SESSION_EXPIRY_KEY, String(expiresAt))
        : SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
      SecureStore.setItemAsync(SESSION_ANONYMOUS_KEY, isAnonymous ? 'true' : 'false'),
    ]);
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });
  return generation;
}

export async function saveAuthenticatedSession(
  token: string,
  revenueCatAppUserId: string,
  refreshToken?: string,
  expiresAt?: number,
  isAnonymous = false,
): Promise<void> {
  if (!token.trim()) throw new Error('A non-empty authenticated session token is required.');
  const generation = await storeSessionTokens(token, refreshToken, expiresAt, isAnonymous);
  await writeSession(async () => {
    if (generation !== sessionGeneration) throw new Error('Session changed before subscription identity was saved.');
    await logInRevenueCatUser(revenueCatAppUserId);
  });
}

export async function clearSessionToken(): Promise<void> {
  sessionGeneration++;
  refreshPromise = null;
  await writeSession(async () => { await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
    SecureStore.deleteItemAsync(SESSION_ANONYMOUS_KEY),
  ]); await logOutRevenueCatUser(); });
}
