import test from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysisOnce } from '../src/analysisRequestRegistry.ts';
test('repeated requests for the same selected photo share one upload and result', async () => {
  let starts = 0;
  let finish;
  const start = () => { starts++; return new Promise(resolve => { finish = resolve; }); };
  const first = runAnalysisOnce('same-photo', start);
  const second = runAnalysisOnce('same-photo', start);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(starts, 1);
  finish({ resultId: 'one-result' });
  assert.deepEqual(await second, { resultId: 'one-result' });
});
test('a failed upload can be retried with the same server idempotency key', async () => {
  await assert.rejects(runAnalysisOnce('retry-photo', async () => { throw new Error('offline'); }));
  assert.equal(await runAnalysisOnce('retry-photo', async () => 'retried'), 'retried');
});
