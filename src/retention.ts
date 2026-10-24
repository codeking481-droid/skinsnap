import { parseAnalysisPreferences, type AnalysisPreferences } from './analysisQuality.ts';

export const FEELINGS = ['Comfortable', 'Dry-feeling', 'Oily-feeling', 'Tight-feeling', 'Sensitive-feeling', 'Not sure'] as const;
export const COSMETIC_CONCERNS = ['Shine', 'Dry-looking areas', 'Texture', 'Uneven-looking tone', 'Blemish-like marks'] as const;
export type SavedSkinPreferences = { consent: true; preferences: AnalysisPreferences };
export type CustomStep = { id: string; name: string; description: string; period: 'Morning' | 'Evening'; days: number[] };
export type CustomRoutine = { version: 1; sourceResultId?: string; steps: CustomStep[] };
export type DiaryEntry = {
  date: string; timeZone: string; feeling?: typeof FEELINGS[number]; note: string;
  morningCompleted: boolean; eveningCompleted: boolean; concerns: string[]; products: string;
};
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function string(v: unknown, max: number): v is string { return typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v); }
export function isLocalDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
export function parseSavedPreferences(v: unknown): SavedSkinPreferences {
  if (!record(v) || v.consent !== true || Object.keys(v).some(k => !['consent', 'preferences'].includes(k))) throw new Error('Confirm permission to save your preferences.');
  return { consent: true, preferences: parseAnalysisPreferences(v.preferences) };
}
export function parseCustomRoutine(v: unknown): CustomRoutine {
  if (!record(v) || v.version !== 1 || !Array.isArray(v.steps) || v.steps.length > 24
    || (v.sourceResultId !== undefined && !string(v.sourceResultId, 128))) throw new Error('Routine format is invalid.');
  const ids = new Set<string>();
  const steps = v.steps.map(item => {
    if (!record(item) || typeof item.id !== 'string' || !/^step-[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)
      || !string(item.name, 80) || !item.name.trim() || !string(item.description, 400)
      || !['Morning', 'Evening'].includes(String(item.period)) || !Array.isArray(item.days)
      || item.days.length < 1 || item.days.length > 7 || item.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Check step names, descriptions and scheduled days.');
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), description: item.description.trim(), period: item.period as CustomStep['period'], days: [...new Set(item.days as number[])] };
  });
  return { version: 1, ...(v.sourceResultId ? { sourceResultId: v.sourceResultId as string } : {}), steps };
}
export function parseDiaryEntry(v: unknown): DiaryEntry {
  if (!record(v) || !isLocalDate(v.date) || !string(v.timeZone, 80) || !v.timeZone
    || (v.feeling !== undefined && !(FEELINGS as readonly unknown[]).includes(v.feeling))
    || !string(v.note, 600) || !string(v.products, 400) || typeof v.morningCompleted !== 'boolean' || typeof v.eveningCompleted !== 'boolean'
    || !Array.isArray(v.concerns) || v.concerns.length > 5 || v.concerns.some(c => !(COSMETIC_CONCERNS as readonly unknown[]).includes(c))) throw new Error('Check the diary date and entry fields.');
  try { new Intl.DateTimeFormat('en', { timeZone: v.timeZone }); } catch { throw new Error('Choose a valid time zone.'); }
  return { date: v.date, timeZone: v.timeZone, ...(v.feeling ? { feeling: v.feeling as DiaryEntry['feeling'] } : {}), note: v.note.trim(),
    products: v.products.trim(), morningCompleted: v.morningCompleted, eveningCompleted: v.eveningCompleted, concerns: [...new Set(v.concerns as string[])] };
}
export function routineFromAnalysis(result: { resultId: string; morningRoutine: string[]; eveningRoutine: string[] }): CustomRoutine {
  return { version: 1, sourceResultId: result.resultId, steps: (['Morning', 'Evening'] as const).flatMap(period =>
    (period === 'Morning' ? result.morningRoutine : result.eveningRoutine).map((text, index) => ({
      id: `step-${period.toLowerCase()}-${index + 1}`, name: `${period} step ${index + 1}`, description: text,
      period, days: [0, 1, 2, 3, 4, 5, 6],
    }))) };
}
export function scheduledSteps(routine: CustomRoutine, day: number, period?: CustomStep['period']): CustomStep[] {
  return routine.steps.filter(step => step.days.includes(day) && (!period || step.period === period));
}
export function diaryWeekSummary(entries: DiaryEntry[], date: string): { entries: number; morning: number; evening: number } {
  const today = new Date(`${date}T12:00:00Z`);
  const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const start = monday.toISOString().slice(0, 10);
  const week = [...new Map(entries.map(e => [e.date, e])).values()].filter(e => e.date >= start && e.date <= date);
  return { entries: week.length, morning: week.filter(e => e.morningCompleted).length, evening: week.filter(e => e.eveningCompleted).length };
}
