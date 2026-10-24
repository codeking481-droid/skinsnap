import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

loadEnvFile(resolve('.env'));
loadEnvFile(resolve('.env.test.local'));

const projectRef = 'pehjmojhezldzcedzcxi';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const workerUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const disposableConfirmation = process.env.SKINSNAP_RETENTION_TEST_USERS_DISPOSABLE;

if (disposableConfirmation !== 'true') {
  console.error('Refusing production writes: set SKINSNAP_RETENTION_TEST_USERS_DISPOSABLE=true only for two disposable test accounts.');
  process.exit(2);
}
if (!supabaseUrl || new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`) {
  console.error('Refusing to test: configured Supabase project does not match the confirmed project.');
  process.exit(2);
}
if (!publishableKey || !workerUrl || !workerUrl.startsWith('https://')) {
  console.error('Refusing to test: required public Supabase or Worker configuration is missing.');
  process.exit(2);
}

const credentials = [
  { email: process.env.SKINSNAP_RETENTION_TEST_USER_A_EMAIL, password: process.env.SKINSNAP_RETENTION_TEST_USER_A_PASSWORD },
  { email: process.env.SKINSNAP_RETENTION_TEST_USER_B_EMAIL, password: process.env.SKINSNAP_RETENTION_TEST_USER_B_PASSWORD },
];
if (credentials.some(({ email, password }) => !email?.trim() || !password) || credentials[0].email === credentials[1].email) {
  console.error('Add two distinct disposable confirmed test-user email/password pairs to the ignored .env.test.local file.');
  process.exit(2);
}

const marker = randomUUID();
const date = new Date().toISOString().slice(0, 10);
const identities = [];
const results = [];
const base = supabaseUrl;

async function fetchJson(url, { method = 'GET', token, body, prefer } = {}) {
  const headers = { apikey: publishableKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

function check(passed, label) {
  results.push({ label, passed: Boolean(passed) });
  if (!passed) throw new Error(`Failed: ${label}`);
}

async function authenticateDisposableUser({ email, password }) {
  const { response, payload } = await fetchJson(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    body: { email: email.trim(), password },
  });
  if (!response.ok || typeof payload?.access_token !== 'string' || typeof payload?.user?.id !== 'string') {
    throw new Error(`Could not authenticate a disposable test user (HTTP ${response.status}, code ${payload?.code ?? payload?.error_code ?? 'unknown'}).`);
  }
  const identity = { id: payload.user.id, token: payload.access_token, deleted: false };
  identities.push(identity);
  return identity;
}

function tableCases(userId) {
  return [
    {
      table: 'skincare_preferences',
      conflict: 'user_id',
      row: { user_id: userId, data: { consent: true, preferences: { experience: 'beginner', testMarker: marker } }, updated_at: new Date().toISOString() },
      matches: data => data?.preferences?.testMarker === marker,
    },
    {
      table: 'routines',
      conflict: 'user_id',
      row: { user_id: userId, data: { testMarker: marker, steps: [] }, updated_at: new Date().toISOString() },
      matches: data => data?.testMarker === marker,
    },
    {
      table: 'skin_diary_entries',
      conflict: 'user_id,entry_date',
      row: { user_id: userId, entry_date: date, data: { date, timeZone: 'UTC', note: `SkinSnap disposable retention test ${marker}`, products: '', morningCompleted: false, eveningCompleted: false, concerns: [] }, updated_at: new Date().toISOString() },
      matches: data => data?.note === `SkinSnap disposable retention test ${marker}`,
    },
  ];
}

async function readRows(table, userId, token) {
  return fetchJson(`${base}/rest/v1/${table}?select=user_id,data&user_id=eq.${encodeURIComponent(userId)}`, { token });
}

async function verifyTable(test, a, b) {
  const aCase = tableCases(a.id).find(item => item.table === test.table);
  const bCase = tableCases(b.id).find(item => item.table === test.table);
  for (const [identity, item, label] of [[a, aCase, 'a'], [b, bCase, 'b']]) {
    const { response } = await fetchJson(`${base}/rest/v1/${test.table}?on_conflict=${test.conflict}`, {
      method: 'POST', token: identity.token, body: item.row,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    check(response.status === 200 || response.status === 201, `${test.table}:user-${label}-upsert`);
  }

  for (const [identity, label] of [[a, 'a'], [b, 'b']]) {
    const { response, payload } = await readRows(test.table, identity.id, identity.token);
    check(response.ok && Array.isArray(payload) && payload.length === 1, `${test.table}:user-${label}-reads-own-row`);
  }

  for (const [identity, other, label] of [[a, b, 'a'], [b, a, 'b']]) {
    const { response, payload } = await readRows(test.table, other.id, identity.token);
    check(response.ok && Array.isArray(payload) && payload.length === 0, `${test.table}:user-${label}-cannot-read-other`);
  }

  for (const [method, label] of [['PATCH', 'update'], ['DELETE', 'delete']]) {
    const options = method === 'PATCH'
      ? { method, token: b.token, body: { data: { testMarker: `attack-${marker}` } }, prefer: 'return=representation' }
      : { method, token: b.token, prefer: 'return=representation' };
    const { response, payload } = await fetchJson(
      `${base}/rest/v1/${test.table}?user_id=eq.${encodeURIComponent(a.id)}`,
      options,
    );
    check(response.ok && Array.isArray(payload) && payload.length === 0, `${test.table}:cross-${label}-affects-no-rows`);
  }

  const spoofed = { ...aCase.row, data: { ...aCase.row.data, testMarker: `spoof-${marker}` } };
  const { response: spoofResponse } = await fetchJson(`${base}/rest/v1/${test.table}?on_conflict=${test.conflict}`, {
    method: 'POST', token: b.token, body: spoofed,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  check(spoofResponse.status === 401 || spoofResponse.status === 403, `${test.table}:rejects-owner-spoofed-insert`);

  const { response: stillOwnResponse, payload: stillOwn } = await readRows(test.table, a.id, a.token);
  check(stillOwnResponse.ok && Array.isArray(stillOwn) && stillOwn.length === 1 && aCase.matches(stillOwn[0].data),
    `${test.table}:cross-writes-do-not-change-owner-row`);

  const { response: anonRead } = await fetchJson(
    `${base}/rest/v1/${test.table}?select=user_id&user_id=eq.${encodeURIComponent(a.id)}`,
  );
  check(anonRead.status === 401 || anonRead.status === 403, `${test.table}:denies-unauthenticated-read`);
  const { response: anonWrite } = await fetchJson(`${base}/rest/v1/${test.table}?on_conflict=${test.conflict}`, {
    method: 'POST',
    body: aCase.row,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  check(anonWrite.status === 401 || anonWrite.status === 403, `${test.table}:denies-unauthenticated-write`);
}

async function deleteDisposableAccount(identity) {
  const { response, payload } = await fetchJson(`${workerUrl}/v1/account`, { method: 'DELETE', token: identity.token });
  if (!response.ok || payload?.deleted !== true) {
    throw new Error(`Worker account deletion was not confirmed (HTTP ${response.status}, code ${payload?.error ?? 'unknown'}).`);
  }
  const { response: authResponse } = await fetchJson(`${base}/auth/v1/user`, { token: identity.token });
  check(authResponse.status === 401 || authResponse.status === 403, 'account-deletion-invalidates-disposable-user-session');
  identity.deleted = true;
}

try {
  const [a, b] = await Promise.all(credentials.map(authenticateDisposableUser));
  check(a.id !== b.id, 'test-users-have-distinct-identities');
  for (const test of tableCases(a.id)) await verifyTable(test, a, b);
  check(true, 'all-retention-rls-tests-completed');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Retention verification failed.');
} finally {
  const pending = identities.filter(identity => !identity.deleted);
  let cleanupFailed = false;
  for (const identity of pending) {
    try {
      await deleteDisposableAccount(identity);
    } catch (error) {
      cleanupFailed = true;
      console.error(error instanceof Error ? error.message : 'Disposable-account cleanup failed.');
    }
  }
  console.log(JSON.stringify({
    results,
    disposableAccountsCreated: identities.length,
    accountDeletionCleanupConfirmed: pending.length > 0 && !cleanupFailed,
    manualCleanupRequired: cleanupFailed,
  }, null, 2));
  if (results.some(result => !result.passed) || cleanupFailed || identities.length !== 2) process.exitCode = 1;
}
