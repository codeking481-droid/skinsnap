import type { SubscriptionPlan } from './subscriptionRules';

// Keep checkout off unless a native store build is explicitly enabled for testing.
export const SUBSCRIPTION_PURCHASES_ENABLED: boolean =
  process.env.EXPO_PUBLIC_SUBSCRIPTION_PURCHASES_ENABLED === 'true';

export function getPaywallPrice(
  plan: SubscriptionPlan,
  storePrice: string | undefined,
  loading = false,
): { source: 'store' | 'loading' | 'unavailable'; label: string } {
  const period = plan === 'weekly' ? 'week' : plan === 'monthly' ? 'month' : 'year';
  if (storePrice?.trim()) return { source: 'store', label: `${storePrice} / ${period}` };
  if (loading) return { source: 'loading', label: 'Loading store price…' };
  return { source: 'unavailable', label: 'Price unavailable' };
}
