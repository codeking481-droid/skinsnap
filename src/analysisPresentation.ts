import type { AnalysisPreferences } from './analysisQuality';
import type { CustomRoutine } from './retention';
import type { SkinAnalysisResult, SkinObservation } from './services/analysisApi';
import { buildRoutineSteps } from './routinePresentation.ts';

const CONCERN_LABELS: Record<string, string> = {
  shine: 'Managing visible surface shine',
  texture: 'Appearance of skin texture',
  'uneven-tone': 'Appearance of uneven-looking tone',
  'blemish-like-marks': 'Visible blemish-like marks',
  'dry-looking-areas': 'Dry-looking areas',
  'general-care': 'Simple daily care',
};

const CATEGORY_LABELS: Record<string, string> = {
  'visible-shine': 'Visible shine',
  'apparent-dryness': 'Dry-looking areas',
  'uneven-looking-tone': 'Uneven-looking tone',
  'visible-blemishes': 'Visible blemishes',
  'general-texture': 'Skin texture',
  'natural-pores': 'Appearance of pores',
  'color-variation': 'Visible colour variation',
  'overall-finish': 'Overall appearance',
};

export type FocusItem = { label: string; source: 'goal' | 'observation' };
export type RoutinePreviewStep = { id: string; title: string; completed: boolean };
export type RoutinePreview = { morning: RoutinePreviewStep[]; evening: RoutinePreviewStep[] };
export const ANALYSIS_ROUTINE_ROUTE = '/routine' as const;

export type PresentedObservation = {
  title: string;
  observation: string;
  location?: string;
  visibility?: string;
  limitation?: string;
  explanation?: string;
  suggestion?: string;
};

export function presentObservation(observation: SkinObservation): PresentedObservation {
  return {
    title: observation.title?.trim() || CATEGORY_LABELS[observation.category] || 'Visible skin feature',
    observation: observation.observation,
    ...(observation.location ? { location: observation.location } : {}),
    ...(observation.visibility
      ? { visibility: observation.visibility === 'clearly-visible' ? 'Visible' : 'Possible' }
      : {}),
    ...(observation.limitation ? { limitation: observation.limitation } : {}),
    ...(observation.whyItMatters ? { explanation: observation.whyItMatters } : {}),
    ...(observation.practicalSuggestion ? { suggestion: observation.practicalSuggestion } : {}),
  };
}

export function noObservationMessage(imageQuality: SkinAnalysisResult['imageQuality']): string {
  return imageQuality === 'limited'
    ? 'Your photo did not provide enough detail for specific observations. You can try another photo in soft, even lighting.'
    : 'No distinct cosmetic features could be reliably described. This report does not add guesses.';
}

export function buildSkinFocus(preferences: AnalysisPreferences, observations: readonly SkinObservation[]): FocusItem[] {
  const focus: FocusItem[] = [];
  const concern = preferences.concern;
  if (concern && CONCERN_LABELS[concern]) focus.push({ label: CONCERN_LABELS[concern], source: 'goal' });
  for (const observation of observations) {
    const label = observation.title?.trim() || CATEGORY_LABELS[observation.category] || 'Visible skin feature';
    if (!focus.some(item => item.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      focus.push({ label, source: 'observation' });
    }
    if (focus.length >= 4) break;
  }
  return focus;
}

export function buildRoutinePreview(
  result: SkinAnalysisResult,
  custom: CustomRoutine | null,
  checkedSteps: readonly string[],
  day: number,
): RoutinePreview | null {
  if (custom) {
    const steps = custom.steps.filter(step => step.days.includes(day));
    if (!steps.length) return null;
    return {
      morning: steps.filter(step => step.period === 'Morning').slice(0, 3).map(step => ({
        id: step.id,
        title: step.name,
        completed: checkedSteps.includes(step.id),
      })),
      evening: steps.filter(step => step.period === 'Evening').slice(0, 3).map(step => ({
        id: step.id,
        title: step.name,
        completed: checkedSteps.includes(step.id),
      })),
    };
  }
  if (!result.morningRoutine.length && !result.eveningRoutine.length) return null;
  return {
    morning: buildRoutineSteps(result.morningRoutine, 'Morning').slice(0, 3).map(step => ({
      id: step.id,
      title: step.title,
      completed: checkedSteps.includes(step.id),
    })),
    evening: buildRoutineSteps(result.eveningRoutine, 'Evening').slice(0, 3).map(step => ({
      id: step.id,
      title: step.title,
      completed: checkedSteps.includes(step.id),
    })),
  };
}

export function shouldAnimateSnapshot(reducedMotion: boolean): boolean {
  return !reducedMotion;
}
