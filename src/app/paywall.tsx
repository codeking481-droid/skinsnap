import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';
import { isAdultEligibilityConfirmed, PUBLISHED_PRIVACY_POLICY_URL, PUBLISHED_TERMS_URL } from '../privacy';
import {
  calculateSavingsPercent,
  type SubscriptionPlan,
} from '../subscriptionRules';
import {
  getVerifiedEntitlement,
  loadBillingState,
  purchasePlan,
  restorePurchases,
  type BillingState,
} from '../services/billing';
import {
  claimDownsellOnce,
  consumeDownsellClaim,
  dismissDownsellClaim,
  getActiveDownsellClaim,
} from '../services/offerEligibility';
import { ensureAuthenticatedSession, sessionFailureMessage, verifyAuthenticatedSession, type SessionFailureReason } from '../services/session';
import { loadPreferences, markPaywallComplete } from '../preferences';
import {
  getPaywallPrice,
  SUBSCRIPTION_PURCHASES_ENABLED,
} from '../paywallPresentation';
import { responsiveScale } from '../responsive';

const PLAN_DETAILS: Record<SubscriptionPlan, { name: string; period: string; badge?: string }> = {
  weekly: { name: 'Weekly', period: 'week' },
  monthly: { name: 'Monthly', period: 'month' },
  yearly: { name: 'Yearly', period: 'year' },
  yearlyDownsell: { name: 'Eligible yearly offer', period: 'year', badge: 'ONE-TIME OFFER' },
};

const BENEFITS = [
  'Non-diagnostic skin observations',
  'Routine and product ideas',
  'Optional fragrance inspiration',
  'Skin diary and progress tracking',
];

function hasSecureBackend(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_API_URL?.trim().startsWith('https://'));
}

