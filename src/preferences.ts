import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { CURRENT_ONBOARDING_VERSION, getOnboardingResumeStep } from './flowLogic';
import { isAdultEligibilityConfirmed } from './privacy';
import { readBrowserValue, writeBrowserValue } from './platformStorage';

const KEY = 'skinsnap-preferences-v1';
export type OnboardingStep = 1 | 2 | 3 | 4;
export type SkinType = 'oily' | 'dry' | 'combination' | 'sensitive' | 'normal' | 'unsure';
export type Preferences = { onboardingComplete: boolean; onboardingStep: OnboardingStep; onboardingVersion: number; ageConfirmed: boolean; paywallComplete: boolean; skinType: SkinType | null };
const preferencesFile = () => new File(Paths.document, `${KEY}.json`);
let cachedPreferences: Preferences | null = null;
let preferenceLoad: Promise<Preferences> | null = null;
const preferenceListeners = new Set<(value: Preferences) => void>();

export function subscribePreferences(listener: (value: Preferences) => void): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return { onboardingComplete: false, onboardingStep: 1, onboardingVersion: CURRENT_ONBOARDING_VERSION, ageConfirmed: false, paywallComplete: false, skinType: null };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved app preferences could not be read because the stored data is invalid.');
  }
  const data = value as Record<string, unknown>;
  const skinTypes: SkinType[] = ['oily', 'dry', 'combination', 'sensitive', 'normal', 'unsure'];
  const onboardingVersion = typeof data.onboardingVersion === 'number' && Number.isInteger(data.onboardingVersion)
    ? Math.max(0, data.onboardingVersion)
    : 0;
  return {
    onboardingComplete: data.onboardingComplete === true,
    onboardingStep: onboardingVersion < CURRENT_ONBOARDING_VERSION ? 1 : getOnboardingResumeStep(data.onboardingStep),
    onboardingVersion,
    ageConfirmed: isAdultEligibilityConfirmed(data.ageConfirmed),
    paywallComplete: data.paywallComplete === true,
    skinType: skinTypes.includes(data.skinType as SkinType) ? data.skinType as SkinType : null,
  };
}

export async function loadPreferences(): Promise<Preferences> {
  if (cachedPreferences) return cachedPreferences;
  if (preferenceLoad) return preferenceLoad;
  preferenceLoad = readPreferences();
  try {
    cachedPreferences = await preferenceLoad;
    return cachedPreferences;
  } finally {
    preferenceLoad = null;
  }
}

async function readPreferences(): Promise<Preferences> {
  if (Platform.OS === 'web') return parsePreferences(readBrowserValue(KEY));
  const file = preferencesFile();
  const raw = file.exists ? await file.text() : null;
  return parsePreferences(raw);
}

async function savePreferences(value: Preferences): Promise<void> {
  const raw = JSON.stringify(value);
  if (Platform.OS === 'web') {
    writeBrowserValue(KEY, raw);
  } else {
    const file = preferencesFile();
    if (!file.exists) file.create({ intermediates: true });
    await file.write(raw, { encoding: 'utf8' });
  }
  cachedPreferences = value;
  for (const listener of preferenceListeners) listener(value);
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const preferences = await loadPreferences();
  return preferences.onboardingComplete && preferences.ageConfirmed;
}

export async function saveOnboardingStep(onboardingStep: OnboardingStep): Promise<void> {
  const preferences = await loadPreferences();
  await savePreferences({ ...preferences, onboardingComplete: false, onboardingStep, onboardingVersion: CURRENT_ONBOARDING_VERSION });
}

export async function saveOnboardingSkinType(skinType: SkinType): Promise<void> {
  const preferences = await loadPreferences();
  await savePreferences({ ...preferences, skinType });
}

export async function markOnboardingComplete(ageConfirmed: boolean): Promise<void> {
  if (!isAdultEligibilityConfirmed(ageConfirmed)) {
    throw new Error('SkinSnap is available only to people aged 18 or older.');
  }
  const preferences = await loadPreferences();
  await savePreferences({ ...preferences, onboardingComplete: true, onboardingStep: 4, onboardingVersion: CURRENT_ONBOARDING_VERSION, ageConfirmed: true, paywallComplete: false });
}

export async function restartOnboarding(): Promise<void> {
  const preferences = await loadPreferences();
  await savePreferences({
    ...preferences,
    onboardingComplete: false,
    onboardingStep: 1,
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
  });
}

export async function markPaywallComplete(): Promise<void> {
  const preferences = await loadPreferences();
  if (!preferences.onboardingComplete || !preferences.ageConfirmed) {
    throw new Error('Complete onboarding and age confirmation before finishing the subscription offer.');
  }
  await savePreferences({ ...preferences, paywallComplete: true });
}
