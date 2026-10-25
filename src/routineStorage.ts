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
const EMPTY: RoutineProgress = { checkedSteps: [], completedDays: [] };
function routineFile(scope?: string) {
  return new File(Paths.document, `${routineStorageKey(scope)}.json`);
}

function routineStorageKey(scope?: string): string {
  const safeScope = scope && /^[0-9a-f-]{36}$/i.test(scope) ? scope.toLowerCase() : null;
  return safeScope ? `${STORAGE_KEY}-${safeScope}` : STORAGE_KEY;
}

export async function loadRoutineProgress(scope?: string, routineId?: string): Promise<RoutineProgress> {
  try {
    const raw = Platform.OS === 'web'
      ? readBrowserValue(routineStorageKey(scope))
      : await readRoutineFile(scope);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    const progress = sanitizeRoutineProgress(data);
    return { ...progress, checkedSteps: restoreCheckedSteps(progress.checkedSteps, data.checkedOn, localDayKey(), data.routineId, routineId) };
  } catch {
    return EMPTY;
  }
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
