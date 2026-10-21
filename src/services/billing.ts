import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import {
  hasVerifiedActiveEntitlement,
  isProductWithoutIntro,
  productMatches,
  PREMIUM_ENTITLEMENT_ID,
  SUBSCRIPTION_PRODUCTS,
  type SubscriptionPlan,
} from '../subscriptionRules';

type PurchasesSdk = typeof import('react-native-purchases')['default'];

export type BillingState =
  | { kind: 'expo-go-preview'; message: string }
  | { kind: 'unconfigured'; message: string }
  | { kind: 'ready'; packages: Partial<Record<SubscriptionPlan, PurchasesPackage>> }
  | { kind: 'error'; message: string };

export type PurchaseState =
  | { kind: 'active'; customerInfo: CustomerInfo }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'inactive' }
  | { kind: 'error'; message: string };

export type EntitlementState =
  | { active: true; customerInfo: CustomerInfo }
  | { active: false; reason: 'preview' | 'unconfigured' | 'inactive' | 'unverified' | 'error' };

let sdkPromise: Promise<PurchasesSdk> | null = null;
let configurePromise: Promise<PurchasesSdk> | null = null;
let operationInProgress = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getApiKey(): string | null {
  const key = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return key?.trim() || null;
}

export function isRevenueCatConfiguredForPlatform(): boolean {
  return !isExpoGo() && Boolean(getApiKey());
}

async function getConfiguredSdk(): Promise<PurchasesSdk> {
  if (isExpoGo()) throw new Error('Google Play Billing requires a SkinSnap development build.');
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Billing is only available in the Android and iOS apps.');
  }
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('RevenueCat is not configured for this build.');

  if (!configurePromise) {
    configurePromise = (async () => {
      sdkPromise ??= import('react-native-purchases').then((module) => module.default);
      const Purchases = await sdkPromise;
      const configured = await Purchases.isConfigured();
      if (!configured) {
        await Purchases.configure({
          apiKey,
          entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
          pendingTransactionsForPrepaidPlansEnabled: false,
        });
        await Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);
      }
      return Purchases;
    })();
    configurePromise.catch(() => {
      configurePromise = null;
      sdkPromise = null;
    });
  }
  return configurePromise;
}

function packageFor(
  packages: PurchasesPackage[],
  plan: SubscriptionPlan,
): PurchasesPackage | undefined {
  const period = plan === 'weekly' ? 'weekly' : 'yearly';
  return packages.find((item) => productMatches(item.product.identifier, SUBSCRIPTION_PRODUCTS[plan])
    && isProductWithoutIntro(item.product, period));
}

export async function loadBillingState(includeDownsell = false): Promise<BillingState> {
  if (isExpoGo()) {
    return {
      kind: 'expo-go-preview',
      message: 'Expo Go preview only. Store prices and purchases are available in an Android development build.',
    };
  }

  try {
    const Purchases = await getConfiguredSdk();
    const offerings = await Purchases.getOfferings();
    const current = offerings.all.default ?? offerings.current;
    if (!current) return { kind: 'error', message: 'Subscription products are unavailable from the store right now.' };

    const packages: Partial<Record<SubscriptionPlan, PurchasesPackage>> = {};
    const weekly = packageFor(current.availablePackages, 'weekly');
    const yearly = packageFor(current.availablePackages, 'yearly');
    if (weekly) packages.weekly = weekly;
    if (yearly) packages.yearly = yearly;

    if (includeDownsell) {
      const exclusiveOffering = offerings.all.yearly_downsell;
      const downsell = exclusiveOffering
        ? packageFor(exclusiveOffering.availablePackages, 'yearlyDownsell')
        : undefined;
      if (downsell) packages.yearlyDownsell = downsell;
    }
    return { kind: 'ready', packages };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load subscription products.';
    return { kind: getApiKey() ? 'error' : 'unconfigured', message };
  }
}

export async function getVerifiedEntitlement(): Promise<EntitlementState> {
  if (isExpoGo()) return { active: false, reason: 'preview' };
  if (!getApiKey()) return { active: false, reason: 'unconfigured' };
  try {
    const Purchases = await getConfiguredSdk();
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
    if (!entitlement?.isActive) return { active: false, reason: 'inactive' };
    if (!hasVerifiedActiveEntitlement(entitlement)) return { active: false, reason: 'unverified' };
    return { active: true, customerInfo };
  } catch {
    return { active: false, reason: 'error' };
  }
}

export async function logInRevenueCatUser(appUserId: string): Promise<void> {
  if (!appUserId.trim()) throw new Error('A stable, server-issued RevenueCat app user ID is required.');
  if (!isRevenueCatConfiguredForPlatform()) return;
  const Purchases = await getConfiguredSdk();
  await Purchases.logIn(appUserId);
}

export async function logOutRevenueCatUser(): Promise<void> {
  if (isExpoGo() || !getApiKey()) return;
  const Purchases = await getConfiguredSdk();
  await Purchases.logOut();
}

export async function getRevenueCatAppUserId(): Promise<string> {
  const Purchases = await getConfiguredSdk();
  return Purchases.getAppUserID();
}

export async function purchasePlan(plan: SubscriptionPlan, product: PurchasesPackage | undefined): Promise<PurchaseState> {
  if (operationInProgress) return { kind: 'error', message: 'A store operation is already in progress.' };
  if (!product) return { kind: 'error', message: 'This subscription is not available from the store.' };
  operationInProgress = true;
  try {
    const Purchases = await getConfiguredSdk();
    const result = await Purchases.purchasePackage(product);
    const entitlement = result.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
    if (!entitlement?.isActive) return { kind: 'inactive' };
    if (!hasVerifiedActiveEntitlement(entitlement)) return { kind: 'error', message: 'The store could not verify this subscription yet. Restore purchases or try again shortly.' };
    return { kind: 'active', customerInfo: result.customerInfo };
  } catch (error) {
    const details = error as { userCancelled?: boolean | null; code?: string };
    if (details.userCancelled === true || details.code === '1') return { kind: 'cancelled' };
    if (details.code === '20') return { kind: 'pending' };
    const message = error instanceof Error ? error.message : 'The store could not complete the purchase.';
    return { kind: 'error', message };
  } finally {
    operationInProgress = false;
  }
}

export async function restorePurchases(): Promise<EntitlementState> {
  if (operationInProgress) return { active: false, reason: 'error' };
  if (isExpoGo()) return { active: false, reason: 'preview' };
  if (!getApiKey()) return { active: false, reason: 'unconfigured' };
  operationInProgress = true;
  try {
    const Purchases = await getConfiguredSdk();
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
    if (!entitlement?.isActive) return { active: false, reason: 'inactive' };
    if (!hasVerifiedActiveEntitlement(entitlement)) return { active: false, reason: 'unverified' };
    return { active: true, customerInfo };
  } catch {
    return { active: false, reason: 'error' };
  } finally {
    operationInProgress = false;
  }
}
