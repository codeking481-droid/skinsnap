import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.ts';

async function requestAnalysisWithOutputs(visionResult, groqResult = null, options = {}) {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const requests = [];
  const logs = [];
  let visionAttempt = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    let requestModel = null;
    try {
      requestModel = typeof init.body === 'string' ? JSON.parse(init.body).model ?? null : null;
    } catch {
      requestModel = null;
    }
    let requestBody = null;
    try {
      requestBody = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      requestBody = null;
    }
    requests.push({ url, method: init.method ?? 'GET', model: requestModel, body: requestBody });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'privacy-test-user' }), { status: 200 });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('reserved'), { status: 200 });
    }
    if (url.includes('api.groq.com') && requestModel === 'qwen/qwen3.8-27b') {
      const providerResponse = options.visionResponses?.[visionAttempt];
      visionAttempt += 1;
      if (providerResponse) return providerResponse;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(visionResult) } }],
      }), { status: 200 });
    }
    if (url.includes('api.groq.com')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(groqResult) } }],
      }), { status: 200 });
    }
    if (url.endsWith('/rest/v1/rpc/complete_skinsnap_analysis')) {
      return new Response(JSON.stringify('analysis-id'), { status: 200 });
    }
    if (url.includes('/rest/v1/analysis_jobs?') && init.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
  console.warn = (...args) => logs.push(args);
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'privacy-test.jpg', { type: 'image/jpeg' }));
    return await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis?client_request_id=vision-test-ref', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer privacy-test-token',
        'Idempotency-Key': 'privacy-output-test',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_DEV_TEST_USER_ID: 'privacy-test-user',
      GROQ_API_KEY: 'test-groq-key',
    }).then((response) => ({ response, requests, logs }));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
}

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

