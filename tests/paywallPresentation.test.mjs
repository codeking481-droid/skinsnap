import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPaywallPrice,
  SUBSCRIPTION_PURCHASES_ENABLED,
} from '../src/paywallPresentation.ts';

test('paywall displays store prices and a safe catalogue fallback while offerings load', () => {
  assert.deepEqual(getPaywallPrice('weekly', 'CA$9.99', true), { source: 'store', label: 'CA$9.99 / week' });
  assert.deepEqual(getPaywallPrice('monthly', '£12.99', false), { source: 'store', label: '£12.99 / month' });
  assert.deepEqual(getPaywallPrice('yearly', '€34,99', false), { source: 'store', label: '€34,99 / year' });
  assert.deepEqual(getPaywallPrice('yearlyDownsell', undefined, true), { source: 'loading', label: 'Loading store price…' });
  assert.deepEqual(getPaywallPrice('weekly', undefined, false), { source: 'unavailable', label: '£4.99 / week' });
  assert.deepEqual(getPaywallPrice('yearly', '  ', false), { source: 'unavailable', label: '£39.99 / year' });
  assert.deepEqual(getPaywallPrice('yearly', undefined, false), { source: 'unavailable', label: '£39.99 / year' });
});

test('the intentional purchase launch gate remains closed', () => {
  assert.equal(SUBSCRIPTION_PURCHASES_ENABLED, false);
});
