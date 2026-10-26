import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Constants from 'expo-constants';
import type { CustomerInfo } from 'react-native-purchases';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainBottomNav } from '../components/MainBottomNav';
import { restartOnboarding } from '../preferences';
import { getVerifiedEntitlement, loadBillingState, restorePurchases, type BillingState } from '../services/billing';
import { isAnonymousSession, verifyAuthenticatedSession } from '../services/session';
import { PREMIUM_ENTITLEMENT_ID, productMatches, SUBSCRIPTION_PRODUCTS, type SubscriptionPlan } from '../subscriptionRules';

type RowIconName = 'preferences' | 'diary' | 'routine' | 'plans' | 'restore' | 'history' | 'privacy' | 'terms';
type RowProps = { icon: RowIconName; title: string; detail?: string; onPress: () => void; last?: boolean };

function RowGlyph({ name }: { name: RowIconName }) {
  return <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#D4B896" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {name === 'preferences' && <><Circle cx="12" cy="12" r="8" /><Path d="M8.5 14s1.3-1.5 3.5-1.5 3.5 1.5 3.5 1.5M9 9h.01M15 9h.01" /></>}
    {name === 'diary' && <><Rect x="5" y="4" width="14" height="17" rx="2" /><Path d="M9 9h6m-6 4h6m-6 4h3" /></>}
    {name === 'routine' && <><Path d="M5 6h2m4 0h8M5 12h2m4 0h8M5 18h2m4 0h8" /><Circle cx="8" cy="6" r=".8" /><Circle cx="8" cy="12" r=".8" /><Circle cx="8" cy="18" r=".8" /></>}
    {name === 'plans' && <Path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />}
    {name === 'restore' && <><Path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7" /><Path d="M12 7v5l3 2" /></>}
    {name === 'history' && <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2M3 12H1" /></>}
    {name === 'privacy' && <Path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Zm-3 9 2 2 4-4" />}
    {name === 'terms' && <><Path d="M6 3h8l4 4v14H6z" /><Path d="M14 3v5h5M9 12h6m-6 4h6" /></>}
  </Svg>;
}

function ProfileRow({ icon, title, detail, onPress, last = false }: RowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowIcon}><RowGlyph name={icon} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#858183" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="m9 18 6-6-6-6" /></Svg>
    </Pressable>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>;
}

function activeSubscriptionLabel(customerInfo: CustomerInfo, billingState: BillingState): string {
  const entitlement = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  if (!entitlement) return 'Active subscription verified';

  const matchingPlan = (Object.entries(SUBSCRIPTION_PRODUCTS) as [SubscriptionPlan, string][])
    .find(([, productId]) => productMatches(entitlement.productIdentifier, productId));
  if (!matchingPlan) return 'Active subscription verified';

  const [plan, productId] = matchingPlan;
  const planName = plan === 'yearlyDownsell' ? 'Yearly' : plan[0].toUpperCase() + plan.slice(1);
  const packages = billingState.kind === 'ready' ? Object.values(billingState.packages) : [];
  const product = packages.find(item => item && productMatches(item.product.identifier, productId));
  const period = plan === 'weekly' ? 'week' : plan === 'monthly' ? 'month' : 'year';
  const price = product?.product.priceString;
  const expiryDate = entitlement.expirationDate ? new Date(entitlement.expirationDate) : null;
  const expiry = expiryDate && !Number.isNaN(expiryDate.valueOf())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(expiryDate)
    : null;
  return `${planName} plan${price ? ` · ${price}/${period}` : ''}${expiry ? ` · access through ${expiry}` : ''}`;
}

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [accountStatus, setAccountStatus] = useState('Checking your secure profile…');
  const [subscriptionStatus, setSubscriptionStatus] = useState('Checking subscription access…');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const maxWidth = Math.min(width, 520);

  const refresh = useCallback(async () => {
    try {
      const [session, entitlement, billingState] = await Promise.all([
        verifyAuthenticatedSession(),
        getVerifiedEntitlement(),
        loadBillingState(true),
      ]);
      if (session.valid) {
        const guest = await isAnonymousSession();
        setAccountStatus(guest ? 'Secure guest profile on this device' : 'Signed-in SkinSnap account');
      } else {
        setAccountStatus('No verified profile on this device');
      }
      setSubscriptionStatus(entitlement.active
        ? activeSubscriptionLabel(entitlement.customerInfo, billingState)
        : entitlement.reason === 'unconfigured'
          ? 'Store billing is not configured in this build'
          : entitlement.reason === 'preview'
            ? 'Available in a native store build'
            : entitlement.reason === 'error'
              ? 'Could not verify right now'
              : 'No active subscription verified');
    } catch {
      setAccountStatus('Profile status could not be checked');
      setSubscriptionStatus('Subscription status could not be checked');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Checking purchases with the app store…');
    try {
      const result = await restorePurchases();
      setStatus(result.active
        ? 'The store confirmed an active SkinSnap subscription.'
        : result.reason === 'inactive'
          ? 'No active SkinSnap subscription was found for this store account.'
          : result.reason === 'preview'
            ? 'Restore is available in a native Android or iOS build, not Expo Go.'
            : result.reason === 'unconfigured'
              ? 'Store restore is unavailable because billing is not configured for this build.'
              : 'The store could not verify purchases. Check your connection and try again.');
      await refresh();
    } catch {
      setStatus('Purchases could not be checked. No subscription status was changed.');
    } finally {
      setBusy(false);
    }
  };

  const replayOnboarding = () => Alert.alert(
    'Replay the introduction?',
    'You can revisit the SkinSnap welcome and privacy steps. Your saved preferences and history will stay unchanged.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replay',
        onPress: () => {
          void restartOnboarding().then(() => router.replace('/onboarding')).catch(() => {
            setStatus('The introduction could not be restarted. Your profile was not changed.');
          });
        },
      },
    ],
  );
  const manageSubscription = async () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    try {
      await Linking.openURL(url);
    } catch {
      setStatus('Could not open store subscription management. Please manage your plan in the app store.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { width: maxWidth, paddingHorizontal: 20, paddingBottom: 22 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR SPACE</Text>
          <Text accessibilityRole="header" style={styles.heading}>Profile</Text>
          <Text style={styles.intro}>Your account, preferences and privacy in one place.</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.identityCard}>
          <View style={styles.avatar}><Svg width={29} height={29} viewBox="0 0 24 24" fill="none" stroke="#E8C9A0" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></Svg></View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>SkinSnap profile</Text>
            <Text style={styles.identityDetail}>{accountStatus}</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#858183" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="m9 18 6-6-6-6" /></Svg>
        </Pressable>

        <ProfileSection title="YOUR SKIN">
          <ProfileRow icon="preferences" title="Skin preferences" detail="Your self-described preferences" onPress={() => router.push('/skin-preferences')} />
          <ProfileRow icon="diary" title="Skin diary" detail="Personal check-ins and notes" onPress={() => router.push('/skin-diary')} />
          <ProfileRow icon="routine" title="Routine" detail="Manage your daily steps" onPress={() => router.push('/routine')} last />
        </ProfileSection>

        <ProfileSection title="MEMBERSHIP">
          <View style={styles.subscriptionRow}>
            <View style={styles.subscriptionIcon}><Text style={styles.subscriptionIconText}>✦</Text></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>SkinSnap Premium</Text>
              <Text style={styles.rowDetail}>{subscriptionStatus}</Text>
            </View>
          </View>
          <ProfileRow icon="plans" title="View plans" detail="Store pricing shown before purchase" onPress={() => router.push('/paywall')} />
          <ProfileRow icon="plans" title="Manage subscription" detail="Open your app store subscription settings" onPress={() => void manageSubscription()} />
          <ProfileRow icon="restore" title={busy ? 'Checking purchases…' : 'Restore purchases'} onPress={() => void restore()} last />
        </ProfileSection>

        <ProfileSection title="PRIVACY & SUPPORT">
          <ProfileRow icon="history" title="Scan history" detail="Review saved observations" onPress={() => router.push('/progress')} />
          <ProfileRow icon="privacy" title="Privacy & data" detail="How your information is handled" onPress={() => router.push('/privacy')} />
          <ProfileRow icon="terms" title="Terms of service" onPress={() => router.push('/terms')} />
          <ProfileRow icon="preferences" title="Replay the introduction" detail="Review SkinSnap onboarding" onPress={replayOnboarding} last />
        </ProfileSection>

        {busy && <ActivityIndicator color="#E8C9A0" style={styles.spinner} />}
        {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
        <Text style={styles.version}>SkinSnap · Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text style={styles.disclaimer}>Skin observations are cosmetic information, not a medical diagnosis.</Text>
      </ScrollView>
      <MainBottomNav active="profile" bottomInset={insets.bottom} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', backgroundColor: '#0A0A0A' },
  content: { flexGrow: 1 },
  header: { paddingTop: 17, paddingBottom: 21 },
  eyebrow: { color: '#D4B896', fontSize: 10, letterSpacing: 1.6, fontFamily: 'InterSemibold' },
  heading: { color: '#FFFFFF', fontSize: 31, lineHeight: 39, marginTop: 5, fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  intro: { color: '#969193', fontSize: 13, lineHeight: 19, marginTop: 3, fontFamily: 'InterRegular' },
  identityCard: { minHeight: 83, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, borderRadius: 19, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C', marginBottom: 24 },
  avatar: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: '#252321', borderWidth: 1, borderColor: '#504538' },
  identityCopy: { flex: 1, gap: 4 },
  identityTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: 'InterSemibold' },
  identityDetail: { color: '#9C9696', fontSize: 11, lineHeight: 15, fontFamily: 'InterRegular' },
  section: { marginBottom: 21 },
  sectionTitle: { color: '#817C7D', fontSize: 10, letterSpacing: 1.4, fontFamily: 'InterSemibold', marginBottom: 9, marginLeft: 4 },
  sectionCard: { backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C', borderRadius: 18, paddingHorizontal: 13 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343234' },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#262422' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: '#F4F1EF', fontSize: 13, fontFamily: 'InterSemibold' },
  rowDetail: { color: '#898486', fontSize: 10.5, lineHeight: 14, fontFamily: 'InterRegular' },
  subscriptionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343234' },
  subscriptionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#302A21' },
  subscriptionIconText: { color: '#E8C9A0', fontSize: 17 },
  spinner: { marginVertical: 10 },
  status: { color: '#E8C9A0', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 3, fontFamily: 'InterMedium' },
  version: { color: '#777274', textAlign: 'center', marginTop: 8, fontSize: 10, fontFamily: 'InterRegular' },
  disclaimer: { color: '#696567', textAlign: 'center', marginTop: 6, marginBottom: 5, fontSize: 9, lineHeight: 14, fontFamily: 'InterRegular' },
});
