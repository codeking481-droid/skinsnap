import { File, Paths } from 'expo-file-system';
import { sanitizeRoutineProgress } from './flowLogic';

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

export async function loadRoutineProgress(scope?: string): Promise<RoutineProgress> {
  try {
    const file = routineFile(scope);
    const raw = file.exists ? await file.text() : null;
    if (!raw) return EMPTY;
    return sanitizeRoutineProgress(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

export async function saveRoutineProgress(progress: RoutineProgress, scope?: string): Promise<void> {
  const raw = JSON.stringify(progress);
  const file = routineFile(scope);
  if (!file.exists) file.create({ intermediates: true });
  await file.write(raw, { encoding: 'utf8' });
}

export async function deleteRoutineProgress(scope: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(scope)) throw new Error('A valid account scope is required to delete routine progress.');
  const file = routineFile(scope);
  if (file.exists) file.delete();
}
