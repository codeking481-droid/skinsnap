import { ensureAuthenticatedSession, getSessionToken, sessionFailureMessage } from './session';

function apiUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value?.startsWith('https://') ? value.replace(/\/+$/, '') : null;
}

export async function getRoutineProgressOwner(): Promise<string | null> {
  const session = await ensureAuthenticatedSession();
  if (!session.valid) throw new Error(sessionFailureMessage(session));
  const token = await getSessionToken();
  if (!token) throw new Error('Your secure session could not be read for routine progress.');
  const baseUrl = apiUrl();
  if (!baseUrl) throw new Error('Your account could not be verified for routine progress.');
  const response = await fetch(`${baseUrl}/v1/session`, {
    headers: { Authorization: ['Bearer ', token].join('') },
  });
  if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to access routine progress.');
  if (!response.ok) throw new Error('Your account could not be verified for routine progress.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The account service returned an invalid identity.');
  }
  const userId = (value as Record<string, unknown>).userId;
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('The account service returned an invalid identity.');
  }
  return userId;
}
