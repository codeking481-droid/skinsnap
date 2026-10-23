export const PHOTO_ANALYSIS_CONSENT_VERSION = '2026-10-23-groq';

export const PRIVACY_POLICY_DRAFT_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || null;

export function isCurrentPhotoAnalysisConsent(version: string | null): boolean {
  return version === PHOTO_ANALYSIS_CONSENT_VERSION;
}
