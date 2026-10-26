import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdultAgeAssertion, parseAnalysisPreferences, parseAnalysisQuality, parseCosmeticInsights, parseCosmeticSkinAge, parseObservationEvidence, visibilityLabel, VISION_PROMPT, VISION_RESPONSE_SCHEMA } from '../src/analysisQuality.ts';
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
  assert.equal(visibilityLabel({ confidence: 'high' }), null);
  assert.equal(visibilityLabel({ confidence: 'high', visibility: 'clearly-visible' }), 'Clearly visible');
  assert.equal(visibilityLabel({ confidence: 'low', visibility: 'possibly-visible' }), 'Possibly visible');
});
test('cosmetic tiers require clear-image observations from their matching category', () => {
  const observations = [{ category: 'apparent-dryness', visibility: 'clearly-visible' }, { category: 'visible-blemishes', visibility: 'clearly-visible' }];
  assert.deepEqual(parseCosmeticInsights([
    { category: 'hydration', tier: 'Balanced' },
    { category: 'blemishes', tier: 'Clear' },
  ], observations, 'clear'), [
    { category: 'hydration', tier: 'Balanced' },
    { category: 'blemishes', tier: 'Clear' },
  ]);
  assert.deepEqual(parseCosmeticInsights(undefined, observations, 'clear'), []);
  assert.throws(() => parseCosmeticInsights([{ category: 'texture', tier: 'Great' }], observations, 'clear'));
  assert.throws(() => parseCosmeticInsights([{ category: 'hydration', tier: 'Balanced' }], observations, 'limited'));
  assert.throws(() => parseCosmeticInsights([
    { category: 'hydration', tier: 'Balanced' },
    { category: 'hydration', tier: 'Great' },
  ], observations, 'clear'));
});
test('skin-age estimates use the estimated 16-35 cosmetic format and require clear front-facing photos', () => {
  assert.equal(parseCosmeticSkinAge(undefined, 'clear'), undefined);
  assert.equal(parseCosmeticSkinAge(null, 'limited'), null);
  assert.deepEqual(parseCosmeticSkinAge({ value: 22, label: 'estimated' }, 'clear'), { value: 22, label: 'estimated' });
  assert.deepEqual(parseCosmeticSkinAge(22, 'clear'), { value: 22, label: 'estimated' });
  for (const value of [{ value: 15, label: 'estimated' }, { value: 36, label: 'estimated' }, { value: 22.5, label: 'estimated' }, { value: 22, label: 'guess' }, '22']) {
    assert.throws(() => parseCosmeticSkinAge(value, 'clear'));
  }
  assert.throws(() => parseCosmeticSkinAge({ value: 22, label: 'estimated' }, 'limited'));
  assert.throws(() => parseCosmeticSkinAge({ value: 22, label: 'estimated' }, 'clear', 'side'));
});
test('vision contract exposes cosmetic tiers, age estimate and supported observation categories', () => {
  const observation = VISION_RESPONSE_SCHEMA.properties.observations.items;
  assert.deepEqual(VISION_RESPONSE_SCHEMA.required, ['imageQuality', 'observations', 'cosmeticInsights', 'skinAgeEstimate', 'disclaimer']);
  assert.equal(observation.properties.category.enum.length, 8);
  assert.deepEqual(observation.required, ['category', 'description', 'confidence']);
  assert.deepEqual(observation.properties.confidence.enum, ['low', 'medium', 'high']);
  assert.deepEqual(VISION_RESPONSE_SCHEMA.properties.cosmeticInsights.items.properties.category.enum, ['hydration', 'texture', 'evenness', 'blemishes']);
  assert.ok(VISION_RESPONSE_SCHEMA.properties.skinAgeEstimate);
  assert.equal(VISION_RESPONSE_SCHEMA.properties.disclaimer.const, 'Cosmetic tracking only, not medical diagnosis');
});
test('vision guidance accepts moderately clear skin detail with mild reflections without relaxing evidence rules', () => {
  assert.match(VISION_PROMPT, /moderately clear photo shows visible skin texture, treat imageQuality as clear even when there are mild reflections or shine/);
  assert.match(VISION_PROMPT, /Use limited only when the visible face\/skin is very small, extremely blurry, or completely dark\/overexposed/);
  assert.match(VISION_PROMPT, /Mild shine or reflections alone do not prevent an estimate/);
  assert.match(VISION_PROMPT, /Include a tier only when imageQuality is clear and a matching observation exists/);
  assert.match(VISION_PROMPT, /Cosmetic tracking only, not medical diagnosis/);
});

test('adult eligibility accepts only the required 18+ assertion', () => {
  assert.equal(isAdultAgeAssertion('18+'), true);
  for (const value of ['17', '16', 'under18', true, null]) assert.equal(isAdultAgeAssertion(value), false);
});
