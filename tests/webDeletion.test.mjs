import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { deleteSkinSnapAccount } from '../website/deletion-client.mjs';
const config = { supabaseUrl: 'https://supabase.test', publishableKey: 'sb_publishable_test', apiUrl: 'https://api.test', deletionEnabled: true };
const input = { email: 'TEST@example.invalid', password: 'private-test-password', confirmation: 'DELETE', acknowledged: true };
test('external deletion verifies ownership, sends no target ID, and does not return credentials', async () => {
  const requests = [];
  const response = await deleteSkinSnapAccount(config, input, async (url, init) => {
    requests.push({ url, init });
    if (url.includes('/token?')) return Response.json({ access_token: 'test-token', user: { id: 'own-id' } });
    if (url.endsWith('/session')) return Response.json({ userId: 'own-id' });
    return Response.json({ deleted: true });
  });
  assert.deepEqual(response, { deleted: true });
  assert.equal(requests.length, 3);
  assert.equal(requests[2].init.method, 'DELETE');
  assert.equal(requests[2].init.body, undefined);
  assert.ok(!requests[2].url.includes('own-id'));
  assert.ok(!JSON.stringify(response).includes('test-token'));
});
test('external deletion fails closed for missing confirmation or mismatched authenticated identity', async () => {
  await assert.rejects(deleteSkinSnapAccount(config, { ...input, confirmation: '' }, async () => { throw new Error('Must not call'); }));
  let calls = 0;
  await assert.rejects(deleteSkinSnapAccount(config, input, async url => {
    calls++;
    return url.includes('/token?') ? Response.json({ access_token: 'test-token', user: { id: 'one' } }) : Response.json({ userId: 'two' });
  }), /could not match/);
  assert.equal(calls, 2);
});

test('external deletion is disabled unless the staged site is explicitly approved', async () => {
  await assert.rejects(
    deleteSkinSnapAccount({ ...config, deletionEnabled: false }, input, async () => {
      throw new Error('Must not call');
    }),
    /not enabled/,
  );
});

test('external deletion refuses a Supabase service-role JWT before making network requests', async () => {
  const serviceRoleKey = `eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  await assert.rejects(
    deleteSkinSnapAccount({ ...config, publishableKey: serviceRoleKey }, input, async () => {
      throw new Error('Must not call');
    }),
    /public Supabase key/,
  );
});
test('a lost deletion response is reported as uncertain instead of claiming data was preserved', async () => {
  await assert.rejects(deleteSkinSnapAccount(config, input, async url => {
    if (url.includes('/token?')) return Response.json({ access_token: 'test-token', user: { id: 'one' } });
    if (url.endsWith('/session')) return Response.json({ userId: 'one' });
    throw new Error('offline');
  }), /may already have been removed/);
});
