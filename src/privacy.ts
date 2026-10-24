export const PHOTO_ANALYSIS_CONSENT_VERSION = '2026-10-23-groq-v2';
export const MINIMUM_USER_AGE = 18;

export function getVerifiedPolicyUrl(value: string | undefined, verified: boolean): string | null {
  if (!verified || !value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const legalUrlsVerified = process.env.EXPO_PUBLIC_LEGAL_URLS_VERIFIED === 'true';
export const PUBLISHED_PRIVACY_POLICY_URL = getVerifiedPolicyUrl(process.env.EXPO_PUBLIC_PRIVACY_URL, legalUrlsVerified);
export const PUBLISHED_TERMS_URL = getVerifiedPolicyUrl(process.env.EXPO_PUBLIC_TERMS_URL, legalUrlsVerified);

export function isCurrentPhotoAnalysisConsent(version: string | null): boolean {
  return version === PHOTO_ANALYSIS_CONSENT_VERSION;
}

export function isAdultEligibilityConfirmed(value: unknown): boolean {
  return value === true;
}

export function shouldRequireAgeConfirmation(ageConfirmed: boolean, route: string): boolean {
  if (ageConfirmed) return false;
  return !['index', 'onboarding', 'privacy', 'terms', 'sign-in'].includes(route);
}
