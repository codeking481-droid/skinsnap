import { File, Paths } from 'expo-file-system';
import { getOnboardingResumeStep } from './flowLogic';

const KEY = 'skinsnap-preferences-v1';
export type OnboardingStep = 1 | 2 | 3;
export type Preferences = { onboardingComplete: boolean; onboardingStep: OnboardingStep };
const preferencesFile = () => new File(Paths.document, `${KEY}.json`);

function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { onboardingComplete: false, onboardingStep: 1 };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return { onboardingComplete: false, onboardingStep: 1 };
  const data = value as Record<string, unknown>;
  return {
    onboardingComplete: data.onboardingComplete === true,
    onboardingStep: getOnboardingResumeStep(data.onboardingStep),
  };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const file = preferencesFile();
    const raw = file.exists ? await file.text() : null;
    return parsePreferences(raw);
  } catch {
    return { onboardingComplete: false, onboardingStep: 1 };
  }
}

async function savePreferences(value: Preferences): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    const file = preferencesFile();
    if (!file.exists) file.create({ intermediates: true });
    await file.write(raw, { encoding: 'utf8' });
  } catch {
    // Keep the current session usable when local preferences cannot be written.
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await loadPreferences()).onboardingComplete;
}

export async function saveOnboardingStep(onboardingStep: OnboardingStep): Promise<void> {
  await savePreferences({ onboardingComplete: false, onboardingStep });
}

export async function markOnboardingComplete(): Promise<void> {
  await savePreferences({ onboardingComplete: true, onboardingStep: 3 });
}
