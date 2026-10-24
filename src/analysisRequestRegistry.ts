const active = new Map<string, Promise<unknown>>();
// Reuse one in-flight upload/analysis across navigation. Server idempotency remains
// authoritative after completion or process termination.
export function runAnalysisOnce<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = active.get(key);
  if (existing) return existing as Promise<T>;
  const request = Promise.resolve().then(start);
  active.set(key, request);
  const release = () => { if (active.get(key) === request) active.delete(key); };
  void request.then(release, release);
  return request;
}
