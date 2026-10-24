import { File, Paths } from 'expo-file-system';
import { getOnboardingResumeStep } from './flowLogic';
import { isAdultEligibilityConfirmed } from './privacy';

const KEY = 'skinsnap-preferences-v1';
export type OnboardingStep = 1 | 2 | 3;
export type Preferences = { onboardingComplete: boolean; onboardingStep: OnboardingStep; ageConfirmed: boolean };
const preferencesFile = () => new File(Paths.document, `${KEY}.json`);

function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { onboardingComplete: false, onboardingStep: 1, ageConfirmed: false };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return { onboardingComplete: false, onboardingStep: 1, ageConfirmed: false };
  const data = value as Record<string, unknown>;
  return {
    onboardingComplete: data.onboardingComplete === true,
    onboardingStep: getOnboardingResumeStep(data.onboardingStep),
    ageConfirmed: isAdultEligibilityConfirmed(data.ageConfirmed),
  };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const file = preferencesFile();
    const raw = file.exists ? await file.text() : null;
    return parsePreferences(raw);
  } catch {
    return { onboardingComplete: false, onboardingStep: 1, ageConfirmed: false };
  }
}

async function savePreferences(value: Preferences): Promise<void> {
  const raw = JSON.stringify(value);
  const file = preferencesFile();
  if (!file.exists) file.create({ intermediates: true });
  await file.write(raw, { encoding: 'utf8' });
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const preferences = await loadPreferences();
  return preferences.onboardingComplete && preferences.ageConfirmed;
}

export async function saveOnboardingStep(onboardingStep: OnboardingStep): Promise<void> {
  const preferences = await loadPreferences();
  await savePreferences({ ...preferences, onboardingComplete: false, onboardingStep });
}

export async function markOnboardingComplete(ageConfirmed: boolean): Promise<void> {
  if (!isAdultEligibilityConfirmed(ageConfirmed)) {
    throw new Error('SkinSnap is available only to people aged 18 or older.');
  }
  await savePreferences({ onboardingComplete: true, onboardingStep: 3, ageConfirmed: true });
}
