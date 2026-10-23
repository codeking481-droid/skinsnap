import type { OnboardingStep } from './preferences';
import type { RoutineProgress } from './routineStorage';

export type EntryDestination = '/' | '/upload';

export function getEntryDestination(onboardingComplete: boolean): EntryDestination {
  return onboardingComplete ? '/upload' : '/';
}

export function getOnboardingResumeStep(value: unknown): OnboardingStep {
  return value === 2 || value === 3 ? value : 1;
}

export function sanitizeRoutineProgress(value: unknown): RoutineProgress {
  const empty: RoutineProgress = { checkedSteps: [], completedDays: [] };
  if (!value || typeof value !== 'object') return empty;
  const data = value as Record<string, unknown>;
  const legacySteps = new Set([
    'Morning-Cleanser', 'Morning-Toner', 'Morning-Serum', 'Morning-Moisturizer', 'Morning-Sunscreen',
    'Evening-Cleanser', 'Evening-Toner', 'Evening-Serum', 'Evening-Moisturizer',
  ]);
  const validStep = (item: unknown): item is string =>
    typeof item === 'string'
    && (legacySteps.has(item) || /^(Morning|Evening)-[1-8]$/.test(item));
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
