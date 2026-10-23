import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SkinAnalysisResult } from './services/analysisApi';
import type { AnalysisPreferences } from './analysisQuality';
import { PHOTO_ANALYSIS_CONSENT_VERSION, isCurrentPhotoAnalysisConsent } from './privacy';

type PhotoState = {
  analysisPreferences: AnalysisPreferences;
  setAnalysisPreferences: (preferences: AnalysisPreferences) => void;
  photoUri: string | null;
  setPhotoUri: (uri: string | null) => void;
  photoUploadConsent: boolean;
  photoUploadConsentVersion: string | null;
  setPhotoUploadConsent: (consent: boolean) => void;
  analysisResult: SkinAnalysisResult | null;
  setAnalysisResult: (result: SkinAnalysisResult | null) => void;
};
const PhotoContext = createContext<PhotoState | null>(null);

export function PhotoProvider({ children }: { children: ReactNode }) {
  const [analysisPreferences, setAnalysisPreferences] = useState<AnalysisPreferences>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploadConsentVersion, setPhotoUploadConsentVersion] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SkinAnalysisResult | null>(null);
  const photoUploadConsent = isCurrentPhotoAnalysisConsent(photoUploadConsentVersion);
  const setPhotoUploadConsent = (consent: boolean) => {
    setPhotoUploadConsentVersion(consent ? PHOTO_ANALYSIS_CONSENT_VERSION : null);
  };
  const value = useMemo(() => ({
    analysisPreferences,
    setAnalysisPreferences,
    photoUri,
    setPhotoUri,
    photoUploadConsent,
    photoUploadConsentVersion,
    setPhotoUploadConsent,
    analysisResult,
    setAnalysisResult,
  }), [analysisPreferences, analysisResult, photoUri, photoUploadConsent, photoUploadConsentVersion]);
  return <PhotoContext.Provider value={value}>{children}</PhotoContext.Provider>;
}

export function usePhoto() {
  const state = useContext(PhotoContext);
  if (!state) throw new Error('usePhoto must be used inside PhotoProvider');
  return state;
}
