export type AnalysisDiagnostic = {
  requestId?: string;
  httpStatus?: number | null;
  serverErrorCode?: string | null;
  errorName?: 'AbortError' | 'Error' | 'NetworkError' | 'TypeError' | 'other';
  failureCause?: 'aborted' | 'dns' | 'file-access' | 'network' | 'permission' | 'timeout' | 'tls' | 'unknown';
  elapsedMs?: number;
  uploadBytesSent?: number;
  uploadTotalBytes?: number;
};

export function diagnosticRequestId(idempotencyKey: string): string {
  const safeKey = idempotencyKey.replace(/[^A-Za-z0-9._:-]/g, '');
  return safeKey.slice(-12) || 'unavailable';
}

export function safeServerErrorCode(value: string): string | null {
  return /^[a-z0-9-]{1,64}$/.test(value) ? value : null;
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export function fetchFailureCode(error: unknown, timedOut: boolean): {
  code: 'request-timeout' | 'network-request-failed' | 'request-failed';
  errorName: AnalysisDiagnostic['errorName'];
  failureCause: NonNullable<AnalysisDiagnostic['failureCause']>;
} {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const rawName = error instanceof Error ? error.name : '';
  const errorName: AnalysisDiagnostic['errorName'] = rawName === 'AbortError'
    ? 'AbortError'
    : rawName === 'TypeError'
      ? 'TypeError'
      : rawName === 'NetworkError'
        ? 'NetworkError'
        : rawName === 'Error'
          ? 'Error'
          : 'other';
  if (timedOut) return { code: 'request-timeout', errorName: 'AbortError', failureCause: 'timeout' };
  if (rawName === 'AbortError') return { code: 'request-failed', errorName, failureCause: 'aborted' };
  if (/unable to resolve|unknown host|no address associated|eai_again|name or service not known/.test(message)) {
    return { code: 'request-failed', errorName, failureCause: 'dns' };
  }
  if (/ssl|tls|certificate|handshake/.test(message)) {
    return { code: 'request-failed', errorName, failureCause: 'tls' };
  }
  if (/permission denied|eacces|not permitted/.test(message)) {
    return { code: 'request-failed', errorName, failureCause: 'permission' };
  }
  if (/enoent|no such file|cannot open|file.*not found/.test(message)) {
    return { code: 'request-failed', errorName, failureCause: 'file-access' };
  }
  if (error instanceof TypeError || /network request failed|failed to connect|connection reset|connection refused|socket|network error/.test(message)) {
    return { code: 'network-request-failed', errorName, failureCause: 'network' };
  }
  return {
    code: 'request-failed',
    errorName,
    failureCause: 'unknown',
  };
}
