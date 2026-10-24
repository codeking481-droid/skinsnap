export type AnonymousSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
};

export type AnonymousAuthFailure =
  | 'configuration'
  | 'anonymous-auth-disabled'
  | 'rate-limited'
  | 'backend-unavailable'
  | 'invalid-response';

export class AnonymousAuthError extends Error {
  readonly reason: AnonymousAuthFailure;

  constructor(reason: AnonymousAuthFailure) {
    super(reason === 'anonymous-auth-disabled'
      ? 'Guest access is not enabled for secure SkinSnap features yet. You can continue exploring without an account.'
      : reason === 'rate-limited'
        ? 'Too many guest sign-in attempts. Please wait a moment and try again.'
        : reason === 'configuration'
          ? 'Secure guest access is not configured in this build.'
          : reason === 'invalid-response'
            ? 'The secure account service returned an invalid guest session.'
            : 'The secure account service is unavailable. Please try again.');
    this.name = 'AnonymousAuthError';
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function secureBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function parseAnonymousAuthResponse(value: unknown): AnonymousSessionTokens | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const user = value.user;
  if (user.is_anonymous !== true
    || typeof user.id !== 'string'
    || !/^[0-9a-f-]{36}$/i.test(user.id)
    || typeof value.access_token !== 'string'
    || !value.access_token
    || typeof value.refresh_token !== 'string'
    || !value.refresh_token
    || (value.expires_in !== undefined && (typeof value.expires_in !== 'number' || value.expires_in <= 0))) {
    return null;
  }
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresIn: typeof value.expires_in === 'number' ? value.expires_in : 3600,
    userId: user.id,
  };
}

export function isExpectedBackendIdentity(value: unknown, expectedUserId: string): boolean {
  if (!isRecord(value)) return false;
  return value.userId === expectedUserId && value.revenueCatAppUserId === expectedUserId;
}

export async function verifyAnonymousBackendIdentity(
  apiUrlValue: string | undefined,
  accessToken: string,
  expectedUserId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const apiUrl = apiUrlValue ? secureBaseUrl(apiUrlValue) : null;
  if (!apiUrl) throw new AnonymousAuthError('configuration');
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetcher(`${apiUrl}/v1/session`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch {
    throw new AnonymousAuthError('backend-unavailable');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new AnonymousAuthError('backend-unavailable');
  let identity: unknown;
  try {
    identity = await response.json();
  } catch {
    throw new AnonymousAuthError('invalid-response');
  }
  if (!isExpectedBackendIdentity(identity, expectedUserId)) throw new AnonymousAuthError('invalid-response');
}

export async function requestAnonymousAuthSession(
  supabaseUrlValue: string | undefined,
  publishableKeyValue: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AnonymousSessionTokens> {
  const supabaseUrl = supabaseUrlValue ? secureBaseUrl(supabaseUrlValue) : null;
  const publishableKey = publishableKeyValue?.trim();
  if (!supabaseUrl || !publishableKey) throw new AnonymousAuthError('configuration');

  let authResponse: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    authResponse = await fetcher(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
      signal: controller.signal,
    });
  } catch {
    throw new AnonymousAuthError('backend-unavailable');
  } finally {
    clearTimeout(timeout);
  }
  if (!authResponse.ok) {
    if (authResponse.status === 429) throw new AnonymousAuthError('rate-limited');
    if ([400, 404, 422].includes(authResponse.status)) {
      let body = '';
      try {
        body = JSON.stringify(await authResponse.json()).toLowerCase();
      } catch {
        // Keep provider response details private and use only a narrow classification.
      }
      if (body.includes('anonymous') && (body.includes('disabled') || body.includes('not enabled'))) {
        throw new AnonymousAuthError('anonymous-auth-disabled');
      }
    }
    throw new AnonymousAuthError('backend-unavailable');
  }

  let tokens: AnonymousSessionTokens | null;
  try {
    tokens = parseAnonymousAuthResponse(await authResponse.json());
  } catch {
    tokens = null;
  }
  if (!tokens) throw new AnonymousAuthError('invalid-response');
  return tokens;
}
