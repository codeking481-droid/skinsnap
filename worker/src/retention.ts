import { isLocalDate, parseCustomRoutine, parseDiaryEntry, parseSavedPreferences } from '../../src/retention.ts';

type DatabaseRequest = (path: string, init?: RequestInit) => Promise<Response>;
export async function retentionRoute(request: Request, userId: string, database: DatabaseRequest): Promise<Response> {
  const db: DatabaseRequest = async (path, init) => {
    const response = await database(path, init);
    if (!response.ok) throw new Error('retention-write-not-confirmed');
    return response;
  };
  const url = new URL(request.url);
  const path = url.pathname;
  const diary = path.startsWith('/v1/diary');
  const table = diary ? 'skin_diary_entries' : path === '/v1/preferences' ? 'skincare_preferences' : 'routines';
  const reply = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const query = new URLSearchParams({ user_id: `eq.${userId}` });
  if (request.method === 'GET') {
    query.set('select', diary ? 'data' : 'data,updated_at');
    query.set('limit', diary ? '366' : '1');
    if (diary) query.set('order', 'entry_date.desc');
    if (diary && url.searchParams.has('date')) {
      const date = url.searchParams.get('date');
      if (!isLocalDate(date)) return reply({ error: 'invalid-date' }, 400);
      query.set('entry_date', `eq.${date}`); query.set('limit', '1');
    }
    const rows: unknown = await (await db(`${table}?${query}`)).json();
    if (!Array.isArray(rows)) throw new Error('invalid-retention-response');
    return diary ? reply({ items: rows.map(row => row.data) }) : reply(rows[0] ?? { data: null });
  }
  if (request.method === 'DELETE') {
    if (diary) {
      const date = path.slice('/v1/diary/'.length);
      if (!isLocalDate(date)) return reply({ error: 'invalid-date' }, 400);
      query.set('entry_date', `eq.${date}`);
    }
    await db(`${table}?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return reply({ deleted: true });
  }
  if (request.method !== 'PUT') return reply({ error: 'method-not-allowed' }, 405);
  // Bound the streamed body, including clients that omit Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'invalid-data' }, 400);
  let raw = ''; let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 24000) { await reader.cancel(); return reply({ error: 'data-too-large' }, 413); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let data;
  try {
    const value: unknown = JSON.parse(raw);
    data = diary ? parseDiaryEntry(value) : table === 'skincare_preferences' ? parseSavedPreferences(value) : parseCustomRoutine(value);
  } catch { return reply({ error: 'invalid-data', message: 'Check the fields and retry.' }, 400); }
  const row = { user_id: userId, data, updated_at: new Date().toISOString(),
    ...(diary ? { entry_date: (data as { date: string }).date } : {}) };
  await db(`${table}?on_conflict=${diary ? 'user_id,entry_date' : 'user_id'}`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row),
  });
  return reply({ saved: true });
}
