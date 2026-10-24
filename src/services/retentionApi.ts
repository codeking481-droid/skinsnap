import { ensureAuthenticatedSession, getSessionToken, sessionFailureMessage } from './session';
import { parseSavedPreferences, parseCustomRoutine, parseDiaryEntry, type SavedSkinPreferences, type CustomRoutine, type DiaryEntry } from '../retention';

async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const session = await ensureAuthenticatedSession();
  if (!session.valid) throw new Error(sessionFailureMessage(session));
  const token = await getSessionToken();
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!token || !base?.startsWith('https://')) throw new Error('Your secure account could not be verified.');
  let response: Response;
  try {
    response = await fetch(`${base}/v1/${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
      Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw new Error('Connection unavailable. Changes are not confirmed saved. Keep this screen open and retry.'); }
  if (response.status === 401) throw new Error('Your session expired. Please reconnect or sign in.');
  if (response.status === 503) {
    const payload: unknown = await response.json().catch(() => null);
    const code = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).error
      : undefined;
    if (code === 'retention-not-enabled') {
      throw new Error('Diary and saved preferences are not enabled on the service yet. Your existing analysis still works. Your changes were not saved.');
    }
    if (code === 'database-unavailable') {
      throw new Error('The secure data service could not complete this request. Your changes were not confirmed saved. Please retry.');
    }
    if (code === 'database-schema-not-ready') {
      throw new Error('The secure data service is missing a required database update. Your changes were not saved. Please try again later.');
    }
    throw new Error('The service is temporarily unavailable. Your changes were not confirmed saved. Please retry.');
  }
  if (response.status === 404) throw new Error('This app feature is not available on the current server version. Your changes were not saved.');
  if (!response.ok) throw new Error('The change could not be confirmed. Check your input and retry.');
  return response.json();
}
function data(v: unknown): unknown { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).data : undefined; }
export async function loadSkinPreferences(): Promise<SavedSkinPreferences | null> {
  const v = data(await request('preferences')); return v == null ? null : parseSavedPreferences(v);
}
export async function saveSkinPreferences(value: SavedSkinPreferences): Promise<void> { await request('preferences', 'PUT', parseSavedPreferences(value)); }
export async function resetSkinPreferences(): Promise<void> { await request('preferences', 'DELETE'); }
export async function loadCustomRoutine(): Promise<CustomRoutine | null> {
  const v = data(await request('routine/custom'));
  // Legacy generic records are left untouched; the existing AI history remains the fallback.
  if (v == null || (typeof v === 'object' && !Array.isArray(v) && !('version' in v))) return null;
  return parseCustomRoutine(v);
}
export async function saveCustomRoutine(value: CustomRoutine): Promise<void> { await request('routine/custom', 'PUT', parseCustomRoutine(value)); }
export async function deleteCustomRoutine(): Promise<void> { await request('routine/custom', 'DELETE'); }
export async function loadDiary(): Promise<DiaryEntry[]> {
  const v = await request('diary');
  if (!v || typeof v !== 'object' || !Array.isArray((v as Record<string, unknown>).items)) throw new Error('Diary response is invalid.');
  return ((v as { items: unknown[] }).items).map(parseDiaryEntry);
}
export async function saveDiary(value: DiaryEntry): Promise<void> { await request('diary', 'PUT', parseDiaryEntry(value)); }
export async function deleteDiary(date: string): Promise<void> { await request(`diary/${encodeURIComponent(date)}`, 'DELETE'); }
export async function loadDiaryEntry(date: string): Promise<DiaryEntry | null> {
  const v = await request(`diary?date=${encodeURIComponent(date)}`);
  if (!v || typeof v !== 'object' || !Array.isArray((v as Record<string, unknown>).items)) throw new Error('Diary response is invalid.');
  const items = (v as { items: unknown[] }).items;
  return items.length ? parseDiaryEntry(items[0]) : null;
}
