import { File, Paths } from 'expo-file-system';
import { sanitizeRoutineProgress } from './flowLogic';
import { localDayKey, restoreCheckedSteps } from './routineProgressState';

export type RoutineProgress = {
  checkedSteps: string[];
  completedDays: string[];
};

const STORAGE_KEY = 'skinsnap-routine-progress-v1';
const EMPTY: RoutineProgress = { checkedSteps: [], completedDays: [] };
function routineFile(scope?: string) {
  const safeScope = scope && /^[0-9a-f-]{36}$/i.test(scope) ? scope.toLowerCase() : null;
  return new File(Paths.document, safeScope ? `${STORAGE_KEY}-${safeScope}.json` : `${STORAGE_KEY}.json`);
}

export async function loadRoutineProgress(scope?: string, routineId?: string): Promise<RoutineProgress> {
  try {
    const file = routineFile(scope);
    const raw = file.exists ? await file.text() : null;
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
  const file = routineFile(scope);
  if (!file.exists) file.create({ intermediates: true });
  await file.write(raw, { encoding: 'utf8' });
}

export async function deleteRoutineProgress(scope: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error('A valid account scope is required to delete routine progress.');
  const file = routineFile(scope);
  if (file.exists) file.delete();
}
