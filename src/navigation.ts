import { router } from 'expo-router';

export type BackFallback = '/' | '/upload' | '/analysis' | '/results' | '/details' | '/recommendations' | '/routine' | '/progress';

export function backOrReplace(fallback: BackFallback): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
