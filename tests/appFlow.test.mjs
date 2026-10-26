import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_FLOW, getAppFlowRedirect, getNextAppFlowRoute } from '../src/flowLogic.ts';

const ready = { onboardingComplete: true, onboardingStep: 4, onboardingVersion: 2, ageConfirmed: true, paywallComplete: true };
const onboarded = { ...ready, paywallComplete: false };
const fresh = { onboardingComplete: false, onboardingStep: 1, onboardingVersion: 2, ageConfirmed: false, paywallComplete: false };
const previousOnboarding = { onboardingComplete: true, onboardingStep: 4, ageConfirmed: true, paywallComplete: true };

test('the canonical first-run sequence is splash, onboarding, then homepage', () => {
  assert.deepEqual(APP_FLOW.map(step => step.name), ['splash', 'onboarding', 'homepage']);
  assert.deepEqual(APP_FLOW.map(step => step.route), [null, '/onboarding', '/']);
});

test('fresh users are routed through onboarding and into the homepage', () => {
  assert.equal(getNextAppFlowRoute('onboarding'), '/');
  assert.equal(getAppFlowRedirect(fresh, 'index'), '/onboarding');
  assert.equal(getAppFlowRedirect(fresh, 'routine'), '/onboarding');
  assert.equal(getAppFlowRedirect(previousOnboarding, 'index'), '/onboarding');
  assert.equal(getAppFlowRedirect(previousOnboarding, 'onboarding'), null);
  assert.equal(getAppFlowRedirect(onboarded, 'index'), null);
  assert.equal(getAppFlowRedirect(onboarded, 'upload'), null);
  assert.equal(getAppFlowRedirect(onboarded, 'paywall'), null);
});

test('completed users can use the homepage and inner app routes without extra redirects', () => {
  assert.equal(getAppFlowRedirect(ready, 'index'), null);
  assert.equal(getAppFlowRedirect(ready, 'upload'), null);
  assert.equal(getAppFlowRedirect(ready, 'routine'), null);
  assert.equal(getAppFlowRedirect(onboarded, 'routine'), null);
});

test('legal and sign-in routes remain available without skipping the first-run flow', () => {
  assert.equal(getAppFlowRedirect(fresh, 'privacy'), null);
  assert.equal(getAppFlowRedirect(fresh, 'terms'), null);
  assert.equal(getAppFlowRedirect(fresh, 'sign-in'), null);
  assert.equal(getAppFlowRedirect(fresh, 'settings'), '/onboarding');
  assert.equal(getAppFlowRedirect(fresh, 'paywall'), '/onboarding');
});
