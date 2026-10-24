import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SkinAnalysisResult } from './services/analysisApi';
import type { AnalysisPreferences } from './analysisQuality';
import { PHOTO_ANALYSIS_CONSENT_VERSION, isCurrentPhotoAnalysisConsent } from './privacy';

type PhotoState = {
  analysisRequestKey: string | null;
  acceptAnalysisResult: (key: string, result: SkinAnalysisResult) => boolean;
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
  const [photoUri, updatePhotoUri] = useState<string | null>(null);
  const [analysisRequestKey, setAnalysisRequestKey] = useState<string | null>(null);
  const selectedRequestKey = useRef<string | null>(null);
  const setPhotoUri = useCallback((uri: string | null) => {
    updatePhotoUri(uri);
    const key = uri ? `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
    selectedRequestKey.current = key;
    setAnalysisRequestKey(key);
  }, []);
  const [photoUploadConsentVersion, setPhotoUploadConsentVersion] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SkinAnalysisResult | null>(null);
  const acceptAnalysisResult = useCallback((key: string, result: SkinAnalysisResult) => {
    if (selectedRequestKey.current !== key) return false;
    setAnalysisResult(result);
    return true;
  }, []);
  const photoUploadConsent = isCurrentPhotoAnalysisConsent(photoUploadConsentVersion);
  const setPhotoUploadConsent = (consent: boolean) => {
    setPhotoUploadConsentVersion(consent ? PHOTO_ANALYSIS_CONSENT_VERSION : null);
  };
  const value = useMemo(() => ({
    analysisRequestKey,
    acceptAnalysisResult,
    analysisPreferences,
    setAnalysisPreferences,
    photoUri,
    setPhotoUri,
    photoUploadConsent,
    photoUploadConsentVersion,
    setPhotoUploadConsent,
    analysisResult,
    setAnalysisResult,
  }), [acceptAnalysisResult, analysisRequestKey, analysisPreferences, analysisResult, photoUri, photoUploadConsent, photoUploadConsentVersion, setPhotoUri]);
  return <PhotoContext.Provider value={value}>{children}</PhotoContext.Provider>;
}

export function usePhoto() {
  const state = useContext(PhotoContext);
  if (!state) throw new Error('usePhoto must be used inside PhotoProvider');
  return state;
}
