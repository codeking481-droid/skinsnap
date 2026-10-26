export type ProgressDay = {
  key: string;
  label: string;
  completed: boolean;
  today: boolean;
};

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getProgressWeek(completedDays: readonly string[], now = new Date()): ProgressDay[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const completed = new Set(completedDays);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
      completed: completed.has(key),
      today: key === dateKey(today),
    };
  });
}

export function getRoutineStreak(completedDays: readonly string[], now = new Date()): number {
  const completed = new Set(completedDays);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!completed.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!completed.has(dateKey(cursor))) return 0;
  }

  let streak = 0;
  while (completed.has(dateKey(cursor)) && streak < 366) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getCurrentWeekCount(dates: readonly string[], now = new Date()): number {
  const week = getProgressWeek([], now);
  const firstDay = week[0]?.key;
  const lastDay = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  if (!firstDay) return 0;
  return new Set(dates.filter((date) => date >= firstDay && date <= lastDay)).size;
}
