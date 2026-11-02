import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appConfig = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const easConfig = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));

test('Play Store app identity targets the required Android package and SDK', () => {
  assert.equal(appConfig.android.package, 'com.skinsnap.app');
  assert.equal(appConfig.android.targetSdkVersion, 36);
});

test('EAS production Android builds are store-ready app bundles', () => {
  assert.equal(easConfig.build.production.distribution, 'store');
  assert.equal(easConfig.build.production.android.buildType, 'app-bundle');
});
