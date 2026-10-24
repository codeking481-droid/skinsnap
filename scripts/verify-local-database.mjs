// Isolated PostgreSQL verification. Install the tool ONLY under ignored artifacts:
// npm install --prefix artifacts/pre-billing/db-tools --ignore-scripts @electric-sql/pglite
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../artifacts/pre-billing/db-tools/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const checks = [];
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const G = '33333333-3333-4333-8333-333333333333';
async function check(name, fn) { await fn(); checks.push({ name, status: 'PASS' }); }
async function asUser(id, fn, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const count = async (table, owner) => Number((await db.query(`select count(*) as n from public.${table} where user_id = $1`, [owner])).rows[0].n);
try {
  await db.exec(`create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key, is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const core = await fs.readFile('supabase/migrations/202610210001_skinsnap_core.sql', 'utf8');
  const retention = await fs.readFile('supabase/migrations/202610240001_retention_upgrade.sql', 'utf8');
  await check('historical core migration executes without changing external data', () => db.exec(core));
  for (const [id, guest] of [[A, false], [B, false], [G, true]]) await db.query('insert into auth.users(id,is_anonymous) values($1,$2)', [id, guest]);
  await db.query('insert into public.routines(user_id,data) values($1,$2)', [A, { legacy: 'existing routine preserved' }]);
  await check('retention migration preserves an existing routine record', async () => {
    await db.exec(retention);
    assert.equal((await db.query('select data from public.routines where user_id=$1', [A])).rows[0].data.legacy, 'existing routine preserved');
  });
  await check('retention migration can be rerun without duplicates or data loss', async () => { await db.exec(retention); assert.equal(await count('routines', A), 1); });
  const tables = ['skincare_preferences', 'routines', 'skin_diary_entries'];
  for (const id of [A, B, G]) await asUser(id, async () => {
    await db.query('insert into public.skincare_preferences(user_id,data) values($1,$2)', [id, { consent: true, preferences: {} }]);
    await db.query('insert into public.routines(user_id,data) values($1,$2) on conflict(user_id) do update set data=excluded.data', [id, { version: 1, steps: [] }]);
    await db.query('insert into public.skin_diary_entries(user_id,entry_date,data) values($1,$2,$3)', [id, '2026-10-24', { date: '2026-10-24' }]);
  });
  for (const table of tables) {
    await check(`${table}: A/B/anonymous authenticated users see only their own rows`, async () => {
      for (const id of [A, B, G]) await asUser(id, async () => {
        const rows = (await db.query(`select user_id from public.${table}`)).rows;
        assert.equal(rows.length, 1); assert.equal(rows[0].user_id, id);
      });
    });
    await check(`${table}: forged owner insert and ownership reassignment are rejected`, async () => asUser(A, async () => {
      await assert.rejects(db.query(`update public.${table} set user_id=$1 where user_id=$2`, [B, A]), error => error.code === '42501');
      const query = table === 'skin_diary_entries'
        ? 'insert into public.skin_diary_entries(user_id,entry_date,data) values($1,\'2026-10-25\',\'{"date":"2026-10-25"}\')'
        : `insert into public.${table}(user_id,data) values($1,'{"consent":true}')`;
      await assert.rejects(db.query(query, [B]), error => error.code === '42501');
    }));
    await check(`${table}: A cannot update or delete B's rows`, async () => {
      await asUser(A, async () => {
        assert.equal((await db.query(`update public.${table} set updated_at=now() where user_id=$1 returning user_id`, [B])).rows.length, 0);
        assert.equal((await db.query(`delete from public.${table} where user_id=$1 returning user_id`, [B])).rows.length, 0);
      });
      assert.equal(await count(table, B), 1);
    });
    await check(`${table}: unauthenticated role has no read/write/delete access`, async () => asUser('', async () => {
      for (const sql of [`select * from public.${table}`, `update public.${table} set updated_at=now()`, `delete from public.${table}`]) await assert.rejects(db.query(sql));
    }, 'anon'));
  }
  await check('database rejects missing diary date and unconsented or malformed preference wrappers', async () => asUser(A, async () => {
    await assert.rejects(db.query("insert into public.skin_diary_entries(user_id,entry_date,data) values($1,'2026-10-26','{}')", [A]), e => e.code === '23514');
    await db.query('delete from public.skincare_preferences where user_id=$1', [A]);
    for (const data of [{ consent: 'true', preferences: {} }, { consent: true }, { consent: false, preferences: {} }]) await assert.rejects(db.query('insert into public.skincare_preferences(user_id,data) values($1,$2)', [A,data]), e => e.code === '23514');
    await db.query('insert into public.skincare_preferences(user_id,data) values($1,$2)', [A,{ consent: true, preferences: {} }]);
  }));
  await check('analysis history RLS isolates B from A', async () => {
    await db.query("insert into public.analysis_history(user_id,idempotency_key,status) values($1,'synthetic-history','failed')", [A]);
    await asUser(B, async () => assert.equal((await db.query('select * from public.analysis_history')).rows.length, 0));
  });
  await check('same owner/date upserts without duplicate diary entries; real invalid dates fail', async () => asUser(A, async () => {
    await db.query("insert into public.skin_diary_entries(user_id,entry_date,data) values($1,'2026-10-24','{\"date\":\"2026-10-24\"}') on conflict(user_id,entry_date) do update set data=excluded.data", [A]);
    assert.equal(await count('skin_diary_entries', A), 1);
    await assert.rejects(db.query("insert into public.skin_diary_entries(user_id,entry_date,data) values($1,'2026-02-30','{\"date\":\"2026-02-30\"}')", [A]));
  }));
  await check('deleting Auth A cascades only A records and preserves B and anonymous G', async () => {
    await db.query('delete from auth.users where id=$1', [A]);
    for (const table of [...tables, 'analysis_history']) assert.equal(await count(table, A), 0);
    for (const table of tables) { assert.equal(await count(table, B), 1); assert.equal(await count(table, G), 1); }
  });
  const report = { engine: 'PGlite PostgreSQL (isolated; auth.uid shim, no Supabase HTTP/Auth service)', passed: checks.length, checks, productionTouched: false, liveRlsVerified: false };
  await fs.writeFile('artifacts/pre-billing/local-database-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.length, engine: report.engine, productionTouched: false }));
} finally { await db.close(); }
