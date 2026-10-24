import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isExpectedBackendIdentity,
  parseAnonymousAuthResponse,
  requestAnonymousAuthSession,
  verifyAnonymousBackendIdentity,
  AnonymousAuthError,
} from '../src/anonymousAuth.ts';

const userId = '12345678-1234-1234-1234-123456789abc';
const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  user: { id: userId, is_anonymous: true },
};

test('anonymous auth accepts only a valid Supabase anonymous session', () => {
  assert.deepEqual(parseAnonymousAuthResponse(session), {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 3600,
    userId,
  });
  assert.equal(parseAnonymousAuthResponse({ ...session, user: { ...session.user, is_anonymous: false } }), null);
  assert.equal(parseAnonymousAuthResponse({ ...session, user: { ...session.user, id: 'another-user' } }), null);
});

test('guest provisioning sends no user ID and maps only safe provider failure categories', async () => {
  const requests = [];
  const created = await requestAnonymousAuthSession(
    'https://project.supabase.co',
    'public-test-key',
    async (url, init) => {
      requests.push({ url, init });
      return Response.json(session);
    },
  );
  assert.equal(created.userId, userId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://project.supabase.co/auth/v1/signup');
  assert.deepEqual(JSON.parse(requests[0].init.body), { data: {} });
  assert.equal(requests[0].init.method, 'POST');

  await assert.rejects(
    requestAnonymousAuthSession('https://project.supabase.co', 'public-test-key', async () =>
      new Response(JSON.stringify({ message: 'Anonymous sign-ins are disabled' }), { status: 400 })),
    (error) => error instanceof AnonymousAuthError && error.reason === 'anonymous-auth-disabled',
  );
  await assert.rejects(
    requestAnonymousAuthSession('https://project.supabase.co', 'public-test-key', async () =>
      new Response('{}', { status: 429 })),
    (error) => error instanceof AnonymousAuthError && error.reason === 'rate-limited',
  );
});

test('guest auth rejects insecure configuration and non-anonymous identity responses', async () => {
  let calls = 0;
  await assert.rejects(
    requestAnonymousAuthSession('http://project.supabase.co', 'public-test-key', async () => {
      calls++;
      return Response.json(session);
    }),
    (error) => error instanceof AnonymousAuthError && error.reason === 'configuration',
  );
  assert.equal(calls, 0);
  assert.equal(isExpectedBackendIdentity({ userId, revenueCatAppUserId: userId }, userId), true);
  assert.equal(isExpectedBackendIdentity({ userId: 'other-user', revenueCatAppUserId: userId }, userId), false);
  assert.equal(isExpectedBackendIdentity({ userId, revenueCatAppUserId: 'other-user' }, userId), false);
});

test('guest identity is checked by the authenticated Worker before use', async () => {
  let request;
  await verifyAnonymousBackendIdentity('https://api.test', 'test-token', userId, async (url, init) => {
    request = { url, init };
    return Response.json({ userId, revenueCatAppUserId: userId });
  });
  assert.equal(request.url, 'https://api.test/v1/session');
  assert.equal(request.init.headers.Authorization, 'Bearer test-token');

  await assert.rejects(
    verifyAnonymousBackendIdentity('https://api.test', 'test-token', userId, async () =>
      Response.json({ userId: 'other-user', revenueCatAppUserId: 'other-user' })),
    (error) => error instanceof AnonymousAuthError && error.reason === 'invalid-response',
  );
});
