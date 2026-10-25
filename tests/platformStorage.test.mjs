import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserValue, removeBrowserValue, writeBrowserValue } from '../src/platformStorage.ts';

test('browser storage writes, reads, and removes values by key', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });

  try {
    assert.equal(readBrowserValue('preferences'), null);
    writeBrowserValue('preferences', '{"onboardingStep":2}');
    assert.equal(readBrowserValue('preferences'), '{"onboardingStep":2}');
    removeBrowserValue('preferences');
    assert.equal(readBrowserValue('preferences'), null);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage });
  }
});
