import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRoutineSteps,
  filterRoutineGuidance,
  isSafeCosmeticText,
  parseRoutineGuidance,
  restoreRoutineGuidance,
  routineStepIds,
  routineTip,
} from '../src/routinePresentation.ts';

test('routine guidance allows ordinary cosmetic wording and filters unsupported saved entries safely', () => {
  const ordinary = 'Treat yourself to a gentle moisturizer after cleansing.';
  assert.equal(isSafeCosmeticText(ordinary), true);
  assert.deepEqual(parseRoutineGuidance([ordinary], false), [ordinary]);
  assert.throws(() => parseRoutineGuidance(['This diagnoses eczema.'], false), /invalid-routine-guidance/);
  assert.deepEqual(parseRoutineGuidance([
    ordinary,
    'This diagnoses eczema.',
    null,
  ], true), [ordinary]);
  assert.deepEqual(parseRoutineGuidance(['This diagnoses eczema.'], true), []);
});

test('builds routine steps dynamically and derives only details present in saved text', () => {
  const morning = buildRoutineSteps([
    'Use a gentle cleanser daily.',
    'Apply a niacinamide serum once daily.',
    'Finish with broad-spectrum SPF 30 sunscreen.',
  ], 'Morning');

  assert.equal(morning.length, 3);
  assert.deepEqual(morning.map((step) => step.id), ['Morning-1', 'Morning-2', 'Morning-3']);
  assert.equal(morning[0].category, 'Cleanser');
  assert.equal(morning[1].ingredients.join(', '), 'niacinamide');
  assert.equal(morning[1].frequency, 'once daily');
  assert.equal(morning[2].category, 'Sun protection');
  assert.equal(buildRoutineSteps(['Use moisturizer.'], 'Evening')[0].frequency, 'Not specified in the saved guidance');
});

test('routine progress ids adapt to different morning and evening lengths', () => {
  assert.deepEqual(routineStepIds(['one'], ['one', 'two']), [
    'Morning-1', 'Evening-1', 'Evening-2',
  ]);
  assert.equal(buildRoutineSteps(Array.from({ length: 7 }, (_, index) => `Guidance ${index + 1}`), 'Evening').length, 7);
  assert.equal(buildRoutineSteps([], 'Morning').length, 0);
});

test('routine tips use saved precautions and otherwise stay conservative', () => {
  assert.equal(
    routineTip(['Use sunscreen.'], [], ['Patch test first.']),
    'From your saved guidance: Patch test first.',
  );
  assert.match(routineTip(['Use sunscreen.'], [], []), /sun protection/);
  assert.match(routineTip([], [], []), /Complete a skin analysis/);
});

test('medical or diagnostic recommendations are removed and surfaced for safety review', () => {
  const result = filterRoutineGuidance(['Use a gentle cleanser.', 'This treats acne.']);
  assert.deepEqual(result, { items: ['Use a gentle cleanser.'], removed: true });
  assert.deepEqual(filterRoutineGuidance(['Patch test new products.']), {
    items: ['Patch test new products.'],
    removed: false,
  });

  test('saved routine restores a clearly general fallback only when a period has no supported steps', () => {
    const routine = restoreRoutineGuidance({
      morningRoutine: ['This diagnoses acne.'],
      eveningRoutine: ['Cleanse gently and moisturize.'],
      precautions: [],
    });
    assert.equal(routine.usesGeneralGuidance, true);
    assert.equal(routine.removedUnsupportedGuidance, true);
    assert.match(routine.morningRoutine[0], /lukewarm water/);
    assert.deepEqual(routine.eveningRoutine, ['Cleanse gently and moisturize.']);
    assert.equal(routine.precautions.length, 1);
  });

  test('cosmetic text validator rejects medical, beauty-score, and guaranteed-outcome claims', () => {
    assert.equal(isSafeCosmeticText('Some visible shine is present.'), true);
    assert.equal(isSafeCosmeticText('This diagnoses acne.'), false);
    assert.equal(isSafeCosmeticText('Guaranteed results in one week.'), false);
    assert.equal(isSafeCosmeticText('A medical-grade skin score.'), false);
  });
});
