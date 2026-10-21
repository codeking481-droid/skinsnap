import * as SecureStore from 'expo-secure-store';
import {
  DOWNSELL_OFFERING_ID,
  isDownsellPreviouslyUsed,
  parseDownsellClaimResponse,
  SUBSCRIPTION_PRODUCTS,
} from '../subscriptionRules';
import { getSessionToken } from './session';

const USED_KEY = 'skinsnap-yearly-downsell-used-v1';
const CLAIM_KEY = 'skinsnap-yearly-downsell-claim-v1';

export type DownsellClaim = { claimId: string; productIdentifier: string };
export type DownsellClaimResult =
  | { kind: 'claimed'; claim: DownsellClaim }
  | { kind: 'not-eligible' }
  | { kind: 'unavailable'; message: string };

let activeClaim: DownsellClaim | null = null;

function getBackendUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value?.startsWith('https://') ? value.replace(/\/+$/, '') : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function claimDownsellOnce(): Promise<DownsellClaimResult> {
  try {
    if (isDownsellPreviouslyUsed(await SecureStore.getItemAsync(USED_KEY))) return { kind: 'not-eligible' };
  } catch {
    return { kind: 'unavailable', message: 'Could not verify one-time offer eligibility on this device.' };
  }

  const baseUrl = getBackendUrl();
  const token = await getSessionToken();
  if (!baseUrl || !token) {
    return { kind: 'unavailable', message: 'The exclusive offer requires a signed-in account and a configured eligibility service.' };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/subscriptions/yearly-downsell/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `downsell-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify({
        offeringId: DOWNSELL_OFFERING_ID,
        productIdentifier: SUBSCRIPTION_PRODUCTS.yearlyDownsell,
        source: 'primary-paywall-dismiss',
      }),
    });
  } catch {
    return { kind: 'unavailable', message: 'Could not check exclusive offer eligibility. No offer has been applied.' };
  }

  if (response.status === 404 || response.status === 409) return { kind: 'not-eligible' };
  if (response.status === 401) {
    return { kind: 'unavailable', message: 'Sign in again to check eligibility for the exclusive offer.' };
  }
  if (!response.ok) {
    return { kind: 'unavailable', message: 'The exclusive offer is unavailable right now. You can continue without purchasing.' };
  }

  try {
    const data: unknown = await response.json();
    const claim = parseDownsellClaimResponse(data, SUBSCRIPTION_PRODUCTS.yearlyDownsell);
    if (!claim) {
      return { kind: 'not-eligible' };
    }
    activeClaim = claim;
    await SecureStore.setItemAsync(USED_KEY, 'true');
    await SecureStore.setItemAsync(CLAIM_KEY, JSON.stringify(claim));
    return { kind: 'claimed', claim };
  } catch {
    return { kind: 'unavailable', message: 'The exclusive offer response could not be verified.' };
  }
}

export async function getActiveDownsellClaim(): Promise<DownsellClaim | null> {
  if (activeClaim) return activeClaim;
  try {
    if (await SecureStore.getItemAsync(USED_KEY)) return null;
    const raw = await SecureStore.getItemAsync(CLAIM_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)
      || typeof data.claimId !== 'string'
      || data.productIdentifier !== SUBSCRIPTION_PRODUCTS.yearlyDownsell) return null;
    activeClaim = { claimId: data.claimId, productIdentifier: data.productIdentifier };
    return activeClaim;
  } catch {
    return null;
  }
}

export async function dismissDownsellClaim(): Promise<void> {
  const claim = await getActiveDownsellClaim();
  await SecureStore.setItemAsync(USED_KEY, 'true');
  activeClaim = null;
  await SecureStore.deleteItemAsync(CLAIM_KEY);
  if (!claim) return;

  const baseUrl = getBackendUrl();
  const token = await getSessionToken();
  if (!baseUrl || !token) throw new Error('Could not notify the eligibility service that the exclusive offer was dismissed.');

  const response = await fetch(`${baseUrl}/v1/subscriptions/yearly-downsell/dismiss`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `dismiss-${claim.claimId}`,
    },
    body: JSON.stringify({ claimId: claim.claimId }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error('Could not confirm dismissal of the exclusive offer with the eligibility service.');
  }
}

export function consumeDownsellClaim(): void {
  activeClaim = null;
}
