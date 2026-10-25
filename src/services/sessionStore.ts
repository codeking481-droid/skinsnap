import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export function getSessionValue(key: string): Promise<string | null> {
  // Web sessions are tab-scoped because Expo SecureStore is native-only.
  if (Platform.OS === 'web') return Promise.resolve(globalThis.sessionStorage.getItem(key));
  return SecureStore.getItemAsync(key);
}

export function setSessionValue(
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions,
): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage.setItem(key, value);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(key, value, options);
}

export function deleteSessionValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage.removeItem(key);
    return Promise.resolve();
  }
  return SecureStore.deleteItemAsync(key);
}
