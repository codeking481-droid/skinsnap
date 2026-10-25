import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/services/session.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const ACCESS = 'skinsnap-auth-session-token'; const REFRESH = 'skinsnap-auth-refresh-token'; const EXPIRY = 'skinsnap-auth-expires-at';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(writeGate) {
  const storage = new Map([[ACCESS, 'old-access'], [REFRESH, 'old-refresh'], [EXPIRY, String(Date.now() - 1)]]);
  const network = deferred(); let requests = 0;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, module: { exports }, Date, Promise, AbortSignal,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.test', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key' } },
    fetch: async (_url, init) => { requests++; assert.ok(init.signal); return network.promise; },
    require: name => {
      if (name === 'expo-secure-store') return {
        getItemAsync: async key => storage.get(key) ?? null,
        setItemAsync: async (key, value) => { if (writeGate && value.startsWith('refreshed')) await writeGate.promise; storage.set(key, value); },
        deleteItemAsync: async key => { storage.delete(key); }, AFTER_FIRST_UNLOCK: 'test',
      };
      if (name === './sessionStore') return {
        getSessionValue: async key => storage.get(key) ?? null,
        setSessionValue: async (key, value) => { if (writeGate && value.startsWith('refreshed')) await writeGate.promise; storage.set(key, value); },
        deleteSessionValue: async key => { storage.delete(key); },
      };
      if (name === './billing') return { logOutRevenueCatUser: async () => {}, logInRevenueCatUser: async () => {}, isRevenueCatConfiguredForPlatform: () => false };
      if (name === '../anonymousAuth') return {};
      throw Error('Unexpected module: ' + name);
    },
  });
  return { api: exports, storage, requests: () => requests, resolve: () => network.resolve(Response.json({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 3600 })) };
}
test('concurrent authenticated calls share one refresh-token exchange', async () => {
  const f = fixture(); const a = f.api.getSessionToken(); const b = f.api.getSessionToken(); const c = f.api.getSessionToken();
  await tick(); assert.equal(f.requests(), 1); f.resolve();
  assert.deepEqual(await Promise.all([a, b, c]), ['refreshed-access', 'refreshed-access', 'refreshed-access']);
  assert.equal(f.storage.get(REFRESH), 'refreshed-refresh');
  assert.equal(await f.api.getSessionToken(), 'refreshed-access'); assert.equal(f.requests(), 1);
});
test('late refresh cannot resurrect credentials after logout', async () => {
  const f = fixture(); const pending = f.api.getSessionToken(); await tick();
  await f.api.clearSessionToken(); f.resolve();
  assert.equal(await pending, null); assert.equal(f.storage.has(ACCESS), false); assert.equal(f.storage.has(REFRESH), false);
});
test('late refresh cannot overwrite a newly signed-in account', async () => {
  const f = fixture(); const pending = f.api.getSessionToken(); await tick();
  await f.api.saveAuthenticatedSession('different-account', 'server-owner', 'different-refresh', Date.now() + 3600000);
  f.resolve(); assert.equal(await pending, null);
  assert.equal(await f.api.getSessionToken(), 'different-account'); assert.equal(f.storage.get(REFRESH), 'different-refresh');
});
test('logout waits for an already-started storage write and then removes all tokens', async () => {
  const gate = deferred(); const f = fixture(gate); const pending = f.api.getSessionToken(); await tick(); f.resolve(); await tick();
  const logout = f.api.clearSessionToken(); gate.resolve(); await logout;
  assert.equal(await pending, null); assert.equal(f.storage.has(ACCESS), false); assert.equal(f.storage.has(REFRESH), false);
});
