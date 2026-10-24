import { loadAnalysisHistory } from './authApi';
import { loadCustomRoutine } from './retentionApi';
import { getRoutineProgressOwner } from './userDataApi';
import { loadRoutineProgress } from '../routineStorage';
import { scheduledSteps } from '../retention';
import { routineStepIds } from '../routinePresentation';

export async function todayRoutineCompletion(): Promise<{ morning: boolean; evening: boolean }> {
  const owner = await getRoutineProgressOwner();
  if (!owner) throw new Error('Secure profile unavailable.');
  const [custom, history] = await Promise.all([loadCustomRoutine(), loadAnalysisHistory()]);
  const latest = history[0];
  const routineId = custom ? 'custom-' + (custom.sourceResultId ?? 'manual') : latest?.resultId;
  const progress = await loadRoutineProgress(owner, routineId);
  const ids = custom ? scheduledSteps(custom, new Date().getDay()).map(step => ({ id: step.id, period: step.period }))
    : routineStepIds(latest?.morningRoutine ?? [], latest?.eveningRoutine ?? []).map(id => ({ id, period: id.startsWith('Morning') ? 'Morning' : 'Evening' }));
  const complete = (period: string) => {
    const scheduled = ids.filter(step => step.period === period);
    return scheduled.length > 0 && scheduled.every(step => progress.checkedSteps.includes(step.id));
  };
  return { morning: complete('Morning'), evening: complete('Evening') };
}
