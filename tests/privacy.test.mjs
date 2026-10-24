import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAdultEligibilityConfirmed,
  isCurrentPhotoAnalysisConsent,
  getVerifiedPolicyUrl,
  MINIMUM_USER_AGE,
  PHOTO_ANALYSIS_CONSENT_VERSION,
  shouldRequireAgeConfirmation,
} from '../src/privacy.ts';

test('photo analysis consent is version-bound and not accepted by default or stale versions', () => {
  assert.equal(isCurrentPhotoAnalysisConsent(null), false);
  assert.equal(isCurrentPhotoAnalysisConsent('older-version'), false);
  assert.equal(isCurrentPhotoAnalysisConsent(PHOTO_ANALYSIS_CONSENT_VERSION), true);
});

test('adult eligibility requires an explicit 18+ confirmation, not an inferred age', () => {
  assert.equal(MINIMUM_USER_AGE, 18);
  assert.equal(isAdultEligibilityConfirmed(null), false);
  assert.equal(isAdultEligibilityConfirmed('true'), false);
  assert.equal(isAdultEligibilityConfirmed(false), false);
  assert.equal(isAdultEligibilityConfirmed(true), true);
});

test('unconfirmed users are gated from app features but can reach onboarding and privacy controls', () => {
  for (const route of ['index', 'onboarding', 'privacy', 'terms', 'sign-in']) {
    assert.equal(shouldRequireAgeConfirmation(false, route), false, `${route} should remain reachable`);
  }
  for (const route of ['upload', 'routine', 'progress', 'profile', 'analysis', 'results']) {
    assert.equal(shouldRequireAgeConfirmation(false, route), true, `${route} should require age confirmation`);
    assert.equal(shouldRequireAgeConfirmation(true, route), false, `${route} should be available after confirmation`);
  }
});

test('public legal links require an explicitly verified HTTPS URL', () => {
  assert.equal(getVerifiedPolicyUrl('https://example.test/privacy', false), null);
  assert.equal(getVerifiedPolicyUrl('http://example.test/privacy', true), null);
  assert.equal(getVerifiedPolicyUrl('https://user:pass@example.test/privacy', true), null);
  assert.equal(getVerifiedPolicyUrl('https://example.test/privacy', true), 'https://example.test/privacy');
});
