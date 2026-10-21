export const PREMIUM_ENTITLEMENT_ID = 'skinsnap_premium';
export const DEFAULT_OFFERING_ID = 'default';
export const DOWNSELL_OFFERING_ID = 'yearly_downsell';

export const SUBSCRIPTION_PRODUCTS = {
  weekly: 'skinsnap_weekly',
  yearly: 'skinsnap_yearly',
  yearlyDownsell: 'skinsnap_yearly_downsell',
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PRODUCTS;
export type BillingPeriod = 'weekly' | 'yearly';

export type ProductTerms = {
  identifier: string;
  subscriptionPeriod: string | null;
  introPrice: unknown | null;
  defaultOption?: {
    freePhase?: unknown | null;
    introPhase?: unknown | null;
  } | null;
};

export type EntitlementStatus = {
  isActive: boolean;
  verification: string;
  expirationDateMillis: number | null;
};

export type DownsellClaimResponse = { claimId: string; productIdentifier: string };

export function productMatches(identifier: string, productId: string): boolean {
  return identifier === productId || identifier.startsWith(`${productId}:`);
}

export function isProductWithoutIntro(product: ProductTerms, period: BillingPeriod): boolean {
  const expectedPeriod = period === 'weekly' ? 'P1W' : 'P1Y';
  return product.subscriptionPeriod === expectedPeriod
    && product.introPrice == null
    && product.defaultOption?.freePhase == null
    && product.defaultOption?.introPhase == null;
}

export function hasVerifiedActiveEntitlement(
  entitlement: EntitlementStatus | null | undefined,
  now = Date.now(),
): boolean {
  return entitlement?.isActive === true
    && entitlement.verification === 'VERIFIED'
    && (entitlement.expirationDateMillis === null || entitlement.expirationDateMillis > now);
}

export function calculateSavingsPercent(
  standardPrice: number,
  offerPrice: number,
  standardCurrency: string,
  offerCurrency: string,
): number | null {
  if (!Number.isFinite(standardPrice) || !Number.isFinite(offerPrice)
    || standardPrice <= 0 || offerPrice < 0 || offerPrice >= standardPrice
    || !standardCurrency || standardCurrency !== offerCurrency) return null;
  return Math.round((1 - offerPrice / standardPrice) * 100);
}

export function isPurchaseCancelled(error: { userCancelled?: boolean | null; code?: string } | null): boolean {
  return error?.userCancelled === true || error?.code === '1';
}

export function isAnalysisResponseAllowed(
  entitlementActive: boolean,
  backendConfigured: boolean,
  authenticated: boolean,
): boolean {
  return entitlementActive && backendConfigured && authenticated;
}

export function parseDownsellClaimResponse(value: unknown, expectedProductId: string): DownsellClaimResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.eligible !== true
    || typeof data.claimId !== 'string'
    || !data.claimId.trim()
    || data.productIdentifier !== expectedProductId) return null;
  return { claimId: data.claimId, productIdentifier: expectedProductId };
}

export function isDownsellPreviouslyUsed(value: string | null): boolean {
  return value === 'true';
}
