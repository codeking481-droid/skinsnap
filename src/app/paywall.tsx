import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
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
import { usePhoto } from '../PhotoContext';
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

const PLAN_DETAILS: Record<SubscriptionPlan, { name: string; period: string; badge?: string }> = {
  weekly: { name: 'Weekly', period: 'week' },
  monthly: { name: 'Monthly', period: 'month', badge: 'MOST POPULAR' },
  yearly: { name: 'Yearly', period: 'year' },
  yearlyDownsell: { name: 'Eligible yearly offer', period: 'year', badge: 'ONE-TIME OFFER' },
};

const BENEFITS = [
  'Non-diagnostic skin observations',
  'Routine and product ideas',
  'Optional fragrance inspiration',
  'Skin diary and progress tracking',
];

const developmentTestMode = __DEV__ && process.env.EXPO_PUBLIC_AI_DEV_TEST_MODE === 'true';

function hasSecureBackend(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_API_URL?.trim().startsWith('https://'));
}

export default function PaywallScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ offer?: string; next?: string }>();
  const downsell = params.offer === 'downsell';
  const { photoUri, photoUploadConsent } = usePhoto();
  const [selectedBasePlan, setSelectedBasePlan] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const selected: SubscriptionPlan = downsell ? 'yearlyDownsell' : selectedBasePlan;
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [downsellReady, setDownsellReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [ageEligible, setAgeEligible] = useState(false);
  const [sessionReason, setSessionReason] = useState<SessionFailureReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));
  const continueWithAccess = useCallback(() => {
    router.replace(params.next === 'analysis' && photoUri && photoUploadConsent ? '/analysis' : '/');
  }, [params.next, photoUri, photoUploadConsent]);

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
      if (active) setNotice('Your existing subscription could not be verified. You can continue with free skincare tools.');
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
    if (downsell) {
      setBusy(true);
      try {
        await dismissDownsellClaim();
        continueFree();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The offer dismissal could not be confirmed.';
        setCloseMessage(`${message} The offer will not be shown again on this device. You can continue with free skincare tools.`);
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
      setCloseMessage('The exclusive offer could not be checked. You can continue using free skincare tools.');
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
        setNotice('A subscription is active, but sign-in and the secure analysis service are not configured in this app yet.');
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
      setNotice(__DEV__ ? 'RevenueCat is not configured for this build. No purchase state was changed.' : 'Subscriptions are not available yet. No purchase state was changed.');
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

  const activePhotoUri = photoUri && !photoUnavailable ? photoUri : null;
  const showStorePrice = (plan: SubscriptionPlan, product: PurchasesPackage | undefined) =>
    getPaywallPrice(plan, product?.product.priceString, billingState === null).label;
  const storeName = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
  const pricingStatus = billingState === null
    ? `Fetching localised prices from ${storeName} via RevenueCat…`
    : billingState.kind === 'expo-go-preview'
      ? 'Real store prices are available in a native SkinSnap build, not Expo Go.'
      : billingState.kind === 'unconfigured'
        ? 'Store prices require a RevenueCat public SDK key for this platform.'
        : billingState.kind === 'error'
          ? 'Store prices could not be loaded. Check your connection and RevenueCat setup.'
          : !selectedPackage
            ? 'No matching subscription price was returned. Check the RevenueCat offering and Google Play product setup.'
            : null;

  if (downsell && !downsellReady) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 22 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 20 * scale) + 16 }]}>
          <LinearGradient colors={['#101010', '#0A0A0A', '#0A0A0A']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.topActions, { marginBottom: 7 * scale }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={downsell ? 'Back and dismiss exclusive offer' : 'Back from subscription offer'} hitSlop={12} onPress={() => void closePaywall()} style={[styles.iconButton, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text style={[styles.brand, { fontSize: 18 * scale }]}>SkinSnap</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={downsell ? 'Dismiss exclusive offer' : 'Close subscription offer'} hitSlop={12} onPress={() => void closePaywall()} style={[styles.iconButton, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m6 6 12 12M18 6 6 18" /></Svg>
            </Pressable>
          </View>

          {activePhotoUri && <View style={[styles.photoPreview, { height: Math.min(180 * scale, height * 0.23), marginBottom: 14 * scale, borderRadius: 22 * scale }]}>
            <Image source={{ uri: activePhotoUri }} style={styles.selfie} resizeMode="cover" onError={() => setPhotoUnavailable(true)} accessibilityLabel="Your selected selfie" />
            <View style={styles.photoLabel}><Text style={styles.photoLabelText}>YOUR PHOTO · PRIVATE PREVIEW</Text></View>
          </View>}

          <Text style={[styles.eyebrow, { fontSize: 10 * scale }]}>{downsell ? 'ELIGIBLE SUBSCRIPTION OFFER' : 'SKINSNAP PREMIUM'}</Text>
          <Text style={[styles.heading, { fontSize: 28 * scale, lineHeight: 34 * scale, marginTop: 5 * scale }]}>
            {downsell ? <>A personal insight{'\n'}plan, just for you</> : <>Unlock your full{'\n'}Skin Insights</>}
          </Text>
          <Text style={[styles.subheading, { fontSize: 12.5 * scale, lineHeight: 18 * scale, marginTop: 7 * scale }]}>
            Scan your skin · explore routine ideas + optional fragrance inspiration. Photos are processed only after the required access check, your consent and your analysis request.
          </Text>

          <Text style={[styles.benefitsHeading, { fontSize: 10 * scale, marginTop: 17 * scale, marginBottom: 8 * scale }]}>WHAT YOU GET</Text>
          <View style={[styles.benefits, { marginTop: 15 * scale, gap: 12 * scale, padding: 16 * scale, borderRadius: 20 * scale }]}>
            {BENEFITS.map((benefit) => <View key={benefit} style={[styles.benefitRow, { gap: 8 * scale }]}>
              <View style={[styles.check, { width: 17 * scale, height: 17 * scale, borderRadius: 9 * scale }]}><Svg width={10 * scale} height={10 * scale} viewBox="0 0 24 24" fill="none" stroke="#13080D" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg></View>
              <Text style={[styles.benefitText, { fontSize: 11 * scale, lineHeight: 15 * scale }]}>{benefit}</Text>
            </View>)}
          </View>

          <View style={[styles.plans, { gap: 10 * scale, marginTop: 17 * scale }]}>
            {(downsell ? ['yearlyDownsell'] as const : ['weekly', 'monthly', 'yearly'] as const).map((plan) => {
              const product = packages[plan];
              const chosen = selected === plan;
              const detail = plan === 'yearly' && !downsell && annualSavingsPercent !== null
                ? { ...PLAN_DETAILS.yearly, badge: `BEST VALUE · SAVE ${annualSavingsPercent}%` }
                : PLAN_DETAILS[plan];
              return (
                <Pressable
                  key={plan}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={`${detail.name}, ${showStorePrice(plan, product)}, automatically recurring, no free trial`}
                  onPress={() => { if (plan !== 'yearlyDownsell') setSelectedBasePlan(plan); }}
                  style={[styles.planCard, { minHeight: 78 * scale, borderRadius: 18 * scale, paddingHorizontal: 15 * scale, borderColor: chosen ? '#E8C9A0' : '#383638', borderWidth: chosen ? 1.6 : 1 }]}
                >
                  {detail.badge && <View style={[styles.badge, { top: -9 * scale, right: 13 * scale, paddingHorizontal: 9 * scale, paddingVertical: 3 * scale, borderRadius: 9 * scale }]}><Text style={[styles.badgeText, { fontSize: 8.5 * scale }]}>{detail.badge}</Text></View>}
                  <View style={styles.planCopy}>
                    <Text style={[styles.planName, { fontSize: 14.5 * scale }]}>{detail.name}</Text>
                    <Text style={[styles.planPrice, { fontSize: 15 * scale, marginTop: 2 * scale }]}>
                      {showStorePrice(plan, product)}
                    </Text>
                    <Text style={[styles.planTerms, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 2 * scale }]}>
                      {`Billed ${detail.period}ly · auto-renews`}
                    </Text>
                    {downsell && plan === 'yearlyDownsell' && savingsPercent !== null && standardAnnual && <Text style={[styles.savings, { fontSize: 10 * scale, marginTop: 3 * scale }]}>Standard {standardAnnual.product.priceString}/year · save about {savingsPercent}%</Text>}
                  </View>
                  <View style={[styles.radio, { width: 23 * scale, height: 23 * scale, borderRadius: 12 * scale, borderWidth: 1.7 * scale, borderColor: chosen ? '#E8C9A0' : '#777477' }]}>{chosen && <View style={[styles.radioDot, { width: 13 * scale, height: 13 * scale, borderRadius: 7 * scale }]} />}</View>
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
            style={[styles.cta, { minHeight: 56 * scale, borderRadius: 29 * scale, marginTop: 13 * scale, opacity: canPurchase && !busy ? 1 : 0.55 }]}
          >
            <View style={styles.ctaFill}>
              <Text style={[styles.ctaText, { fontSize: 15 * scale }]}>
                {busy ? 'Connecting securely…' : !SUBSCRIPTION_PURCHASES_ENABLED ? 'Purchases unavailable in this build' : selectedPackage ? 'Continue' : 'Subscription not available'}
              </Text>
            </View>
          </Pressable>
          <Text style={[styles.disclosure, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 6 * scale }]}>
            No free trial or introductory price. Billed {PLAN_DETAILS[selected].period} and automatically renews until cancelled. Cancel in {Platform.OS === 'ios' ? 'your Apple account settings' : 'Google Play subscriptions'}.
          </Text>
          {!canPurchase && <Text style={[styles.status, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 5 * scale }]}>
            {!SUBSCRIPTION_PURCHASES_ENABLED
                ? 'Purchases and paid analysis are disabled in this build. You can continue with free skincare tools; no charge or analysis request will occur.'
              : !storeReady
                ? __DEV__ ? billingState?.message ?? 'Loading Google Play subscription details…' : 'Subscriptions are not available yet. No purchase has been made.'
                : !hasSession
                    ? sessionReason
                      ? sessionFailureMessage({ valid: false, reason: sessionReason })
                      : 'A secure guest identity is required before a purchase. No email sign-up is needed.'
                : !legalConfigured
                  ? 'Purchases are disabled until secure HTTPS Terms and Privacy URLs are configured.'
                : !hasSecureBackend()
                    ? 'Purchases are disabled until the secure analysis service is configured.'
                    : downsell && savingsPercent === null
                      ? 'Exclusive pricing could not be verified against the standard annual product.'
                      : 'This product is not available right now.'}
          </Text>}
          {developmentTestMode && hasSession && !downsell && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Run development-only AI analysis test without purchasing"
            onPress={() => router.replace('/analysis')}
            style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale, borderColor: '#8A7458', borderWidth: 1 }]}
          >
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>Development-only AI test · no purchase</Text>
          </Pressable>}

          {!downsell && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>Continue with free skincare tools</Text>
          </Pressable>}
          {downsell && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>No thanks · continue free</Text>
          </Pressable>}

          <View style={[styles.footer, { marginTop: 15 * scale, gap: 13 * scale }]}>
            <Pressable accessibilityRole="button" onPress={() => void restore()}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Restore Purchases</Text></Pressable>
            {!hasSession && developmentTestMode && <Pressable accessibilityRole="link" onPress={() => router.push('/sign-in')}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Sign in for test</Text></Pressable>}
            <Pressable accessibilityRole="link" onPress={() => void openLegal('terms')}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Terms</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => void openLegal('privacy')}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Privacy</Text></Pressable>
          </View>
          <Text style={[styles.footerNote, { fontSize: 8.5 * scale, lineHeight: 12 * scale, marginTop: 7 * scale }]}>
            Store-localised price shown before confirmation. SkinSnap does not offer a free trial. Image conditions affect observations; not a medical diagnosis.
          </Text>
        </View>
      </ScrollView>
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
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A', alignItems: 'center' },
  topActions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconButton: { justifyContent: 'center', alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: '#343436', backgroundColor: '#1A1A1C' },
  brand: { color: '#FFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  photoPreview: { width: '100%', maxWidth: 390, overflow: 'hidden', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#363436' },
  selfie: { width: '100%', height: '100%' },
  photoLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(10,10,10,0.7)' },
  photoLabelText: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 9, letterSpacing: 0.8 },
  eyebrow: { color: '#D4B896', fontFamily: 'InterExtraBold', letterSpacing: 1.5, textAlign: 'center' },
  heading: { maxWidth: 355, color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.65 },
  subheading: { maxWidth: 350, color: '#B9B4B5', fontFamily: 'InterRegular', textAlign: 'center' },
  benefitsHeading: { color: '#D4B896', fontFamily: 'InterExtraBold', letterSpacing: 1.5, textAlign: 'center' },
  benefits: { width: '100%', maxWidth: 390, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  benefitRow: { flexDirection: 'row', alignItems: 'center' },
  check: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8C9A0' },
  benefitText: { color: '#F0EBF0', fontFamily: 'InterMedium', flex: 1 },
  plans: { width: '100%', maxWidth: 390 },
  planCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, position: 'relative', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  badge: { position: 'absolute', zIndex: 2, backgroundColor: '#E8C9A0' },
  badgeText: { color: '#181613', fontFamily: 'InterExtraBold', letterSpacing: 0.4 },
  radio: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { backgroundColor: '#E8C9A0' },
  planCopy: { flex: 1, paddingVertical: 12 },
  planName: { color: '#FFF', fontFamily: 'InterExtraBold' },
  planPrice: { color: '#FFF', fontFamily: 'InterExtraBold' },
  planTerms: { color: '#D0C9D2', fontFamily: 'InterRegular' },
  savings: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  cta: { width: '100%', maxWidth: 390, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  ctaFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#FFFFFF' },
  ctaText: { color: '#171717', fontFamily: 'InterExtraBold', textAlign: 'center' },
  disclosure: { maxWidth: 375, color: '#A9A3A4', textAlign: 'center', fontFamily: 'InterRegular' },
  status: { maxWidth: 370, color: '#E8C9A0', textAlign: 'center', fontFamily: 'InterMedium' },
  freeButton: { width: '100%', maxWidth: 390, justifyContent: 'center', alignItems: 'center', borderColor: '#3B3837', borderWidth: 1, backgroundColor: '#151516' },
  freeText: { color: '#D8D2CE', fontFamily: 'InterSemibold' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  link: { color: '#C6BBAF', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  footerNote: { maxWidth: 365, textAlign: 'center', color: '#868182', fontFamily: 'InterRegular' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalCard: { width: '100%', maxWidth: 360, padding: 24, gap: 18, backgroundColor: '#1A1A1C', borderRadius: 24, borderWidth: 1, borderColor: '#3B3736' },
  modalTitle: { color: '#FFF', fontFamily: 'InterSemibold', fontSize: 15, lineHeight: 22 },
  dismissButton: { alignItems: 'center', padding: 10 },
  dismissButtonText: { color: '#E8C9A0', fontFamily: 'InterExtraBold', fontSize: 14 },
});
