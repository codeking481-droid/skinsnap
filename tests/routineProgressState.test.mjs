import test from 'node:test';
import assert from 'node:assert/strict';
import { localDayKey, restoreCheckedSteps } from '../src/routineProgressState.ts';
test('routine checks reset on a new day while same-day checks survive', () => {
  assert.deepEqual(restoreCheckedSteps(['Morning-1'], '2026-10-23', '2026-10-24', 'a', 'a'), []);
  assert.deepEqual(restoreCheckedSteps(['Morning-1'], '2026-10-24', '2026-10-24', 'a', 'a'), ['Morning-1']);
});
test('a different routine never inherits completion from the previous analysis', () => {
  assert.deepEqual(restoreCheckedSteps(['Morning-1'], '2026-10-24', '2026-10-24', 'a', 'b'), []);
  assert.deepEqual(restoreCheckedSteps(['Morning-1'], undefined, '2026-10-24', undefined, 'b'), []);
});
test('day keys use the local calendar', () => {
  assert.equal(localDayKey(new Date(2026, 9, 24, 23, 59)), '2026-10-24');
});
