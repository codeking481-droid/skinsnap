function httpsBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Account deletion is not configured securely.');
  return url.origin;
}
function isPublicSupabaseKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  const payload = value.match(/^eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/)?.[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(decoded).role === 'anon';
  } catch {
    return false;
  }
}
export async function deleteSkinSnapAccount(config, input, fetchRequest = fetch) {
  if (config.deletionEnabled !== true) throw new Error('Account deletion is not enabled on this site.');
  if (input.confirmation !== 'DELETE' || input.acknowledged !== true) throw new Error('Type DELETE and confirm the deletion warning.');
  const email = input.email?.trim().toLowerCase();
  if (!email || !input.password) throw new Error('Enter your existing SkinSnap email and password.');
  const authUrl = httpsBase(config.supabaseUrl);
  const apiUrl = httpsBase(config.apiUrl);
  if (!config.publishableKey || !isPublicSupabaseKey(config.publishableKey)) throw new Error('Account deletion is not connected with a public Supabase key.');
  let auth;
  try {
    auth = await fetchRequest(`${authUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: input.password }), signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error('Sign-in could not be reached. No deletion request was sent.'); }
  if (!auth.ok) throw new Error(auth.status === 429 ? 'Sign-in is temporarily rate-limited. Please wait before trying again.' : 'Sign-in could not be verified. Check your email and password. No deletion request was sent.');
  const session = await auth.json().catch(() => null);
  if (typeof session?.access_token !== 'string' || typeof session?.user?.id !== 'string') throw new Error('Sign-in returned an incomplete response. No deletion request was sent.');
  const headers = { Authorization: `Bearer ${session.access_token}` };
  let verified;
  try { verified = await fetchRequest(`${apiUrl}/v1/session`, { headers, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('SkinSnap could not verify this account. No deletion request was sent.'); }
  const identity = verified.ok ? await verified.json().catch(() => null) : null;
  if (identity?.userId !== session.user.id) throw new Error('SkinSnap could not match this account. No deletion request was sent.');
  let deletion;
  try { deletion = await fetchRequest(`${apiUrl}/v1/account`, { method: 'DELETE', headers, signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('The deletion response was not received. Data may already have been removed. Retry deletion when online; do not assume the account is unchanged.'); }
  const result = await deletion.json().catch(() => null);
  if (!deletion.ok || result?.deleted !== true) throw new Error('Deletion is not confirmed. Some data may already have been removed. Retry deletion to finish.');
  return { deleted: true };
}