test('Supabase publishable and secret key names authenticate and access the database', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    if (String(input).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'test-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/profile', {
      headers: { Authorization: 'Bearer test-session' },
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, 'test-user');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.get('apikey'), 'test-publishable-key');
    assert.equal(requests[1].headers.get('apikey'), 'test-secret-key');
    assert.equal(requests[1].headers.get('authorization'), 'Bearer test-secret-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy Supabase anon and service-role key names remain supported', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push(new Headers(init?.headers));
    if (String(input).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'test-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/profile', {
      headers: { Authorization: 'Bearer test-session' },
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'legacy-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-key',
    });
    assert.equal(response.status, 200);
    assert.equal(requests[0].get('apikey'), 'legacy-anon-key');
    assert.equal(requests[1].get('apikey'), 'legacy-service-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('development analysis uses the live jobs schema and persists the result through the completion RPC', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'test-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('reserved'), { status: 200 });
    }
    if (url.includes('api.groq.com')) {
      const model = JSON.parse(init.body).model;
      if (model === 'qwen/qwen3.8-27b') {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            imageQuality: 'clear',
            summary: 'A clear image suitable for general observations.',
            observations: [{ category: 'general-texture', observation: 'Some visible texture.', confidence: 'low' }],
          }) } }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          morningRoutine: ['Use a gentle cleanser.', 'Apply sunscreen.'],
          eveningRoutine: ['Cleanse gently.', 'Apply moisturizer.'],
          precautions: ['Patch test new products.'],
        }) } }],
      }), { status: 200 });
    }
    if (url.endsWith('/rest/v1/rpc/complete_skinsnap_analysis')) {
      return new Response(JSON.stringify('analysis-id'), { status: 200 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'consented-test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session',
        'Idempotency-Key': 'test-analysis-1',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_DEV_TEST_USER_ID: 'test-user',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.imageQuality, 'clear');
    assert.equal(result.observations.length, 1);
    assert.equal(result.morningRoutine.length, 2);
    assert.equal(result.eveningRoutine.length, 2);
    const reservation = requests.find((request) => request.url.endsWith('/rpc/reserve_skinsnap_analysis'));
    assert.equal(JSON.parse(reservation.init.body).p_monthly_limit, 2);
    const completion = requests.find((request) => request.url.endsWith('/rpc/complete_skinsnap_analysis'));
    assert.ok(completion);
    assert.equal(JSON.parse(completion.init.body).p_user_id, 'test-user');
    assert.deepEqual(JSON.parse(completion.init.body).p_result, result);
    assert.equal(requests.filter((request) => request.url.includes('api.groq.com')).length, 2);
    assert.ok(!requests.some((request) => request.url.includes('/analysis_history')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('development quota rejection returns rate-limited before invoking either AI provider', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'test-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('limited'), { status: 200 });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'quota-test-1',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_DEV_TEST_USER_ID: 'test-user',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      error: 'rate-limited',
      message: 'You have reached the current analysis limit. Try again later.',
    });
    assert.ok(requests.some((url) => url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')));
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('only the exact server-allowlisted admin gets the configured finite development cap', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: adminUserId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('limited'), { status: 200 });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'admin-cap-test',
        'X-SkinSnap-Admin': 'true',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_ADMIN_TEST_USER_ID: adminUserId,
      AI_ADMIN_TEST_MONTHLY_LIMIT: '7',
      AI_DEV_TEST_USER_ID: 'other-dev-user',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, 'admin-test-cap-reached');
    const reservation = requests.find((request) => request.url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis'));
    assert.equal(JSON.parse(reservation.init.body).p_monthly_limit, 7);
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an invalid administrator cap fails closed before reserving or running analysis', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: adminUserId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'admin-invalid-cap-test',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_ADMIN_TEST_USER_ID: adminUserId,
      AI_ADMIN_TEST_MONTHLY_LIMIT: '101',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'admin-test-limit-misconfigured');
    assert.ok(!requests.some((url) => url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')));
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a non-admin cannot obtain the admin cap with a client-supplied admin flag', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'ordinary-dev-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('limited'), { status: 200 });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'ordinary-cap-test',
        'X-SkinSnap-Admin': 'true',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_ADMIN_TEST_USER_ID: 'different-admin-user',
      AI_ADMIN_TEST_MONTHLY_LIMIT: '7',
      AI_DEV_TEST_USER_ID: 'ordinary-dev-user',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, 'rate-limited');
    const reservation = requests.find((request) => request.url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis'));
    assert.equal(JSON.parse(reservation.init.body).p_monthly_limit, 2);
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an existing idempotency reservation returns the saved result without invoking AI again', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const savedResult = {
    resultId: 'saved-analysis',
    createdAt: '2026-10-22T00:00:00.000Z',
    imageQuality: 'clear',
    summary: 'Saved result.',
    observations: [],
    morningRoutine: ['Use a gentle cleanser.'],
    eveningRoutine: ['Use a gentle cleanser.'],
    precautions: [],
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'admin-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('existing'), { status: 200 });
    }
    if (url.includes('/rest/v1/analysis_jobs?')) {
      return new Response(JSON.stringify([{ status: 'completed', result: savedResult }]), { status: 200 });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/dev/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'same-analysis-key',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      AI_DEV_TEST_ENABLED: 'true',
      AI_ADMIN_TEST_USER_ID: 'admin-user',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), savedResult);
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
    assert.ok(!requests.some((url) => url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin identity does not bypass premium entitlement or production analysis limits', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'admin-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/v1/subscribers/')) {
      return new Response(JSON.stringify({
        subscriber: { entitlements: { skinsnap_premium: { expires_date: null } } },
      }), { status: 200 });
    }
    if (url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')) {
      return new Response(JSON.stringify('limited'), { status: 200 });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const form = new FormData();
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }));
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/analysis', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-session-token',
        'Idempotency-Key': 'admin-production-test',
      },
      body: form,
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
      REVENUECAT_SECRET_API_KEY: 'test-revenuecat-key',
      AI_ADMIN_TEST_USER_ID: 'admin-user',
      AI_ADMIN_TEST_MONTHLY_LIMIT: '7',
      GROQ_API_KEY: 'test-groq-key',
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, 'rate-limited');
    const reservation = requests.find((request) => request.url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis'));
    assert.equal(JSON.parse(reservation.init.body).p_monthly_limit, 20);
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
    assert.ok(!requests.some((request) => request.url.includes('api.groq.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('analysis history reads completed results from the live jobs table', async () => {
  const originalFetch = globalThis.fetch;
  let historyUrl = '';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'test-user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    historyUrl = url;
    return new Response(JSON.stringify([{ result: { resultId: 'analysis-1' } }]), { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/history', {
      headers: { Authorization: 'Bearer test-session' },
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ resultId: 'analysis-1' }] });
    assert.match(historyUrl, /\/rest\/v1\/analysis_jobs\?/);
    assert.match(historyUrl, /user_id=eq\.test-user/);
    assert.match(historyUrl, /status=eq\.completed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Groq vision receives the image and unsafe observations are rejected before routine generation', async () => {
  const { response, requests } = await requestAnalysisWithOutputs({
    imageQuality: 'clear',
    summary: 'This appears to be acne and should be diagnosed.',
    observations: [],
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'vision-invalid-response');
  const visionRequest = requests.find((request) => request.model === 'qwen/qwen3.8-27b');
  assert.ok(visionRequest);
  const imagePart = visionRequest.body.messages[0].content.find((part) => part.type === 'image_url');
  assert.equal(imagePart.image_url.url, 'data:image/jpeg;base64,AQID');
  assert.equal(requests.filter((request) => request.url.includes('api.groq.com')).length, 1);
  assert.ok(!requests.some((request) => request.url.endsWith('/rest/v1/rpc/complete_skinsnap_analysis')));
});

test('Groq vision retries one transient 503 inside a single quota reservation and logs only safe diagnostics', async () => {
  const { response, requests, logs } = await requestAnalysisWithOutputs({
    imageQuality: 'clear',
    summary: 'A clear photo for cautious cosmetic observations.',
    observations: [{ category: 'visible-shine', observation: 'Some visible shine.', confidence: 'low' }],
  }, {
    morningRoutine: ['Use a gentle cleanser.', 'Apply sunscreen.'],
    eveningRoutine: ['Use a gentle cleanser.'],
    precautions: [],
  }, {
    visionResponses: [
      new Response(JSON.stringify({
        error: {
          code: 503,
          message: 'private upstream detail must never be logged',
        },
      }), { status: 503 }),
    ],
  });
  assert.equal(response.status, 201);
  assert.equal(requests.filter((request) => request.model === 'qwen/qwen3.8-27b').length, 2);
  assert.equal(requests.filter((request) => request.url.endsWith('/rest/v1/rpc/reserve_skinsnap_analysis')).length, 1);
  assert.equal(requests.filter((request) => request.model === 'openai/gpt-oss-20b').length, 1);
  assert.equal(requests.filter((request) => request.url.includes('api.groq.com')).length, 3);
  assert.equal(logs.length, 1);
  const diagnostic = logs[0][1];
  assert.deepEqual(diagnostic, {
    provider: 'groq-vision',
    model: 'qwen/qwen3.8-27b',
    requestId: 'vision-test-ref',
    httpStatus: 503,
    category: 'temporarily-unavailable',
    timedOut: false,
    attempt: 1,
  });
  assert.ok(!JSON.stringify(logs).includes('test-groq-key'));
  assert.ok(!JSON.stringify(logs).includes('private upstream detail'));
});

test('Groq vision quota errors are classified and are not retried', async () => {
  const { response, requests, logs } = await requestAnalysisWithOutputs(null, null, {
    visionResponses: [
      new Response(JSON.stringify({
        error: { code: 429, message: 'private quota detail' },
      }), { status: 429 }),
    ],
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'vision-provider-quota-exhausted');
  assert.equal(requests.filter((request) => request.model === 'qwen/qwen3.8-27b').length, 1);
  assert.equal(requests.filter((request) => request.url.includes('api.groq.com')).length, 1);
  assert.equal(logs[0][1].category, 'quota-or-rate-limit');
  assert.equal(logs[0][1].httpStatus, 429);
  assert.ok(!JSON.stringify(logs).includes('private quota detail'));
});

test('Groq vision retries a short explicit rate limit without reserving another analysis', async () => {
  const { response, requests } = await requestAnalysisWithOutputs({
    imageQuality: 'clear', summary: 'A clear photo.', observations: [],
  }, {
    morningRoutine: ['Apply sunscreen.'], eveningRoutine: ['Cleanse gently.'], precautions: [],
  }, {
    visionResponses: [new Response('{}', { status: 429, headers: { 'Retry-After': '0.01' } })],
  });
  assert.equal(response.status, 201);
  const visionRequests = requests.filter(request => request.model === 'qwen/qwen3.8-27b');
  assert.equal(visionRequests.length, 2);
  assert.equal(visionRequests[0].body.reasoning_effort, 'none');
  assert.equal(requests.filter(request => request.url.endsWith('/rpc/reserve_skinsnap_analysis')).length, 1);
});

test('Groq vision preserves long rate-limit delays for the client without retrying', async () => {
  const { response, requests } = await requestAnalysisWithOutputs(null, null, {
    visionResponses: [new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })],
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(requests.filter(request => request.model === 'qwen/qwen3.8-27b').length, 1);
});

test('Groq vision permission errors are classified and are not retried', async () => {
  const { response, requests, logs } = await requestAnalysisWithOutputs(null, null, {
    visionResponses: [
      new Response(JSON.stringify({
        error: { code: 403, message: 'private permission detail' },
      }), { status: 403 }),
    ],
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'vision-provider-permission-denied');
  assert.equal(requests.filter((request) => request.model === 'qwen/qwen3.8-27b').length, 1);
  assert.equal(logs[0][1].category, 'key-or-permission');
});

test('Groq vision model errors are classified and are not retried', async () => {
  const { response, requests, logs } = await requestAnalysisWithOutputs(null, null, {
    visionResponses: [
      new Response(JSON.stringify({
        error: { code: 404, message: 'private model detail' },
      }), { status: 404 }),
    ],
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'vision-provider-model-unavailable');
  assert.equal(requests.filter((request) => request.model === 'qwen/qwen3.8-27b').length, 1);
  assert.equal(logs[0][1].category, 'model-or-endpoint-not-found');
  assert.equal(logs[0][1].model, 'qwen/qwen3.8-27b');
});

test('Groq vision does not wait or retry when Retry-After exceeds the bounded window', async () => {
  const { response, requests, logs } = await requestAnalysisWithOutputs(null, null, {
    visionResponses: [
      new Response(JSON.stringify({
        error: { code: 503, message: 'private retry detail' },
      }), { status: 503, headers: { 'Retry-After': '30' } }),
    ],
  });

  assert.equal(response.status, 503);
  assert.equal(requests.filter((request) => request.model === 'qwen/qwen3.8-27b').length, 1);
  assert.equal(logs[0][1].category, 'temporarily-unavailable');
});

test('unsafe Groq routine guidance is rejected before result persistence', async () => {
  const { response, requests } = await requestAnalysisWithOutputs({
    imageQuality: 'clear',
    summary: 'A clear photo for cautious cosmetic observations.',
    observations: [{ category: 'visible-blemishes', observation: 'Some visible blemishes.', confidence: 'low' }],
  }, {
    morningRoutine: ['Use a gentle cleanser.'],
    eveningRoutine: ['Use a prescription medication.'],
    precautions: [],
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'routine-invalid-response');
  assert.ok(requests.some((request) => request.url.includes('api.groq.com')));
  assert.ok(!requests.some((request) => request.url.endsWith('/rest/v1/rpc/complete_skinsnap_analysis')));
});

test('account deletion targets only the Supabase-authenticated user', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'authenticated-user' }), { status: 200 });
    }
    if (url.endsWith('/auth/v1/admin/users/authenticated-user')) {
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
  try {
    const response = await worker.fetch(new Request('https://skinsnap.test/v1/account?userId=other-user', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer account-test-token' },
    }), {
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_SECRET_KEY: 'test-secret-key',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.ok(urls.includes('https://supabase.test/auth/v1/admin/users/authenticated-user'));
    assert.ok(!urls.some((url) => url.includes('other-user')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
