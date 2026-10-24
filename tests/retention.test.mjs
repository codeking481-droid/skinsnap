import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedPreferences, parseCustomRoutine, parseDiaryEntry, routineFromAnalysis, scheduledSteps, diaryWeekSummary, isLocalDate } from '../src/retention.ts';
import { assessCapture } from '../src/smartCapture.ts';
import { retentionRoute } from '../worker/src/retention.ts';
import worker from '../worker/src/index.ts';
import fs from 'node:fs';

const entry = (date = '2026-10-24') => ({ date, timeZone: 'Africa/Lagos', note: '', products: '', concerns: [], morningCompleted: false, eveningCompleted: true });
test('capture permits ordinary images and mild warnings but blocks unusable inputs', () => {
  assert.equal(assessCapture(1080, 1440, 300000, 'image/jpeg').usable, true);
  assert.ok(assessCapture(200, 250, 1000).warnings.length);
  assert.equal(assessCapture(200, 250, 1000).usable, true);
  for (const args of [[0, 10, 100], [10, 10, 0], [NaN, 10, 100], [1080, 1440, 1000, 'image/gif'], [1000, 1000, 33 * 1024 * 1024]]) assert.equal(assessCapture(...args).usable, false);
  assert.deepEqual(assessCapture(1200, 800, 1000).warnings, []); // landscape is not a face-detection failure
  assert.equal(assessCapture(1440, 1080, 1000, 'image/heic').usable, true);
});
test('preferences require permission, allow skipped fields and reject unsupported values', () => {
  assert.deepEqual(parseSavedPreferences({ consent: true, preferences: {} }), { consent: true, preferences: {} });
  assert.throws(() => parseSavedPreferences({ consent: false, preferences: {} }));
  assert.throws(() => parseSavedPreferences({ consent: true, preferences: { sensitivity: 'diagnosed' } }));
  const saved = parseSavedPreferences({ consent: true, preferences: { complexity: 'minimal', budget: 'budget-friendly', fragranceFree: 'prefer', experience: 'beginner', products: 'My moisturizer', region: 'Nigeria' } });
  assert.equal(saved.preferences.region, 'Nigeria');
  assert.throws(() => parseSavedPreferences({ consent: true, preferences: { products: 'x'.repeat(401) } }));
});
test('routine edits preserve AI source, IDs, ordering, periods and schedule', () => {
  const original = { resultId: 'ai-one', morningRoutine: ['Cleanse', 'Moisturize'], eveningRoutine: ['Cleanse gently'] };
  const snapshot = JSON.stringify(original);
  const routine = routineFromAnalysis(original);
  const [a, b, c] = routine.steps;
  const edited = parseCustomRoutine({ ...routine, steps: [{ ...b, name: 'My moisturizer', days: [1, 3] }, { ...a, period: 'Evening', description: 'My product' }, c] });
  assert.equal(edited.steps[0].id, b.id);
  assert.equal(scheduledSteps(edited, 2, 'Morning').length, 0);
  assert.equal(scheduledSteps(edited, 1, 'Morning').length, 1);
  assert.equal(JSON.stringify(original), snapshot);
  assert.throws(() => parseCustomRoutine({ ...routine, steps: [a, a] }));
  assert.throws(() => parseCustomRoutine({ ...routine, steps: [{ ...a, days: [] }] }));
  assert.equal(parseCustomRoutine({ version: 1, steps: [] }).steps.length, 0);
  assert.deepEqual(routineFromAnalysis(original), routine); // restoring does not make random duplicate IDs
});
test('diary uses explicit calendar dates and factual deduplicated weekly summaries', () => {
  assert.equal(isLocalDate('2026-02-30'), false);
  assert.equal(isLocalDate('2024-02-29'), true);
  assert.equal(parseDiaryEntry(entry()).date, '2026-10-24');
  assert.equal(parseDiaryEntry({ ...entry(), timeZone: 'Pacific/Kiritimati' }).date, '2026-10-24');
  assert.throws(() => parseDiaryEntry({ ...entry(), timeZone: 'Invalid/Zone' }));
  assert.throws(() => parseDiaryEntry({ ...entry(), feeling: 'cured' }));
  assert.deepEqual(diaryWeekSummary([entry('2026-10-19'), entry('2026-10-20'), entry('2026-10-20'), entry('2026-10-18'), entry('2026-10-25')], '2026-10-24'), { entries: 2, morning: 0, evening: 2 });
});
test('secure retention CRUD scopes every write/read/delete and repeated daily saves upsert', async () => {
  const rows = new Map(); const calls = [];
  const db = async (path, init = {}) => {
    calls.push({ path, init }); const url = new URL('https://db.test/' + path); const table = url.pathname;
    if (init.method === 'POST') { const row = JSON.parse(init.body); assert.equal(row.user_id, 'owner'); rows.set(table + (row.entry_date ?? ''), row); return new Response(null, { status: 204 }); }
    assert.equal(url.searchParams.get('user_id'), 'eq.owner');
    if (init.method === 'DELETE') { for (const key of [...rows.keys()]) if (key.startsWith(table)) rows.delete(key); return new Response(null, { status: 204 }); }
    return Response.json([...rows].filter(([key]) => key.startsWith(table)).map(([, row]) => row));
  };
  for (const [path, value] of [['preferences', { consent: true, preferences: { region: 'Nigeria' } }], ['routine/custom', routineFromAnalysis({ resultId: 'ai-one', morningRoutine: ['Cleanse'], eveningRoutine: ['Moisturize'] })], ['diary', entry()]]) {
    for (let i = 0; i < 2; i++) {
      const response = await retentionRoute(new Request(`https://api.test/v1/${path}?user_id=attacker`, { method: 'PUT', body: JSON.stringify({ ...value, user_id: 'attacker' }) }), 'owner', db);
      // Consent wrapper is strict; it rejects a supplied owner instead of using it.
      if (path === 'preferences') assert.equal(response.status, 400); else assert.equal(response.status, 200);
      assert.equal((await retentionRoute(new Request(`https://api.test/v1/${path}`, { method: 'PUT', body: JSON.stringify(value) }), 'owner', db)).status, 200);
    }
    const read = await (await retentionRoute(new Request(`https://api.test/v1/${path}`), 'owner', db)).json();
    assert.ok(path === 'diary' ? read.items.length === 1 : read.data);
    assert.equal((await retentionRoute(new Request(`https://api.test/v1/${path === 'diary' ? 'diary/2026-10-24' : path}`, { method: 'DELETE' }), 'owner', db)).status, 200);
  }
  assert.equal(rows.size, 0);
  assert.ok(calls.every(c => !c.path.includes('attacker')));
});
test('retention rejects invalid/oversized input before any database write', async () => {
  let calls = 0; const db = async () => { calls++; throw Error('unexpected'); };
  assert.equal((await retentionRoute(new Request('https://api.test/v1/diary', { method: 'PUT', body: '{}' }), 'owner', db)).status, 400);
  assert.equal((await retentionRoute(new Request('https://api.test/v1/diary', { method: 'PUT', body: 'x'.repeat(24001) }), 'owner', db)).status, 413);
  assert.equal((await retentionRoute(new Request('https://api.test/v1/diary/2026-02-30', { method: 'DELETE' }), 'owner', db)).status, 400);
  assert.equal(calls, 0);
});
test('retention routes require authentication and a deployment switch', async () => {
  for (const path of ['preferences', 'routine/custom', 'diary']) assert.equal((await worker.fetch(new Request('https://api.test/v1/' + path), { RETENTION_ENABLED: 'true' })).status, 401);
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ id: 'owner', is_anonymous: true });
    const response = await worker.fetch(new Request('https://api.test/v1/diary', { headers: { Authorization: 'Bearer test-token' } }), { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'test-key' });
    assert.equal(response.status, 503);
  } finally { globalThis.fetch = old; }
});
test('additive migration includes per-owner RLS and cascading deletion for new data', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610240001_retention_upgrade.sql', import.meta.url), 'utf8');
  for (const table of ['skincare_preferences', 'routines', 'skin_diary_entries']) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.equal((sql.match(/with check \(\(select auth.uid\(\)\) = user_id\)/g) ?? []).length, 3);
  assert.match(sql, /primary key \(user_id, entry_date\)/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});

