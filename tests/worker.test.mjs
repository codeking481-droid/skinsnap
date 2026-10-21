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
