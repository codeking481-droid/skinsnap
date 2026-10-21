import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';
import { usePhoto } from '../PhotoContext';
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
import { verifyAuthenticatedSession } from '../services/session';

const PLAN_DETAILS: Record<SubscriptionPlan, { name: string; period: string; badge?: string }> = {
  weekly: { name: 'Weekly', period: 'week' },
  yearly: { name: 'Yearly', period: 'year', badge: 'BEST VALUE' },
  yearlyDownsell: { name: 'Exclusive yearly', period: 'year', badge: 'ONE-TIME OFFER' },
};

const BENEFITS = [
  'AI-assisted, non-diagnostic skin observations',
  'A routine tailored to your visible skin goals',
  'Progress history and follow-up tracking',
];

const developmentTestMode = process.env.EXPO_PUBLIC_AI_DEV_TEST_MODE === 'true';

function hasSecureBackend(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_API_URL?.trim().startsWith('https://'));
}

export default function PaywallScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ offer?: string }>();
  const downsell = params.offer === 'downsell';
  const { photoUri } = usePhoto();
  const [selectedBasePlan, setSelectedBasePlan] = useState<'weekly' | 'yearly'>('yearly');
  const selected: SubscriptionPlan = downsell ? 'yearlyDownsell' : selectedBasePlan;
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [downsellReady, setDownsellReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [sessionReason, setSessionReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([
      loadBillingState(downsell),
      verifyAuthenticatedSession(),
      downsell ? getActiveDownsellClaim() : Promise.resolve(null),
    ]).then(([state, session, claim]) => {
      if (!active) return;
      setBillingState(state);
      setHasSession(session.valid);
      setSessionReason(session.valid ? null : session.reason);
      if (downsell) {
        if (!claim) {
          router.replace('/routine');
          return;
        }
        setDownsellReady(true);
      }
    }).catch(() => {
      if (!active) return;
      setBillingState({ kind: 'error', message: 'Could not prepare subscription information.' });
      if (downsell) router.replace('/routine');
    });
    return () => { active = false; };
  }, [downsell]));

  useEffect(() => {
    let active = true;
    getVerifiedEntitlement().then((status) => {
      if (active && status.active) router.replace('/analysis');
    });
    return () => { active = false; };
  }, []);

  const packages = billingState?.kind === 'ready' ? billingState.packages : {};
  const selectedPackage = packages[selected];
  const standardAnnual = packages.yearly;
  const annualDownsell = packages.yearlyDownsell;
  const savingsPercent = useMemo(() => {
    if (!standardAnnual || !annualDownsell) return null;
    return calculateSavingsPercent(
      standardAnnual.product.price,
      annualDownsell.product.price,
      standardAnnual.product.currencyCode,
      annualDownsell.product.currencyCode,
    );
  }, [annualDownsell, standardAnnual]);
  const storeReady = billingState?.kind === 'ready';
  const legalConfigured = [process.env.EXPO_PUBLIC_TERMS_URL, process.env.EXPO_PUBLIC_PRIVACY_URL]
    .every((url) => Boolean(url && url.startsWith('https://')));
  const canPurchase = storeReady
    && Boolean(selectedPackage)
    && hasSession
    && legalConfigured
    && hasSecureBackend()
    && (!downsell || (downsellReady && savingsPercent !== null));

  const continueFree = useCallback(() => {
    router.replace('/routine');
  }, []);

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
            router.push({ pathname: '/paywall', params: { offer: 'downsell' } });
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
  }, [busy, continueFree, downsell]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void closePaywall();
      return true;
    });
    return () => subscription.remove();
  }, [closePaywall]));

  const buySelectedPlan = async () => {
    if (busy || !canPurchase) return;
    setBusy(true);
    const result = await purchasePlan(selected, selectedPackage);
    if (result.kind === 'active') {
      if (downsell) consumeDownsellClaim();
      router.replace('/analysis');
      return;
    }
    if (result.kind === 'cancelled') setNotice('Purchase cancelled. No subscription was started.');
    else if (result.kind === 'pending') setNotice('Google Play is processing your payment. Premium access stays locked until the store confirms it.');
    else if (result.kind === 'inactive') setNotice('The store has not confirmed an active SkinSnap entitlement. No analysis was started.');
    else setNotice(result.message);
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
        router.replace('/analysis');
        return;
      }
    } else if (status.reason === 'inactive') {
      setNotice('No active SkinSnap subscription was found for this Google Play account.');
    } else if (status.reason === 'preview') {
      setNotice('Restore Purchases is available only in an Android development or store build.');
    } else if (status.reason === 'unconfigured') {
      setNotice('RevenueCat is not configured for this build. No purchase state was changed.');
    } else {
      setNotice('Could not verify purchases. Check your connection and try again.');
    }
    setBusy(false);
  };

  const openLegal = async (kind: 'terms' | 'privacy') => {
    const url = kind === 'terms' ? process.env.EXPO_PUBLIC_TERMS_URL : process.env.EXPO_PUBLIC_PRIVACY_URL;
    if (!url) {
      setNotice(`${kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'} URL is not configured. Purchases must remain disabled until the required legal URL is published.`);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setNotice(`Could not open the ${kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'} link.`);
    }
  };

  const activePhotoUri = photoUri && !photoUnavailable ? photoUri : null;
  const showStorePrice = (plan: SubscriptionPlan, product: PurchasesPackage | undefined) => {
    if (!product) return storeReady ? 'Plan unavailable' : 'Price loads in Android test build';
    const period = plan === 'weekly' ? 'week' : 'year';
    return `${product.product.priceString} / ${period}`;
  };

  if (downsell && !downsellReady) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 22 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 20 * scale) }]}>
          <Image source={require('../../assets/images/welcome-portrait.png')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient colors={['rgba(3,3,7,0.35)', 'rgba(3,3,7,0.79)', 'rgba(3,3,7,0.98)', '#040408']} locations={[0, 0.31, 0.65, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.topActions, { marginBottom: 7 * scale }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={downsell ? 'Back and dismiss exclusive offer' : 'Back from subscription offer'} hitSlop={12} onPress={() => void closePaywall()} style={[styles.iconButton, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text style={[styles.brand, { fontSize: 18 * scale }]}>Skin<Text style={styles.pink}>Snap</Text></Text>
            <Pressable accessibilityRole="button" accessibilityLabel={downsell ? 'Dismiss exclusive offer' : 'Close subscription offer'} hitSlop={12} onPress={() => void closePaywall()} style={[styles.iconButton, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m6 6 12 12M18 6 6 18" /></Svg>
            </Pressable>
          </View>

          <View style={[styles.photoGlow, { width: 112 * scale, height: 112 * scale, marginTop: 1 * scale, marginBottom: 8 * scale }]}>
            <LinearGradient colors={['#FFB0C7', '#FF4381', '#832544']} style={[styles.photoHalo, { borderRadius: 60 * scale, padding: 3 * scale }]}>
              <View style={[styles.photoInner, { borderRadius: 56 * scale }]}>
                {activePhotoUri
                  ? <Image source={{ uri: activePhotoUri }} style={styles.selfie} resizeMode="cover" onError={() => setPhotoUnavailable(true)} accessibilityLabel="Your selected selfie" />
                  : <Svg width={34 * scale} height={34 * scale} viewBox="0 0 24 24" fill="none" stroke="#FF8EAE" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="9" /><Path d="M8 14s1.5 2 4 2 4-2 4-2m-7-4h.01M15 10h.01" /></Svg>}
              </View>
            </LinearGradient>
            <View pointerEvents="none" style={[styles.glow, { borderRadius: 70 * scale }]} />
          </View>

          <Text style={[styles.eyebrow, { fontSize: 10 * scale }]}>{downsell ? 'EXCLUSIVE ONE-TIME OFFER' : 'SKINSNAP PREMIUM'}</Text>
          <Text style={[styles.heading, { fontSize: 28 * scale, lineHeight: 34 * scale, marginTop: 5 * scale }]}>
            {downsell ? <>A personal insight{'\n'}plan, just for you</> : <>Unlock Your Personal{'\n'}Skin Insights</>}
          </Text>
          <Text style={[styles.subheading, { fontSize: 12.5 * scale, lineHeight: 18 * scale, marginTop: 7 * scale }]}>
            Full, non-diagnostic skin observations, a personalised routine and progress tracking. Your photo is only sent after purchase, consent and a request.
          </Text>

          <View style={[styles.benefits, { marginTop: 12 * scale, gap: 7 * scale }]}>
            {BENEFITS.map((benefit) => <View key={benefit} style={[styles.benefitRow, { gap: 8 * scale }]}>
              <View style={[styles.check, { width: 17 * scale, height: 17 * scale, borderRadius: 9 * scale }]}><Svg width={10 * scale} height={10 * scale} viewBox="0 0 24 24" fill="none" stroke="#13080D" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg></View>
              <Text style={[styles.benefitText, { fontSize: 11 * scale, lineHeight: 15 * scale }]}>{benefit}</Text>
            </View>)}
          </View>

          <View style={[styles.plans, { gap: 9 * scale, marginTop: 15 * scale }]}>
            {(downsell ? ['yearlyDownsell'] as const : ['weekly', 'yearly'] as const).map((plan) => {
              const product = packages[plan];
              const chosen = selected === plan;
              const detail = PLAN_DETAILS[plan];
              return (
                <Pressable
                  key={plan}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={`${detail.name}, ${showStorePrice(plan, product)}, automatically recurring, no free trial`}
                  onPress={() => { if (plan !== 'yearlyDownsell') setSelectedBasePlan(plan); }}
                  style={[styles.planCard, { minHeight: 70 * scale, borderRadius: 18 * scale, paddingHorizontal: 13 * scale, borderColor: chosen ? '#FF5D91' : '#4C4049', borderWidth: chosen ? 1.6 : 1 }]}
                >
                  {detail.badge && <View style={[styles.badge, { top: -9 * scale, right: 13 * scale, paddingHorizontal: 9 * scale, paddingVertical: 3 * scale, borderRadius: 9 * scale }]}><Text style={[styles.badgeText, { fontSize: 8.5 * scale }]}>{detail.badge}</Text></View>}
                  <View style={[styles.radio, { width: 23 * scale, height: 23 * scale, borderRadius: 12 * scale, borderWidth: 1.7 * scale, borderColor: chosen ? '#FF6A99' : '#8C7B86' }]}>{chosen && <View style={[styles.radioDot, { width: 13 * scale, height: 13 * scale, borderRadius: 7 * scale }]} />}</View>
                  <View style={styles.planCopy}>
                    <Text style={[styles.planName, { fontSize: 14.5 * scale }]}>{detail.name}</Text>
                    <Text style={[styles.planTerms, { fontSize: 10 * scale, marginTop: 3 * scale }]}>{showStorePrice(plan, product)} · auto-renews</Text>
                    {downsell && plan === 'yearlyDownsell' && savingsPercent !== null && standardAnnual && <Text style={[styles.savings, { fontSize: 10 * scale, marginTop: 3 * scale }]}>Standard {standardAnnual.product.priceString}/year · save about {savingsPercent}%</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPurchase || busy }}
            disabled={!canPurchase || busy}
            onPress={() => void buySelectedPlan()}
            style={[styles.cta, { minHeight: 54 * scale, borderRadius: 29 * scale, marginTop: 13 * scale, opacity: canPurchase && !busy ? 1 : 0.55 }]}
          >
            <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.ctaFill}>
              <Text style={[styles.ctaText, { fontSize: 15 * scale }]}>{busy ? 'Connecting securely…' : selectedPackage ? `Subscribe · ${showStorePrice(selected, selectedPackage)}` : 'Subscription not available'}</Text>
            </LinearGradient>
          </Pressable>
          <Text style={[styles.disclosure, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 6 * scale }]}>
            No free trial or introductory price. {selected === 'weekly' ? 'Billed weekly' : 'Billed annually'} and automatically renews until cancelled. Cancel in Google Play subscriptions.
          </Text>
          {!canPurchase && <Text style={[styles.status, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 5 * scale }]}>
            {billingState?.kind === 'expo-go-preview'
              ? 'Development-only Expo Go billing preview · purchases and premium access are disabled.'
              : !storeReady
                ? billingState?.message ?? 'Loading Google Play subscription details…'
                : !hasSession
                    ? sessionReason === 'expired'
                      ? 'Your sign-in needs refreshing before a purchase can be made.'
                      : sessionReason === 'identity-mismatch'
                        ? 'Your signed-in account does not match the RevenueCat customer. Purchases are disabled.'
                        : sessionReason === 'backend-unavailable'
                          ? 'The authenticated account service is unavailable.'
                          : 'Purchases are disabled until authenticated sign-in is configured.'
                : !legalConfigured
                  ? 'Purchases are disabled until secure HTTPS Terms and Privacy URLs are configured.'
                : !hasSecureBackend()
                    ? 'Purchases are disabled until the secure analysis service is configured.'
                    : downsell && savingsPercent === null
                      ? 'Exclusive pricing could not be verified against the standard annual product.'
                      : 'This product is not available right now.'}
          </Text>}
          {!hasSession && <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={[styles.signInButton, { minHeight: 40 * scale, borderRadius: 21 * scale, marginTop: 6 * scale }]}>
            <Text style={[styles.signInText, { fontSize: 11 * scale }]}>Sign in or create an account</Text>
          </Pressable>}

          {developmentTestMode && hasSession && !downsell && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Run development-only AI analysis test without purchasing"
            onPress={() => router.replace('/analysis')}
            style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale, borderColor: '#A84B70', borderWidth: 1 }]}
          >
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>Development-only AI test · no purchase</Text>
          </Pressable>}

          {!downsell && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>Continue with free skincare tools</Text>
          </Pressable>}
          {downsell && <Pressable accessibilityRole="button" onPress={() => void closePaywall()} style={[styles.freeButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 7 * scale }]}>
            <Text style={[styles.freeText, { fontSize: 11.5 * scale }]}>No thanks · continue free</Text>
          </Pressable>}

          <View style={[styles.footer, { marginTop: 11 * scale, gap: 13 * scale }]}>
            <Pressable accessibilityRole="button" onPress={() => void restore()}><Text style={[styles.link, { fontSize: 9.5 * scale }]}>Restore Purchases</Text></Pressable>
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
  screen: { flex: 1, backgroundColor: '#040408' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#040408', alignItems: 'center' },
  topActions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconButton: { justifyContent: 'center', alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.27)', backgroundColor: 'rgba(10,8,13,0.45)' },
  brand: { color: '#FFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  pink: { color: '#FF6395' },
  photoGlow: { justifyContent: 'center', alignItems: 'center' },
  photoHalo: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  photoInner: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#20131A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#100A0E' },
  selfie: { width: '100%', height: '100%' },
  glow: { position: 'absolute', width: '130%', height: '130%', backgroundColor: 'rgba(255,63,128,0.13)' },
  eyebrow: { color: '#FF88AA', fontFamily: 'InterExtraBold', letterSpacing: 1.5, textAlign: 'center' },
  heading: { maxWidth: 355, color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.65 },
  subheading: { maxWidth: 350, color: '#D9D4DD', fontFamily: 'InterRegular', textAlign: 'center' },
  benefits: { width: '100%', maxWidth: 360 },
  benefitRow: { flexDirection: 'row', alignItems: 'center' },
  check: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#FF83A8' },
  benefitText: { color: '#F0EBF0', fontFamily: 'InterMedium', flex: 1 },
  plans: { width: '100%', maxWidth: 390 },
  planCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, position: 'relative', backgroundColor: 'rgba(15,13,19,0.91)' },
  badge: { position: 'absolute', zIndex: 2, backgroundColor: '#FF79A2' },
  badgeText: { color: '#18080F', fontFamily: 'InterExtraBold', letterSpacing: 0.4 },
  radio: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { backgroundColor: '#FF6395' },
  planCopy: { flex: 1, paddingVertical: 11 },
  planName: { color: '#FFF', fontFamily: 'InterExtraBold' },
  planTerms: { color: '#D0C9D2', fontFamily: 'InterRegular' },
  savings: { color: '#FF9CBA', fontFamily: 'InterSemibold' },
  cta: { width: '100%', maxWidth: 390, overflow: 'hidden', borderColor: '#FFA7C1', borderWidth: 0.7, boxShadow: '0px 0px 22px 1px rgba(255, 70, 130, 0.34)' },
  ctaFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ctaText: { color: '#12070C', fontFamily: 'InterExtraBold', textAlign: 'center' },
  disclosure: { maxWidth: 375, color: '#C6BDC9', textAlign: 'center', fontFamily: 'InterRegular' },
  status: { maxWidth: 370, color: '#FFB1C7', textAlign: 'center', fontFamily: 'InterMedium' },
  freeButton: { width: '100%', maxWidth: 390, justifyContent: 'center', alignItems: 'center', borderColor: '#5A4753', borderWidth: 1, backgroundColor: 'rgba(18,15,21,0.9)' },
  freeText: { color: '#E8DCE4', fontFamily: 'InterSemibold' },
  signInButton: { width: '100%', maxWidth: 390, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#815067', backgroundColor: 'rgba(39,22,33,0.65)' },
  signInText: { color: '#FFD4E1', fontFamily: 'InterSemibold' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  link: { color: '#E5DDE6', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  footerNote: { maxWidth: 365, textAlign: 'center', color: '#B0A7B3', fontFamily: 'InterRegular' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalCard: { width: '100%', maxWidth: 360, padding: 24, gap: 18, backgroundColor: '#181016', borderRadius: 24, borderWidth: 1, borderColor: '#773049' },
  modalTitle: { color: '#FFF', fontFamily: 'InterSemibold', fontSize: 15, lineHeight: 22 },
  dismissButton: { alignItems: 'center', padding: 10 },
  dismissButtonText: { color: '#FF92B4', fontFamily: 'InterExtraBold', fontSize: 14 },
});
