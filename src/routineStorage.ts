import { File, Paths } from 'expo-file-system';
import { sanitizeRoutineProgress } from './flowLogic';

export type RoutineProgress = {
  checkedSteps: string[];
  completedDays: string[];
};

const STORAGE_KEY = 'skinsnap-routine-progress-v1';
const EMPTY: RoutineProgress = { checkedSteps: [], completedDays: [] };
const routineFile = () => new File(Paths.document, STORAGE_KEY + '.json');

export async function loadRoutineProgress(): Promise<RoutineProgress> {
  try {
    const file = routineFile();
    const raw = file.exists ? await file.text() : null;
    if (!raw) return EMPTY;
    return sanitizeRoutineProgress(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

export async function saveRoutineProgress(progress: RoutineProgress): Promise<void> {
  const raw = JSON.stringify(progress);
  const file = routineFile();
  if (!file.exists) file.create({ intermediates: true });
  await file.write(raw, { encoding: 'utf8' });
}
