import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentPhotoAnalysisConsent, PHOTO_ANALYSIS_CONSENT_VERSION } from '../src/privacy.ts';

test('photo analysis consent is version-bound and not accepted by default or stale versions', () => {
  assert.equal(isCurrentPhotoAnalysisConsent(null), false);
  assert.equal(isCurrentPhotoAnalysisConsent('older-version'), false);
  assert.equal(isCurrentPhotoAnalysisConsent(PHOTO_ANALYSIS_CONSENT_VERSION), true);
});
