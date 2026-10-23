import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnosticRequestId,
  fetchFailureCode,
  retryAfterSeconds,
  safeServerErrorCode,
} from '../src/analysisDiagnostics.ts';

test('diagnostic request identifiers are short and contain no unsafe characters', () => {
  assert.equal(diagnosticRequestId('analysis-1729590000-a1b2c3d4'), '000-a1b2c3d4');
  assert.equal(diagnosticRequestId('private data \r\n'), 'privatedata');
  assert.equal(diagnosticRequestId('***'), 'unavailable');
});

test('network diagnostics classify request failures without exposing raw error messages', () => {
  const networkError = new TypeError('Network request failed for private-photo-uri');
  assert.deepEqual(fetchFailureCode(networkError, false), {
    code: 'network-request-failed',
    errorName: 'TypeError',
    failureCause: 'network',
  });
  assert.deepEqual(fetchFailureCode(new Error('secret value'), true), {
    code: 'request-timeout',
    errorName: 'AbortError',
    failureCause: 'timeout',
  });
  assert.deepEqual(fetchFailureCode(new Error('secret value'), false), {
    code: 'request-failed',
    errorName: 'Error',
    failureCause: 'unknown',
  });
  assert.deepEqual(fetchFailureCode(new Error('Unable to resolve host private-name.example'), false), {
    code: 'request-failed',
    errorName: 'Error',
    failureCause: 'dns',
  });
});

test('server diagnostics retain only machine-readable error codes', () => {
  assert.equal(safeServerErrorCode('development-test-not-authorized'), 'development-test-not-authorized');
  assert.equal(safeServerErrorCode('private details: token=secret'), null);
});

test('Retry-After accepts valid seconds and HTTP dates but ignores malformed headers', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(retryAfterSeconds('90', now), 90);
  assert.equal(retryAfterSeconds('Thu, 22 Oct 2026 12:01:30 GMT', now), 90);
  assert.equal(retryAfterSeconds('Thu, 22 Oct 2026 11:59:00 GMT', now), 0);
  assert.equal(retryAfterSeconds('not-a-retry-time', now), null);
  assert.equal(retryAfterSeconds(null, now), null);
});