export default function PaywallScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ offer?: string; next?: string }>();
  const downsell = params.offer === 'downsell';
  const [selectedBasePlan, setSelectedBasePlan] = useState<'weekly' | 'monthly' | 'yearly'>('yearly');
  const selected: SubscriptionPlan = downsell ? 'yearlyDownsell' : selectedBasePlan;
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [downsellReady, setDownsellReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [ageEligible, setAgeEligible] = useState(false);
  const [sessionReason, setSessionReason] = useState<SessionFailureReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);
  const scale = responsiveScale(width);
  const continueWithAccess = useCallback(() => {
    router.replace(params.next === 'analysis' ? '/upload' : '/');
  }, [params.next]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadPreferences().then(async preferences => {
      if (!active) return;
      if (!preferences.onboardingComplete || !isAdultEligibilityConfirmed(preferences.ageConfirmed)) {
        setAgeEligible(false);
        router.replace('/onboarding');
        return;
      }
      setAgeEligible(true);
      const [state, session, claim] = await Promise.all([
        loadBillingState(downsell),
        SUBSCRIPTION_PURCHASES_ENABLED ? ensureAuthenticatedSession() : verifyAuthenticatedSession(),
        downsell ? getActiveDownsellClaim() : Promise.resolve(null),
      ]);
      if (!active) return;
      setBillingState(state);
      setHasSession(session.valid);
      setSessionReason(session.valid ? null : session.reason);
      if (downsell) {
        if (!claim) {
         router.replace('/paywall');
          return;
        }
        setDownsellReady(true);
      }
    }).catch(() => {
      if (!active) return;
      setBillingState({ kind: 'error', message: 'Could not prepare subscription information.' });
      if (downsell) router.replace('/paywall');
    });
    return () => { active = false; };
  }, [downsell]));

  useEffect(() => {
    let active = true;
    getVerifiedEntitlement().then(async status => {
      if (!active || !status.active) return;
      await markPaywallComplete();
      if (active) continueWithAccess();
    }).catch(() => {
      if (active) setNotice('Your existing subscription could not be verified. Please try again.');
    });
    return () => { active = false; };
  }, [continueWithAccess]);

  const packages = billingState?.kind === 'ready' ? billingState.packages : {};
  const selectedPackage = packages[selected];
  const standardAnnual = packages.yearly;
  const monthlyPackage = packages.monthly;
  const annualDownsell = packages.yearlyDownsell;
  const savingsPercent = standardAnnual && annualDownsell
    ? calculateSavingsPercent(
      standardAnnual.product.price,
      annualDownsell.product.price,
      standardAnnual.product.currencyCode,
      annualDownsell.product.currencyCode,
    )
    : null;
  const annualSavingsPercent = monthlyPackage && standardAnnual
    ? calculateSavingsPercent(
      monthlyPackage.product.price * 12,
      standardAnnual.product.price,
      monthlyPackage.product.currencyCode,
      standardAnnual.product.currencyCode,
    )
    : null;
  const storeReady = billingState?.kind === 'ready';
  const legalConfigured = Boolean(PUBLISHED_TERMS_URL && PUBLISHED_PRIVACY_POLICY_URL);
  const canPurchase = SUBSCRIPTION_PURCHASES_ENABLED
    && ageEligible
    && storeReady
    && Boolean(selectedPackage)
    && hasSession
    && legalConfigured
    && hasSecureBackend()
    && (!downsell || (downsellReady && savingsPercent !== null));

  const continueFree = useCallback(async () => {
    try {
      await markPaywallComplete();
      continueWithAccess();
    } catch {
      setCloseMessage('Your choice could not be saved on this device. Please try again.');
    }
  }, [continueWithAccess]);

  const closePaywall = useCallback(async () => {
    if (busy) return;
    if (params.next === 'analysis') {
      router.replace('/');
      return;
    }
    if (downsell) {
      setBusy(true);
      try {
        await dismissDownsellClaim();
        continueFree();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The offer dismissal could not be confirmed.';
        setCloseMessage(`${message} The offer will not be shown again on this device.`);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Previewing a disabled paywall must not consume an account's one-time claim.
    if (!SUBSCRIPTION_PURCHASES_ENABLED) {
      continueFree();
      return;
    }

    setBusy(true);
    try {
      const state = await loadBillingState(true);
      setBillingState(state);
      if (state.kind === 'ready' && state.packages.yearly && state.packages.yearlyDownsell) {
        const discount = calculateSavingsPercent(
          state.packages.yearly.product.price,
          state.packages.yearlyDownsell.product.price,
          state.packages.yearly.product.currencyCode,
          state.packages.yearlyDownsell.product.currencyCode,
        );
        if (discount !== null) {
          const result = await claimDownsellOnce();
          if (result.kind === 'claimed') {
            router.push({ pathname: '/paywall', params: { offer: 'downsell', ...(params.next ? { next: params.next } : {}) } });
            return;
          }
          if (result.kind === 'unavailable') {
            setCloseMessage(result.message);
            return;
          }
        }
      }
      continueFree();
    } catch {
      setCloseMessage('The exclusive offer could not be checked. You can return to SkinSnap and try again later.');
    } finally {
      setBusy(false);
    }
  }, [busy, continueFree, downsell, params.next]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void closePaywall();
      return true;
    });
    return () => subscription.remove();
  }, [closePaywall]));

  const buySelectedPlan = async () => {
    if (!SUBSCRIPTION_PURCHASES_ENABLED || busy || !canPurchase) return;
    setBusy(true);
    const result = await purchasePlan(selected, selectedPackage);
    if (result.kind === 'active') {
      if (downsell) consumeDownsellClaim();
      try {
        await markPaywallComplete();
        router.replace('/');
        return;
      } catch {
        setNotice('Google Play confirmed your subscription, but SkinSnap could not save your onboarding progress. Please try again.');
      }
    }
    if (result.kind === 'cancelled') setNotice('Purchase cancelled. No subscription was started.');
    else if (result.kind === 'pending') setNotice('Google Play is processing your payment. Premium access stays locked until the store confirms it.');
    else if (result.kind === 'inactive') setNotice('The store has not confirmed an active SkinSnap entitlement. No analysis was started.');
    else if (result.kind === 'error') setNotice(result.message);
    setBusy(false);
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const status = await restorePurchases();
    if (status.active) {
      if (!hasSecureBackend() || !hasSession) {
        setNotice('A subscription is active, but secure sign-in is temporarily unavailable.');
      } else {
        try {
          await markPaywallComplete();
          continueWithAccess();
          return;
        } catch {
          setNotice('Your active subscription was restored, but SkinSnap could not save your onboarding progress. Please try again.');
        }
      }
    } else if (status.reason === 'inactive') {
      setNotice('No active SkinSnap subscription was found for this Google Play account.');
    } else if (status.reason === 'preview') {
      setNotice(__DEV__ ? 'Restore Purchases is available only in an Android development or store build.' : 'Purchases could not be restored in this build. No purchase state was changed.');
    } else if (status.reason === 'unconfigured') {
      setNotice(__DEV__ ? 'Store billing is temporarily unavailable. No purchase state was changed.' : 'Subscriptions are not available yet. No purchase state was changed.');
    } else {
      setNotice('Could not verify purchases. Check your connection and try again.');
    }
    setBusy(false);
  };

  const openLegal = async (kind: 'terms' | 'privacy') => {
    const url = kind === 'terms' ? PUBLISHED_TERMS_URL : PUBLISHED_PRIVACY_POLICY_URL;
    if (!url) {
      if (kind === 'privacy') {
        router.push('/privacy');
        return;
      }
        router.push('/terms');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setNotice(`Could not open the ${kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'} link.`);
    }
  };

  const showStorePrice = (plan: SubscriptionPlan, product: PurchasesPackage | undefined) => {
    if (billingState?.kind === 'expo-go-preview') return 'Available in native build';
    const period = plan === 'weekly' ? 'wk' : plan === 'monthly' ? 'mo' : 'yr';
    return product?.product.priceString
      ? `${product.product.priceString}/${period}`
      : getPaywallPrice(plan, undefined, billingState === null).label;
  };
  const pricePerMonth = (product: PurchasesPackage | undefined): string => {
    if (!product) return '—';
    const storeProduct = product.product as typeof product.product & { pricePerMonthString?: string };
    return storeProduct.pricePerMonthString ?? '—';
  };
  const storeName = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  const pricingStatus = billingState === null
    ? `Fetching localised prices from ${storeName} via RevenueCat…`
    : billingState.kind === 'expo-go-preview'
      ? 'Real store prices are available in a native SkinSnap build, not Expo Go.'
      : billingState.kind === 'unconfigured'
        ? 'Prices are preparing for this platform.'
        : billingState.kind === 'error'
          ? 'Prices are still loading. Your plan will use the store price.'
          : !selectedPackage
            ? 'No matching subscription price was returned. Check the RevenueCat offering and Google Play product setup.'
            : null;

  if (downsell && !downsellReady) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <View style={[styles.page, { width: Math.min(width, 520), paddingTop: Math.max(insets.top, 12 * scale) }]}>
          <LinearGradient colors={['#101010', '#0A0A0A', '#0A0A0A']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingHorizontal: 22 * scale, paddingBottom: 18 * scale }} showsVerticalScrollIndicator={false}>
            <View style={[styles.topBar, { marginTop: 6 * scale, marginBottom: 12 * scale }]}>
              <View style={[styles.valueChip, { paddingHorizontal: 10 * scale, paddingVertical: 5 * scale, borderRadius: 12 * scale }]}>
                <Text style={[styles.valueChipText, { fontSize: 9 * scale }]}>SKINSNAP PREMIUM</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={downsell ? 'Dismiss exclusive offer' : 'Close subscription offer'} hitSlop={12} onPress={() => void closePaywall()} style={[styles.iconButton, { width: 44 * scale, height: 44 * scale }]}>
                <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m6 6 12 12M18 6 6 18" /></Svg>
              </Pressable>
            </View>

          <Text style={[styles.heading, { fontSize: 28 * scale, lineHeight: 34 * scale, marginTop: 5 * scale }]}>
            {downsell ? <>A personal insight{'\n'}plan, just for you</> : <>Your clearest skin{'\n'}starts today</>}
          </Text>
          <Text style={[styles.subheading, { fontSize: 12.5 * scale, lineHeight: 18 * scale, marginTop: 7 * scale }]}>
            AI skin analysis + a routine built for your skin
          </Text>

          <View style={[styles.socialProof, { marginTop: 18 * scale }]}>
            <Text style={[styles.stars, { fontSize: 22 * scale }]}>☆☆☆☆☆</Text>
            <Text style={[styles.socialProofText, { fontSize: 12 * scale }]}>Loved by skincare lovers</Text>
          </View>
          <View style={[styles.benefits, { marginTop: 15 * scale, gap: 14 * scale, padding: 14 * scale, borderRadius: 20 * scale }]}>
            <View style={[styles.referenceBenefit, { gap: 12 * scale }]}>
              <View style={[styles.benefitIcon, { width: 48 * scale, height: 48 * scale, borderRadius: 24 * scale }]}><Text style={{ color: '#F6A08A', fontSize: 23 * scale }}>◎</Text></View>
              <Text style={[styles.benefitText, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>Unlimited AI skin scans</Text>
            </View>
            <View style={[styles.referenceBenefit, { gap: 12 * scale }]}>
              <View style={[styles.benefitIcon, { width: 48 * scale, height: 48 * scale, borderRadius: 24 * scale }]}><Text style={{ color: '#F6A08A', fontSize: 23 * scale }}>✦</Text></View>
              <Text style={[styles.benefitText, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>A daily routine made for your skin</Text>
            </View>
            {BENEFITS.slice(2).map((benefit) => (
              <View key={benefit} style={[styles.referenceBenefit, { gap: 12 * scale }]}>
                <View style={[styles.benefitIcon, { width: 48 * scale, height: 48 * scale, borderRadius: 24 * scale }]}><Text style={{ color: '#F6A08A', fontSize: 23 * scale }}>✦</Text></View>
                <Text style={[styles.benefitText, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>{benefit}</Text>
              </View>
            ))}
          </View>
          </ScrollView>
          <View style={[styles.bottomDock, { paddingHorizontal: 22 * scale, paddingBottom: Math.max(insets.bottom, 12 * scale) }]}>
          <View style={[styles.plans, { gap: 7 * scale, marginTop: 12 * scale }]}>
            {(downsell ? ['yearlyDownsell'] as const : ['yearly', 'monthly', 'weekly'] as const).map((plan) => {
              const product = packages[plan];
              const chosen = selected === plan;
              const detail = plan === 'yearly' && !downsell
                ? { ...PLAN_DETAILS.yearly, badge: annualSavingsPercent !== null ? `BEST VALUE · SAVE ${annualSavingsPercent}%` : 'BEST VALUE' }
                : PLAN_DETAILS[plan];
              return (
                <Pressable
                  key={plan}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={`${detail.name}, ${showStorePrice(plan, product)}, automatically recurring, charged immediately`}
                  onPress={() => { if (plan !== 'yearlyDownsell') setSelectedBasePlan(plan); }}
                  style={({ pressed }) => [styles.planCard, { minHeight: 62 * scale, borderRadius: 15 * scale, paddingHorizontal: 13 * scale, borderColor: chosen ? '#E8C9A0' : '#383638', borderWidth: chosen ? 1.6 : 1, opacity: pressed ? 0.84 : 1 }]}
                >
                  {detail.badge && <View style={[styles.badge, { top: -9 * scale, right: 13 * scale, paddingHorizontal: 9 * scale, paddingVertical: 3 * scale, borderRadius: 9 * scale }]}><Text style={[styles.badgeText, { fontSize: 8.5 * scale }]}>{detail.badge}</Text></View>}
                  <View style={styles.planCopy}>
                    <Text style={[styles.planName, { fontSize: 14.5 * scale }]}>{detail.name}</Text>
                    {plan === 'yearly' && !downsell && <Text style={[styles.planTerms, { fontSize: 10 * scale, marginTop: 2 * scale }]}>Just {pricePerMonth(product)}/mo</Text>}
                    {plan === 'weekly' && !downsell && <Text style={[styles.planTerms, { fontSize: 10 * scale, marginTop: 2 * scale }]}>≈ {pricePerMonth(product)}/mo</Text>}
                    <Text style={[styles.planPrice, { fontSize: 15 * scale, marginTop: 2 * scale }]}>
                      {showStorePrice(plan, product)}
                    </Text>
                    {downsell && plan === 'yearlyDownsell' && savingsPercent !== null && standardAnnual && <Text style={[styles.savings, { fontSize: 10 * scale, marginTop: 3 * scale }]}>Standard {standardAnnual.product.priceString}/year · save about {savingsPercent}%</Text>}
                  </View>
                  <View style={[styles.radio, { width: 20 * scale, height: 20 * scale, borderRadius: 10 * scale, borderWidth: 1.5 * scale, borderColor: chosen ? '#E8C9A0' : '#777477' }]}>{chosen && <View style={[styles.radioDot, { width: 11 * scale, height: 11 * scale, borderRadius: 6 * scale }]} />}</View>
                </Pressable>
              );
            })}
          </View>
          {pricingStatus && <Text style={[styles.status, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 6 * scale }]}>{pricingStatus}</Text>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPurchase || busy }}
            disabled={!canPurchase || busy}
            onPress={() => void buySelectedPlan()}
            style={[styles.cta, { minHeight: 50 * scale, borderRadius: 25 * scale, marginTop: 9 * scale, opacity: busy ? 0.65 : 1 }]}
          >
            <LinearGradient colors={['#E6AADB', '#E6AADB']} style={styles.ctaFill}>
              <Text style={[styles.ctaText, { fontSize: 15 * scale }]}>
                {busy ? 'Connecting securely…' : params.next === 'analysis' ? 'Unlock My Skin Plan' : !SUBSCRIPTION_PURCHASES_ENABLED ? 'Continue' : selectedPackage ? 'Unlock My Skin Plan' : 'Subscription not available'}
              </Text>
            </LinearGradient>
          </Pressable>
          <Text style={[styles.disclosure, { fontSize: 10 * scale, lineHeight: 14 * scale, marginTop: 6 * scale }]}>
            Auto-renews. Cancel anytime. No commitment.
          </Text>
          {!downsell && params.next !== 'analysis' && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>Continue to SkinSnap</Text>
          </Pressable>}
          {downsell && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>No thanks · continue free</Text>
          </Pressable>}

          <View style={[styles.footer, { marginTop: 9 * scale, gap: 13 * scale }]}>
            <Pressable accessibilityRole="button" onPress={() => void restore()}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Restore Purchases</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLegal('terms')}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Terms</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLegal('privacy')}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Privacy</Text></Pressable>
          </View>
          </View>
      </View>
      <Modal visible={Boolean(notice || closeMessage)} transparent animationType="fade" onRequestClose={() => {
        const continueAfterCloseCheck = Boolean(closeMessage);
        setNotice(null);
        setCloseMessage(null);
        if (continueAfterCloseCheck) continueFree();
      }}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalTitle}>{notice ?? closeMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => {
              const continueAfterCloseCheck = Boolean(closeMessage);
              setNotice(null);
              setCloseMessage(null);
              if (continueAfterCloseCheck) continueFree();
            }} style={styles.dismissButton}><Text style={styles.dismissButtonText}>{closeMessage ? 'Continue without offer' : 'Close'}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#211719' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flex: 1, overflow: 'hidden', backgroundColor: '#211719', alignItems: 'center' },
  contentScroll: { flex: 1, width: '100%' },
  bottomDock: { width: '100%', backgroundColor: '#211719' },
  topActions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBar: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueChip: { backgroundColor: '#3A292B', borderWidth: 1, borderColor: '#654044' },
  valueChipText: { color: '#F6A08A', fontFamily: 'InterExtraBold', letterSpacing: 1.2 },
  iconButton: { justifyContent: 'center', alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: '#51484A', backgroundColor: '#4A4142' },
  brand: { color: '#FFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  eyebrow: { color: '#D4B896', fontFamily: 'InterExtraBold', letterSpacing: 1.5, textAlign: 'center' },
  heading: { maxWidth: 355, color: '#FFF3EF', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.65, marginTop: 26 },
  subheading: { maxWidth: 350, color: '#D5BDB8', fontFamily: 'InterRegular', textAlign: 'center' },
  benefitsHeading: { color: '#D4B896', fontFamily: 'InterExtraBold', letterSpacing: 1.5, textAlign: 'center' },
  socialProof: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stars: { color: '#F6A08A', letterSpacing: 2 },
  socialProofText: { color: '#D5BDB8', fontFamily: 'InterExtraBold' },
  benefits: { width: '100%', maxWidth: 390, backgroundColor: '#2C2022', borderWidth: 1, borderColor: '#493638' },
  benefitRow: { flexDirection: 'row', alignItems: 'center' },
  referenceBenefit: { flexDirection: 'row', alignItems: 'center' },
  benefitIcon: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#493033', borderWidth: 1, borderColor: '#654044' },
  check: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8C9A0' },
  benefitText: { color: '#FFF3EF', fontFamily: 'InterMedium', flex: 1 },
  plans: { width: '100%', maxWidth: 390 },
  planCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, position: 'relative', backgroundColor: '#2C2022', borderWidth: 1, borderColor: '#514144' },
  badge: { position: 'absolute', zIndex: 2, left: -1, right: -1, top: -1, alignItems: 'center', backgroundColor: '#F6A08A', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  badgeText: { color: '#241719', fontFamily: 'InterExtraBold', letterSpacing: 0.4 },
  radio: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { backgroundColor: '#E8C9A0' },
  planCopy: { flex: 1, paddingVertical: 6 },
  planName: { color: '#FFF3EF', fontFamily: 'InterExtraBold' },
  planPrice: { color: '#FFF3EF', fontFamily: 'InterExtraBold' },
  planTerms: { color: '#D0C9D2', fontFamily: 'InterRegular' },
  savings: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  cta: { width: '100%', maxWidth: 390, overflow: 'hidden', backgroundColor: '#E6AADB' },
  ctaFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#E6AADB' },
  ctaText: { color: '#281A29', fontFamily: 'InterExtraBold', textAlign: 'center' },
  disclosure: { maxWidth: 375, color: '#D5BDB8', textAlign: 'center', fontFamily: 'InterRegular' },
  status: { maxWidth: 370, color: '#E8C9A0', textAlign: 'center', fontFamily: 'InterMedium' },
  freeButton: { width: '100%', maxWidth: 390, justifyContent: 'center', alignItems: 'center', borderColor: '#3B3837', borderWidth: 1, backgroundColor: '#151516' },
  freeText: { color: '#D8D2CE', fontFamily: 'InterSemibold' },
  devTestButton: { width: '100%', maxWidth: 390, borderWidth: 1, borderColor: '#3D3453', backgroundColor: '#17131F' },
  devTestLabel: { color: '#8B7EC8', fontFamily: 'InterExtraBold', letterSpacing: 1.1 },
  devTestText: { color: '#C9C1D0', fontFamily: 'InterRegular', marginTop: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  link: { color: '#C6BBAF', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  footerNote: { maxWidth: 365, textAlign: 'center', color: '#868182', fontFamily: 'InterRegular' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalCard: { width: '100%', maxWidth: 360, padding: 24, gap: 18, backgroundColor: '#1A1A1C', borderRadius: 24, borderWidth: 1, borderColor: '#3B3736' },
  modalTitle: { color: '#FFF', fontFamily: 'InterSemibold', fontSize: 15, lineHeight: 22 },
  dismissButton: { alignItems: 'center', padding: 10 },
  dismissButtonText: { color: '#E8C9A0', fontFamily: 'InterExtraBold', fontSize: 14 },
});
