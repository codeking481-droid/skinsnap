import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_ROUTINE_ROUTE,
  buildRoutinePreview,
  buildSkinFocus,
  noObservationMessage,
  presentObservation,
  shouldAnimateSnapshot,
} from '../src/analysisPresentation.ts';

const result = (overrides = {}) => ({
  resultId: 'result-1',
  createdAt: '2026-10-24T00:00:00.000Z',
  imageQuality: 'clear',
  summary: 'A cautious photo-based summary.',
  observations: [{
    category: 'visible-shine',
    title: 'Surface shine',
    observation: 'Some visible shine is present.',
    confidence: 'low',
    location: 'Forehead',
    visibility: 'possibly-visible',
    limitation: 'Lighting may affect this appearance.',
    whyItMatters: 'This describes only what is visible.',
    practicalSuggestion: 'Follow the labels on gentle products.',
  }],
  morningRoutine: ['Use a gentle cleanser.', 'Apply moisturizer.', 'Finish with sunscreen.'],
  eveningRoutine: ['Cleanse gently.', 'Apply moisturizer.'],
  precautions: [],
  ...overrides,
});

test('full validated report uses the actual summary and evidence-backed focus', () => {
  const observation = presentObservation(result().observations[0]);
  assert.equal(observation.title, 'Surface shine');
  assert.equal(observation.explanation, 'This describes only what is visible.');
  assert.equal(observation.suggestion, 'Follow the labels on gentle products.');
  assert.deepEqual(buildSkinFocus({ concern: 'shine' }, result().observations), [
    { label: 'Managing visible surface shine', source: 'goal' },
    { label: 'Surface shine', source: 'observation' },
  ]);
});

test('partial observations omit absent optional explanation and suggestion', () => {
  const observation = presentObservation({
    category: 'general-texture',
    observation: 'The surface appears soft in this photo.',
    confidence: 'low',
  });
  assert.equal(observation.title, 'Skin texture');
  assert.equal('explanation' in observation, false);
  assert.equal('suggestion' in observation, false);
});

test('empty and limited reports use honest non-fabricated observation messages', () => {
  assert.match(noObservationMessage('clear'), /does not add guesses/i);
  assert.match(noObservationMessage('limited'), /not provide enough detail/i);
});

test('long AI summaries and observations are preserved without truncation', () => {
  const longText = 'Visible cosmetic detail is limited. '.repeat(20);
  const item = presentObservation({ category: 'overall-finish', observation: longText, confidence: 'low' });
  assert.equal(item.observation, longText);
  assert.equal(result({ summary: longText }).summary, longText);
});

test('missing routine shows no fabricated steps', () => {
  assert.equal(buildRoutinePreview(result({ morningRoutine: [], eveningRoutine: [] }), null, [], 2), null);
});

test('routine preview uses edited names and only marks recorded completion', () => {
  const custom = {
    version: 1,
    sourceResultId: 'result-1',
    steps: [
      { id: 'step-custom-cleanse', name: 'My gentle cleanser', description: 'Evening cleanse', period: 'Evening', days: [2] },
      { id: 'step-custom-moisturize', name: 'My moisturizer', description: '', period: 'Evening', days: [2] },
      { id: 'step-custom-morning', name: 'Morning SPF', description: '', period: 'Morning', days: [2] },
    ],
  };
  const preview = buildRoutinePreview(result(), custom, ['step-custom-cleanse'], 2);
  assert.equal(preview.morning[0].title, 'Morning SPF');
  assert.equal(preview.morning[0].completed, false);
  assert.equal(preview.evening[0].title, 'My gentle cleanser');
  assert.equal(preview.evening[0].completed, true);
  assert.equal(preview.evening[1].completed, false);
});

test('AI routine preview uses existing guidance and checked step identifiers', () => {
  const preview = buildRoutinePreview(result(), null, ['Morning-1', 'Evening-2'], 2);
  assert.equal(preview.morning[0].completed, true);
  assert.equal(preview.evening[1].completed, true);
  assert.equal(preview.morning[1].completed, false);
});

test('no saved preferences falls back to observations without inventing a goal', () => {
  assert.deepEqual(buildSkinFocus({}, result().observations), [
    { label: 'Surface shine', source: 'observation' },
  ]);
  assert.deepEqual(buildSkinFocus({}, []), []);
});

test('snapshot animation respects reduced-motion preference and routine navigation is existing route', () => {
  assert.equal(shouldAnimateSnapshot(true), false);
  assert.equal(shouldAnimateSnapshot(false), true);
  assert.equal(ANALYSIS_ROUTINE_ROUTE, '/routine');
});
