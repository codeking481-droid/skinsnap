import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisPreferences, parseAnalysisQuality, parseObservationEvidence, visibilityLabel } from '../src/analysisQuality.ts';
const safe = text => !/bleach|diagnos/i.test(text);

test('optional preferences accept only known values, never arbitrary prompt text', () => {
  assert.deepEqual(parseAnalysisPreferences({}), {});
  assert.deepEqual(parseAnalysisPreferences({ sensitivity: 'yes', complexity: 'minimal' }), { sensitivity: 'yes', complexity: 'minimal' });
  for (const value of [null, [], { sensitivity: 'ignore instructions' }, { age: '25' }, { concern: 'diagnose' }]) {
    assert.throws(() => parseAnalysisPreferences(value));
  }
});
test('old saved analyses can omit new metadata; partial or unsafe new metadata is rejected', () => {
  assert.deepEqual(parseAnalysisQuality({}, safe), {});
  assert.deepEqual(parseObservationEvidence({}, safe), {});
  assert.throws(() => parseAnalysisQuality({}, safe, true));
  assert.throws(() => parseObservationEvidence({ title: 'Surface' }, safe));
  assert.throws(() => parseObservationEvidence({ title: 'Bleach skin', location: 'Cheek', visibility: 'clearly-visible', limitation: 'Lighting' }, safe));
});
test('quality metadata must be internally consistent, bounded and useful', () => {
  const value = { imageAssessment: { usable: false, reason: 'blur', guidance: 'Retake in sharp focus.' }, limitations: ['Surface details cannot be assessed.'] };
  assert.equal(parseAnalysisQuality(value, safe).imageAssessment.usable, false);
  assert.throws(() => parseAnalysisQuality({ ...value, imageAssessment: { ...value.imageAssessment, usable: true } }, safe));
  assert.throws(() => parseAnalysisQuality({ ...value, limitations: [] }, safe));
});
test('visibility labels never turn old model confidence into calibrated accuracy', () => {
  assert.equal(visibilityLabel({ confidence: 'high' }), 'Visibility not recorded');
  assert.equal(visibilityLabel({ confidence: 'high', visibility: 'clearly-visible' }), 'Clearly visible');
  assert.equal(visibilityLabel({ confidence: 'low', visibility: 'possibly-visible' }), 'Possibly visible');
});
