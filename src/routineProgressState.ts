export function localDayKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function restoreCheckedSteps(
  checkedSteps: string[], savedDay: unknown, today: string,
  savedRoutine: unknown, currentRoutine?: string,
): string[] {
  if (savedDay !== today) return [];
  if (currentRoutine && savedRoutine !== currentRoutine) return [];
  return checkedSteps;
}
