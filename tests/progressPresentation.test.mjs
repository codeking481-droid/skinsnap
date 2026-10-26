import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentWeekCount, getProgressWeek, getRoutineStreak } from '../src/progressPresentation.ts';

const now = new Date(2026, 9, 25, 12);

test('weekly progress is displayed against the current local Monday-to-Sunday week', () => {
  const days = getProgressWeek(['2026-10-19', '2026-10-21', '2026-10-26'], now);
  assert.deepEqual(days.map(day => day.key), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
  assert.equal(days[0]?.completed, true);
  assert.equal(days[1]?.completed, false);
  assert.equal(days[6]?.today, true);
  assert.equal(days[6]?.completed, false);
});

test('weekly check-in counts are unique and never include future dates', () => {
  assert.equal(getCurrentWeekCount(['2026-10-19', '2026-10-19', '2026-10-25', '2026-10-26'], now), 2);
});

test('routine streak counts consecutive logged days through today or yesterday', () => {
  assert.equal(getRoutineStreak(['2026-10-23', '2026-10-24', '2026-10-25'], now), 3);
  assert.equal(getRoutineStreak(['2026-10-23', '2026-10-24'], now), 2);
  assert.equal(getRoutineStreak(['2026-10-22'], now), 0);
});
