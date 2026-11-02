import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getBrowserStorage(): Storage {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Browser storage is unavailable.');
  return storage;
}

export function readBrowserValue(key: string): string | null {
  if (Platform.OS !== 'web') return null;
  return getBrowserStorage().getItem(key);
}

export function writeBrowserValue(key: string, value: string): void {
  if (Platform.OS !== 'web') return;
  getBrowserStorage().setItem(key, value);
}

export function removeBrowserValue(key: string): void {
  if (Platform.OS !== 'web') return;
  getBrowserStorage().removeItem(key);
}

export async function readLocalValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return readBrowserValue(key);
  return SecureStore.getItemAsync(key);
}

export async function writeLocalValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    writeBrowserValue(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeLocalValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    removeBrowserValue(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
