import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSavingsPercent,
  hasVerifiedActiveEntitlement,
  isAnalysisResponseAllowed,
  isDownsellPreviouslyUsed,
  isProductWithoutIntro,
  isPurchaseCancelled,
  parseDownsellClaimResponse,
  productMatches,
  PREMIUM_ENTITLEMENT_ID,
  SUBSCRIPTION_PRODUCTS,
} from '../src/subscriptionRules.ts';

test('subscription product and premium entitlement identifiers stay stable', () => {
  assert.equal(PREMIUM_ENTITLEMENT_ID, 'skinsnap_premium');
  assert.deepEqual(SUBSCRIPTION_PRODUCTS, {
    weekly: 'skinsnap_weekly',
    yearly: 'skinsnap_yearly',
    yearlyDownsell: 'skinsnap_yearly_downsell',
  });
  assert.equal(productMatches('skinsnap_yearly:annual', SUBSCRIPTION_PRODUCTS.yearly), true);
  assert.equal(productMatches('skinsnap_yearly_extra', SUBSCRIPTION_PRODUCTS.yearly), false);
});

test('only weekly and annual recurring products without introductory pricing pass validation', () => {
  assert.equal(isProductWithoutIntro({
    identifier: 'skinsnap_weekly',
    subscriptionPeriod: 'P1W',
    introPrice: null,
    defaultOption: { freePhase: null, introPhase: null },
  }, 'weekly'), true);
  assert.equal(isProductWithoutIntro({
    identifier: 'skinsnap_yearly',
    subscriptionPeriod: 'P1Y',
    introPrice: null,
    defaultOption: { freePhase: null, introPhase: null },
  }, 'yearly'), true);
  assert.equal(isProductWithoutIntro({
    identifier: 'skinsnap_yearly',
    subscriptionPeriod: 'P1Y',
    introPrice: { priceString: '$0' },
    defaultOption: null,
  }, 'yearly'), false);
  assert.equal(isProductWithoutIntro({
    identifier: 'skinsnap_yearly',
    subscriptionPeriod: 'P1Y',
    introPrice: null,
    defaultOption: { freePhase: {}, introPhase: null },
  }, 'yearly'), false);
  assert.equal(isProductWithoutIntro({
    identifier: 'skinsnap_yearly',
    subscriptionPeriod: 'P1M',
    introPrice: null,
  }, 'yearly'), false);
});

test('entitlements require active verified access and must not be expired', () => {
  const now = 2_000_000;
  assert.equal(hasVerifiedActiveEntitlement({
    isActive: true,
    verification: 'VERIFIED',
    expirationDateMillis: now + 1000,
  }, now), true);
  assert.equal(hasVerifiedActiveEntitlement({
    isActive: true,
    verification: 'VERIFIED',
    expirationDateMillis: now - 1,
  }, now), false);
  assert.equal(hasVerifiedActiveEntitlement({
    isActive: true,
    verification: 'FAILED',
    expirationDateMillis: now + 1000,
  }, now), false);
  assert.equal(hasVerifiedActiveEntitlement({
    isActive: false,
    verification: 'VERIFIED',
    expirationDateMillis: null,
  }, now), false);
});

test('exclusive annual savings are calculated only for comparable store prices', () => {
  assert.equal(calculateSavingsPercent(29.99, 24.99, 'USD', 'USD'), 17);
  assert.equal(calculateSavingsPercent(29.99, 29.99, 'USD', 'USD'), null);
  assert.equal(calculateSavingsPercent(29.99, 24.99, 'USD', 'CAD'), null);
  assert.equal(calculateSavingsPercent(0, 24.99, 'USD', 'USD'), null);
});

test('one-time downsell claims require an eligible server response and cannot be locally reissued', () => {
  assert.deepEqual(parseDownsellClaimResponse({
    eligible: true,
    claimId: 'server-claim-1',
    productIdentifier: 'skinsnap_yearly_downsell',
  }, 'skinsnap_yearly_downsell'), {
    claimId: 'server-claim-1',
    productIdentifier: 'skinsnap_yearly_downsell',
  });
  assert.equal(parseDownsellClaimResponse({
    eligible: true,
    claimId: 'server-claim-2',
    productIdentifier: 'skinsnap_yearly',
  }, 'skinsnap_yearly_downsell'), null);
  assert.equal(parseDownsellClaimResponse({ eligible: false }, 'skinsnap_yearly_downsell'), null);
  assert.equal(isDownsellPreviouslyUsed('true'), true);
  assert.equal(isDownsellPreviouslyUsed(null), false);
});

test('paid analysis requires all client preconditions and cancellation is not success', () => {
  assert.equal(isAnalysisResponseAllowed(true, true, true), true);
  assert.equal(isAnalysisResponseAllowed(false, true, true), false);
  assert.equal(isAnalysisResponseAllowed(true, false, true), false);
  assert.equal(isAnalysisResponseAllowed(true, true, false), false);
  assert.equal(isPurchaseCancelled({ code: '1' }), true);
  assert.equal(isPurchaseCancelled({ userCancelled: true }), true);
  assert.equal(isPurchaseCancelled({ code: '2', userCancelled: false }), false);
});
