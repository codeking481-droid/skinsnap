import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { sanitizeRoutineProgress } from './flowLogic';
import { localDayKey, restoreCheckedSteps } from './routineProgressState';
import { readBrowserValue, removeBrowserValue, writeBrowserValue } from './platformStorage';

export type RoutineProgress = {
  checkedSteps: string[];
  completedDays: string[];
};

const STORAGE_KEY = 'skinsnap-routine-progress-v1';
function routineFile(scope?: string) {
  return new File(Paths.document, `${routineStorageKey(scope)}.json`);
}

function routineStorageKey(scope?: string): string {
  const safeScope = scope && /^[0-9a-f-]{36}$/i.test(scope) ? scope.toLowerCase() : null;
  return safeScope ? `${STORAGE_KEY}-${safeScope}` : STORAGE_KEY;
}

export async function loadRoutineProgress(scope?: string, routineId?: string): Promise<RoutineProgress> {
  const raw = Platform.OS === 'web'
    ? readBrowserValue(routineStorageKey(scope))
    : await readRoutineFile(scope);
  if (raw === null) return { checkedSteps: [], completedDays: [] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Saved routine progress could not be read because the stored data is invalid.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Saved routine progress could not be read because the stored data is invalid.');
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.checkedSteps) || !Array.isArray(record.completedDays)) {
    throw new Error('Saved routine progress could not be read because required progress data is missing.');
  }
  const progress = sanitizeRoutineProgress(record);
  if (progress.checkedSteps.length !== new Set(record.checkedSteps).size
    || progress.completedDays.length !== new Set(record.completedDays).size) {
    throw new Error('Saved routine progress contains unsupported entries and was not changed.');
  }
  return {
    ...progress,
    checkedSteps: restoreCheckedSteps(progress.checkedSteps, record.checkedOn, localDayKey(), record.routineId, routineId),
  };
}

export async function saveRoutineProgress(progress: RoutineProgress, scope?: string, routineId?: string): Promise<void> {
  const raw = JSON.stringify({ ...progress, checkedOn: localDayKey(), routineId });
  if (Platform.OS === 'web') {
    writeBrowserValue(routineStorageKey(scope), raw);
    return;
  }
  const file = routineFile(scope);
  if (!file.exists) file.create({ intermediates: true });
  await file.write(raw, { encoding: 'utf8' });
}

export async function deleteRoutineProgress(scope: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error('A valid account scope is required to delete routine progress.');
  if (Platform.OS === 'web') {
    removeBrowserValue(routineStorageKey(scope));
    return;
  }
  const file = routineFile(scope);
  if (file.exists) file.delete();
}

async function readRoutineFile(scope?: string): Promise<string | null> {
  const file = routineFile(scope);
  return file.exists ? file.text() : null;
}
