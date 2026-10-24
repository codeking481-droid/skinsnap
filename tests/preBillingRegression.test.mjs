import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as rules from '../src/subscriptionRules.ts';

function declaration(file, name) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let found;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) found = n; ts.forEachChild(n, visit); }
  visit(ast); assert.ok(found); return 'const ' + found.getText(ast) + ';';
}
const compile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
test('opening an older diary entry makes its existing delete and discard controls available', async () => {
  const saved = { date: '2024-02-29', note: 'Synthetic fixture' }; let cached = []; let selected;
  const select = vm.runInNewContext(compile(declaration('../src/app/skin-diary.tsx', 'select')) + '\nselect', {
    busy: false, dirty: false, entries: [], isLocalDate: () => true, localDayKey: () => '2026-10-24',
    loadDiaryEntry: async () => saved, setEntries: fn => { cached = fn(cached); }, setEntry: e => { selected = e; },
    setDate: () => {}, setDirty: () => {}, setStatus: () => {}, setBusy: () => {}, blank: () => { throw Error('must not replace saved data'); },
  });
  select('2024-02-29'); await new Promise(setImmediate);
  assert.equal(selected, saved); assert.equal(cached[0], saved); assert.equal(cached.some(e => e.date === selected.date), true);
});
test('paywall legal actions do not open unverified environment URLs', async () => {
  const routes = [];
  const open = vm.runInNewContext(compile(declaration('../src/app/paywall.tsx', 'openLegal')) + '\nopenLegal', {
    PUBLISHED_TERMS_URL: null, PUBLISHED_PRIVACY_POLICY_URL: null, router: { push: path => routes.push(path) },
    process: { env: { EXPO_PUBLIC_TERMS_URL: 'https://unverified.test/terms', EXPO_PUBLIC_PRIVACY_URL: 'https://unverified.test/privacy' } },
    Linking: { openURL: () => { throw Error('must not open unverified URL'); } }, setNotice: () => {},
  });
  await open('terms'); await open('privacy'); assert.deepEqual(routes, ['/terms', '/privacy']);
});

function billingFixture({ preview = false, configured = true, result, error, pending } = {}) {
  let purchases = 0; const exports = {};
  const info = result ?? { entitlements: { active: { skinsnap_premium: { isActive: true, verification: 'VERIFIED', expirationDateMillis: Date.now() + 60000 } } } };
  const sdk = { isConfigured: async () => true, getCustomerInfo: async () => info, restorePurchases: async () => info,
    purchasePackage: async () => { purchases++; if (error) throw error; if (pending) await pending; return { customerInfo: info }; } };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/services/billing.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, process: { env: configured ? { EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: 'test-public-sdk-key' } : {} },
    require: name => name === 'expo-constants' ? { __esModule: true, default: { executionEnvironment: preview ? 'store' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'store' } }
      : name === 'react-native' ? { Platform: { OS: 'android' } }
      : name === '../subscriptionRules' ? rules : name === 'react-native-purchases' ? { __esModule: true, default: sdk } : (() => { throw Error(name); })(),
  });
  return { api: exports, purchases: () => purchases };
}
test('billing rejects preview/unconfigured, inactive and unverified entitlements', async () => {
  assert.equal((await billingFixture({ preview: true }).api.getVerifiedEntitlement()).reason, 'preview');
  assert.equal((await billingFixture({ configured: false }).api.restorePurchases()).reason, 'unconfigured');
  const inactive = { entitlements: { active: {} } };
  assert.equal((await billingFixture({ result: inactive }).api.purchasePlan('weekly', {})).kind, 'inactive');
  const unverified = { entitlements: { active: { skinsnap_premium: { isActive: true, verification: 'FAILED', expirationDateMillis: null } } } };
  assert.equal((await billingFixture({ result: unverified }).api.getVerifiedEntitlement()).reason, 'unverified');
});
test('billing handles verified purchase/restore, cancellation and pending without fake success', async () => {
  const f = billingFixture(); assert.equal((await f.api.purchasePlan('yearly', {})).kind, 'active'); assert.equal((await f.api.restorePurchases()).active, true);
  assert.equal((await billingFixture({ error: { userCancelled: true } }).api.purchasePlan('weekly', {})).kind, 'cancelled');
  assert.equal((await billingFixture({ error: { code: '20' } }).api.purchasePlan('weekly', {})).kind, 'pending');
  assert.equal((await billingFixture({ error: new Error('Synthetic network failure') }).api.purchasePlan('weekly', {})).kind, 'error');
});
test('billing serializes native store operations and refuses a duplicate purchase', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const f = billingFixture({ pending });
  const first = f.api.purchasePlan('weekly', {}); await new Promise(setImmediate);
  assert.equal((await f.api.purchasePlan('weekly', {})).kind, 'error'); assert.equal((await f.api.restorePurchases()).active, false);
  release(); assert.equal((await first).kind, 'active'); assert.equal(f.purchases(), 1);
});
