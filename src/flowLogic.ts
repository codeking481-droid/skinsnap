import type { OnboardingStep, Preferences } from './preferences';
import type { RoutineProgress } from './routineStorage';

export type AppFlowStage = 'splash' | 'onboarding' | 'homepage';
export type AppFlowRoute = '/onboarding' | '/';
export const CURRENT_ONBOARDING_VERSION = 2;
export const APP_FLOW: readonly { name: AppFlowStage; route: AppFlowRoute | null }[] = [
  { name: 'splash', route: null },
  { name: 'onboarding', route: '/onboarding' },
  { name: 'homepage', route: '/' },
];
const FLOW_EXEMPT_ROUTES = new Set(['privacy', 'terms', 'sign-in']);

export function getAppFlowRoute(stage: AppFlowStage): AppFlowRoute {
  const route = APP_FLOW.find(item => item.name === stage)?.route;
  if (!route) throw new Error(`The ${stage} stage does not have an app route.`);
  return route;
}

export function getNextAppFlowRoute(stage: AppFlowStage): AppFlowRoute {
  const index = APP_FLOW.findIndex(item => item.name === stage);
  const nextRoute = APP_FLOW[index + 1]?.route;
  if (!nextRoute) throw new Error(`The ${stage} stage has no following app route.`);
  return nextRoute;
}

export function getAppFlowRedirect(
  preferences: Pick<Preferences, 'onboardingComplete' | 'ageConfirmed'> & { onboardingVersion?: number },
  route: string,
): AppFlowRoute | null {
  if (FLOW_EXEMPT_ROUTES.has(route)) return null;
  if (
    !preferences.onboardingComplete
    || !preferences.ageConfirmed
    || typeof preferences.onboardingVersion !== 'number'
    || preferences.onboardingVersion < CURRENT_ONBOARDING_VERSION
  ) {
    return route === 'onboarding' ? null : getAppFlowRoute('onboarding');
  }
  return null;
}

export function getOnboardingResumeStep(value: unknown): OnboardingStep {
  return value === 2 || value === 3 || value === 4 ? value : 1;
}

export function sanitizeRoutineProgress(value: unknown): RoutineProgress {
  const empty: RoutineProgress = { checkedSteps: [], completedDays: [] };
  if (!value || typeof value !== 'object') return empty;
  const data = value as Record<string, unknown>;
  const validStep = (item: unknown): item is string =>
    typeof item === 'string'
    && (/^(Morning|Evening)-[1-8]$/.test(item) || /^step-[a-zA-Z0-9-]{1,80}$/.test(item));
  const validDates = (item: unknown): item is string => {
    if (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item)) return false;
    const date = new Date(`${item}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === item;
  };
  return {
    checkedSteps: Array.isArray(data.checkedSteps) ? [...new Set(data.checkedSteps.filter(validStep))] : [],
    completedDays: Array.isArray(data.completedDays) ? [...new Set(data.completedDays.filter(validDates))] : [],
  };
}

export function startScanTicker(
  onProgress: (progress: number) => void,
  onComplete: () => void,
  intervalMs = 55,
  scheduler: Pick<typeof globalThis, 'setInterval' | 'clearInterval'> = globalThis,
): () => void {
  let progress = 0;
  let active = true;
  let completed = false;
  const timer = scheduler.setInterval(() => {
    if (!active || completed) return;
    progress = Math.min(progress + 1, 100);
    onProgress(progress);
    if (progress === 100) {
      completed = true;
      scheduler.clearInterval(timer);
      onComplete();
    }
  }, intervalMs);
  return () => {
    active = false;
    scheduler.clearInterval(timer);
  };
}
