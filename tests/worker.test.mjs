import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.ts';

test('health check is public, minimal, and does not require configured secrets', async () => {
  const response = await worker.fetch(new Request('https://skinsnap.test/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'skinsnap-api' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('history requires a bearer-authenticated session', async () => {
  const response = await worker.fetch(new Request('https://skinsnap.test/v1/history'), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'authentication-required');
});

test('browser origins are denied unless explicitly allowed', async () => {
  const response = await worker.fetch(new Request('https://skinsnap.test/health', {
    headers: { Origin: 'https://untrusted.example' },
  }), {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('configured browser preflight is answered without authentication', async () => {
  const origin = 'https://app.example';
  const response = await worker.fetch(new Request('https://skinsnap.test/v1/history', {
    method: 'OPTIONS',
    headers: { Origin: origin },
  }), { ALLOWED_ORIGINS: origin });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});

test('development analysis is disabled unless explicitly enabled', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'test-user' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-session' },
      body: new FormData(),
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'not-found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('development analysis rejects authenticated users outside the server allowlist', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'test-user' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-session' },
      body: new FormData(),
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_DEV_TEST_USER_ID: 'different-user',
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'development-test-not-authorized');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('allowlisted development analysis does not require RevenueCat entitlement', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ id: 'test-user' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-session', 'Idempotency-Key': 'dev-test-1' },
      body: new FormData(),
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_DEV_TEST_USER_ID: 'test-user',
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid-photo');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/auth\/v1\/user$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
