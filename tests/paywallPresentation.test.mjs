import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPaywallPrice,
  SUBSCRIPTION_PURCHASES_ENABLED,
  usesDevelopmentPricePreview,
} from '../src/paywallPresentation.ts';

test('development prices appear only in development without native billing', () => {
  for (const kind of ['expo-go-preview', 'unconfigured', 'ready', 'error', undefined]) {
    for (const platform of ['android', 'ios', 'web']) {
      assert.equal(usesDevelopmentPricePreview(false, kind, platform), false);
    }
  }
  assert.equal(usesDevelopmentPricePreview(true, 'expo-go-preview', 'android'), true);
  assert.equal(usesDevelopmentPricePreview(true, 'unconfigured', 'android'), true);
  assert.equal(usesDevelopmentPricePreview(true, 'error', 'web'), true);
  assert.equal(usesDevelopmentPricePreview(true, 'error', 'android'), false);
  assert.equal(usesDevelopmentPricePreview(true, 'ready', 'android'), false);
  assert.equal(usesDevelopmentPricePreview(true, undefined, 'android'), false);
});

test('preview displays the requested prices and preserves verified localized prices', () => {
  assert.deepEqual(getPaywallPrice('weekly', undefined, true), { source: 'preview', label: '$6.99 / week' });
  assert.deepEqual(getPaywallPrice('yearly', undefined, true), { source: 'preview', label: '$29.99 / year' });
  assert.deepEqual(getPaywallPrice('yearlyDownsell', undefined, true), { source: 'preview', label: '$24.99 / year' });
  assert.deepEqual(getPaywallPrice('yearly', '€34,99', true), { source: 'store', label: '€34,99 / year' });
  assert.deepEqual(getPaywallPrice('yearly', undefined, false), { source: 'unavailable', label: 'Price unavailable' });
});

test('the intentional purchase launch gate remains closed', () => {
  assert.equal(SUBSCRIPTION_PURCHASES_ENABLED, false);
});
