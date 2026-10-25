function getBrowserStorage(): Storage {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Browser storage is unavailable.');
  return storage;
}

export function readBrowserValue(key: string): string | null {
  return getBrowserStorage().getItem(key);
}

export function writeBrowserValue(key: string, value: string): void {
  getBrowserStorage().setItem(key, value);
}

export function removeBrowserValue(key: string): void {
  getBrowserStorage().removeItem(key);
}