test('an authenticated anonymous profile can save a diary without AI, billing or another owner ID', async () => {
  const old = globalThis.fetch; const calls = [];
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input); calls.push(url);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'anonymous-owner', is_anonymous: true });
      assert.ok(url.includes('/rest/v1/skin_diary_entries?'));
      const row = JSON.parse(init.body); assert.equal(row.user_id, 'anonymous-owner'); assert.equal(row.entry_date, '2026-10-24');
      assert.ok(!JSON.stringify(row).includes('another-owner'));
      return new Response(null, { status: 204 });
    };
    const response = await worker.fetch(new Request('https://api.test/v1/diary?userId=another-owner', { method: 'PUT', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ ...entry(), user_id: 'another-owner' }) }), {
      RETENTION_ENABLED: 'true', SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'test-key', SUPABASE_SECRET_KEY: 'test-secret',
    });
    assert.equal(response.status, 200); assert.equal(calls.length, 2);
  } finally { globalThis.fetch = old; }
});

test('browsing an older diary date uses an exact owner-scoped lookup', async () => {
  const response = await retentionRoute(new Request('https://api.test/v1/diary?date=2024-02-29&user_id=other'), 'owner', async path => {
    const url = new URL('https://db.test/' + path);
    assert.equal(url.searchParams.get('entry_date'), 'eq.2024-02-29');
    assert.equal(url.searchParams.get('user_id'), 'eq.owner');
    assert.equal(url.searchParams.get('limit'), '1');
    return Response.json([{ data: entry('2024-02-29') }]);
  });
  assert.equal((await response.json()).items[0].date, '2024-02-29');
});

test('database conflicts and failures are never acknowledged as saved', async () => {
  await assert.rejects(retentionRoute(new Request('https://api.test/v1/diary', { method: 'PUT', body: JSON.stringify(entry()) }), 'owner', async () => Response.json({ error: 'conflict' }, { status: 409 })), /not-confirmed/);
});

test('account deletion tolerates only absent optional tables and still deletes retention data with the switch off', async () => {
  const old = globalThis.fetch; let authDeleted = false; const deleted = [];
  const optional = ['analysis_history', 'downsell_offer_claims', 'routines', 'progress_snapshots'];
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'owner' });
      if (url.includes('/rest/v1/')) {
        const table = new URL(url).pathname.split('/').at(-1); deleted.push(table);
        if (optional.includes(table)) return Response.json({ code: 'PGRST205' }, { status: 404 });
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/auth/v1/admin/users/owner') && init.method === 'DELETE') { authDeleted = true; return new Response(null, { status: 200 }); }
      throw Error('unexpected');
    };
    const response = await worker.fetch(new Request('https://api.test/v1/account', { method: 'DELETE', headers: { Authorization: 'Bearer test' } }), { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'test-key', SUPABASE_SECRET_KEY: 'test-secret' });
    assert.equal(response.status, 200); assert.equal(authDeleted, true);
    assert.ok(deleted.includes('skin_diary_entries')); assert.ok(deleted.includes('skincare_preferences'));
  } finally { globalThis.fetch = old; }
});
