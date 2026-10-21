import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEntryDestination,
  getOnboardingResumeStep,
  sanitizeRoutineProgress,
  startScanTicker,
} from '../src/flowLogic.ts';
import { MAX_PREPARED_PHOTO_BYTES, validatePhoto } from '../src/photoValidation.ts';

test('first-time users start onboarding; returning users enter at upload', () => {
  assert.equal(getEntryDestination(false), '/');
  assert.equal(getEntryDestination(true), '/upload');
});

test('onboarding resumes only at valid saved steps', () => {
  assert.equal(getOnboardingResumeStep(1), 1);
  assert.equal(getOnboardingResumeStep(2), 2);
  assert.equal(getOnboardingResumeStep(3), 3);
  assert.equal(getOnboardingResumeStep(4), 1);
  assert.equal(getOnboardingResumeStep('3'), 1);
});

test('photo selection accepts readable images of any dimensions and bounds only prepared uploads', () => {
  assert.deepEqual(validatePhoto(4000, 6000, MAX_PREPARED_PHOTO_BYTES), { valid: true });
  assert.deepEqual(validatePhoto(100, 50), { valid: true });
  assert.deepEqual(validatePhoto(30000, 20000), { valid: true });
  assert.deepEqual(validatePhoto(30000, 20000, MAX_PREPARED_PHOTO_BYTES + 1), { valid: false, reason: 'too-large' });
  assert.deepEqual(validatePhoto(0, 600), { valid: false, reason: 'unreadable' });
});

test('routine state ignores malformed and unknown persisted values', () => {
  assert.deepEqual(sanitizeRoutineProgress({
    checkedSteps: ['Morning-Cleanser', 'fake-step', 7, 'Morning-Cleanser'],
    completedDays: ['2026-02-28', '2026-02-30', 'bad-date', '2026-02-28'],
  }), {
    checkedSteps: ['Morning-Cleanser'],
    completedDays: ['2026-02-28'],
  });
  assert.deepEqual(sanitizeRoutineProgress(null), { checkedSteps: [], completedDays: [] });
});

function makeScheduler() {
  const callbacks = [];
  const cleared = [];
  return {
    callbacks,
    cleared,
    scheduler: {
      setInterval(callback) { callbacks.push(callback); return callbacks.length; },
      clearInterval(id) { cleared.push(id); },
    },
  };
}

test('scan ticker completes once at 100 and stops after cleanup', () => {
  const progress = [];
  let completed = 0;
  const fake = makeScheduler();
  const stop = startScanTicker((value) => progress.push(value), () => { completed += 1; }, 1, fake.scheduler);
  for (let tick = 0; tick < 105; tick += 1) fake.callbacks[0]();
  stop();
  assert.equal(progress.at(-1), 100);
  assert.equal(completed, 1);
  assert.equal(progress.length, 100);
  assert.ok(fake.cleared.includes(1));
});

test('leaving scan early prevents further progress or completion', () => {
  const progress = [];
  let completed = 0;
  const fake = makeScheduler();
  const stop = startScanTicker((value) => progress.push(value), () => { completed += 1; }, 3, fake.scheduler);
  fake.callbacks[0]();
  fake.callbacks[0]();
  stop();
  const countAtStop = progress.length;
  fake.callbacks[0]();
  assert.ok(countAtStop > 0 && countAtStop < 100);
  assert.equal(progress.length, countAtStop);
  assert.equal(completed, 0);
});
