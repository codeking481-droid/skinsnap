import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentAnalysisEnabled } from '../src/releasePolicy.ts';
test('a release build cannot enable admin analysis through a public environment flag', () => {
  assert.equal(developmentAnalysisEnabled(false, 'true'), false);
  assert.equal(developmentAnalysisEnabled(false, 'false'), false);
  assert.equal(developmentAnalysisEnabled(true, 'true'), true);
  assert.equal(developmentAnalysisEnabled(true, undefined), false);
});
