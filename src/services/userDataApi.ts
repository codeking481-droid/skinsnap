import type { RoutineProgress } from '../routineStorage';
import { getSessionToken } from './session';

type UserDataRecord = {
  data: Record<string, unknown> | null;
};

function apiUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value?.startsWith('https://') ? value.replace(/\/+$/, '') : null;
}

async function readRecord(path: '/v1/routine' | '/v1/progress', token: string): Promise<UserDataRecord> {
  const baseUrl = apiUrl();
  if (!baseUrl) throw new Error('Secure account sync is not configured in this build.');
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to sync your skincare data.');
  if (!response.ok) throw new Error('Your skincare data could not be loaded from your account.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The secure data service returned an invalid record.');
  const data = (value as Record<string, unknown>).data;
  if (data !== null && data !== undefined && (typeof data !== 'object' || Array.isArray(data))) {
    throw new Error('The secure data service returned an invalid record.');
  }
  return { data: data && typeof data === 'object' ? data as Record<string, unknown> : null };
}

async function writeRecord(path: '/v1/routine' | '/v1/progress', data: Record<string, unknown>, token: string): Promise<void> {
  const baseUrl = apiUrl();
  if (!baseUrl) throw new Error('Secure account sync is not configured in this build.');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to sync your skincare data.');
  if (!response.ok) throw new Error('Your skincare data could not be saved to your account.');
}

export async function syncRoutineProgress(progress: RoutineProgress): Promise<'local-only' | 'synced'> {
  const token = await getSessionToken();
  if (!token) return 'local-only';
  await Promise.all([
    writeRecord('/v1/routine', { checkedSteps: progress.checkedSteps }, token),
    writeRecord('/v1/progress', { completedDays: progress.completedDays }, token),
  ]);
  return 'synced';
}

export async function loadRoutineProgressFromAccount(): Promise<RoutineProgress | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const [routine, progress] = await Promise.all([
    readRecord('/v1/routine', token),
    readRecord('/v1/progress', token),
  ]);
  const checkedSteps = routine.data?.checkedSteps;
  const completedDays = progress.data?.completedDays;
  return {
    checkedSteps: Array.isArray(checkedSteps) ? checkedSteps.filter((item): item is string => typeof item === 'string') : [],
    completedDays: Array.isArray(completedDays) ? completedDays.filter((item): item is string => typeof item === 'string') : [],
  };
}
