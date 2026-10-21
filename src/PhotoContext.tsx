import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SkinAnalysisResult } from './services/analysisApi';

type PhotoState = {
  photoUri: string | null;
  setPhotoUri: (uri: string | null) => void;
  photoUploadConsent: boolean;
  setPhotoUploadConsent: (consent: boolean) => void;
  analysisResult: SkinAnalysisResult | null;
  setAnalysisResult: (result: SkinAnalysisResult | null) => void;
};
const PhotoContext = createContext<PhotoState | null>(null);

export function PhotoProvider({ children }: { children: ReactNode }) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploadConsent, setPhotoUploadConsent] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<SkinAnalysisResult | null>(null);
  const value = useMemo(() => ({
    photoUri,
    setPhotoUri,
    photoUploadConsent,
    setPhotoUploadConsent,
    analysisResult,
    setAnalysisResult,
  }), [analysisResult, photoUri, photoUploadConsent]);
  return <PhotoContext.Provider value={value}>{children}</PhotoContext.Provider>;
}

export function usePhoto() {
  const state = useContext(PhotoContext);
  if (!state) throw new Error('usePhoto must be used inside PhotoProvider');
  return state;
}
