import type { SubscriptionPlan } from './subscriptionRules';

// Release gate: enable deliberately only after RevenueCat and Google Play testing.
// Credentials, a preview price, or a loaded store product must never enable this.
export const SUBSCRIPTION_PURCHASES_ENABLED: boolean = false;

const DEVELOPMENT_PREVIEW_PRICES: Record<SubscriptionPlan, string> = {
  weekly: '$6.99',
  yearly: '$29.99',
  yearlyDownsell: '$24.99',
};

export function usesDevelopmentPricePreview(
  isDevelopment: boolean,
  billingKind: string | undefined,
  platform: string,
): boolean {
  return isDevelopment && (
    billingKind === 'expo-go-preview'
    || billingKind === 'unconfigured'
    || (platform === 'web' && billingKind === 'error')
  );
}

export function getPaywallPrice(
  plan: SubscriptionPlan,
  storePrice: string | undefined,
  developmentPreview: boolean,
): { source: 'store' | 'preview' | 'unavailable'; label: string } {
  const period = plan === 'weekly' ? 'week' : 'year';
  if (storePrice?.trim()) return { source: 'store', label: `${storePrice} / ${period}` };
  if (developmentPreview) {
    return { source: 'preview', label: `${DEVELOPMENT_PREVIEW_PRICES[plan]} / ${period}` };
  }
  return { source: 'unavailable', label: 'Price unavailable' };
}
