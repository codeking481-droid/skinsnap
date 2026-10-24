import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINIMUM_USER_AGE, PUBLISHED_PRIVACY_POLICY_URL } from '../privacy';

export default function PrivacyScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const pageWidth = Math.min(width, 520);

  const openPolicy = async () => {
    if (busy) return;
    if (!PUBLISHED_PRIVACY_POLICY_URL) {
      Alert.alert('Public policy unavailable', 'SkinSnap does not yet have a verified, published Privacy Policy URL.');
      return;
    }
    setBusy(true);
    try {
      await Linking.openURL(PUBLISHED_PRIVACY_POLICY_URL);
    } catch {
      Alert.alert('Could not open policy', 'The public Privacy Policy could not be opened right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#10080E', '#08070C', '#050509']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]}>
        <View style={[styles.page, { width: pageWidth, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.brand}>Skin<Text style={styles.pink}>Snap</Text></Text>
          <Text accessibilityRole="header" style={styles.title}>Privacy <Text style={styles.pink}>information</Text></Text>
          <Text style={styles.lead}>A plain-language summary of how the current app handles your photo and account data.</Text>

          <Section title="Photo processing">
            <Text style={styles.copy}>Only submit a photo after you give explicit consent. SkinSnap prepares a JPEG copy on your device and sends it over HTTPS to the authenticated SkinSnap service. The service sends the image to Groq for cosmetic visual observations and does not intentionally save the raw image to Supabase. Provider-side handling and retention are governed by provider settings and terms, which SkinSnap has not verified for its account.</Text>
            <Text style={styles.copy}>SkinSnap attempts to remove its prepared JPEG file after the request ends. If cleanup fails, the app reports that error. A camera or gallery source file is not deleted by SkinSnap, and the operating system may retain temporary source files in its app or media storage.</Text>
          </Section>

          <Section title="AI providers and results">
            <Text style={styles.copy}>Groq receives the image for visual observations, then text observations and any optional routine preferences to generate general morning and evening skincare guidance. Optional answers stay in the session unless you explicitly save My Skin Preferences. Saved preferences, custom routines and diary check-ins are private account records when the retention server update is enabled. Diary notes and routine edits are not sent to Groq. Relevant saved preferences are sent only with a consented analysis. Lighting, camera quality, and filters can affect observations. Results are cosmetic information only, not a diagnosis or medical advice.</Text>
            <Text style={styles.copy}>SkinSnap saves structured analysis results for account history and routine screens. Failed jobs may leave a status and attempt record, but do not store the uploaded image in the app database. Provider-side logs, review, and retention are controlled by each provider’s terms and account settings; SkinSnap cannot delete provider-held copies through this app.</Text>
          </Section>

          <Section title="Local and account data">
            <Text style={styles.copy}>You can explore SkinSnap without an email account. A secure guest profile is created only when an account-backed feature needs it. Guest history is tied to the secure profile saved on this installation; email recovery is not enabled, so clearing app data or reinstalling may make that history inaccessible. Routine completion is also kept in an app document on this device. Sign-in tokens are kept in platform secure storage.</Text>
            <Text style={styles.copy}>Account deletion is available from Progress → Account &amp; data settings. It requests removal of the known SkinSnap server records and authenticated Supabase account, including saved preferences, routine edits and diary entries, then removes account-scoped routine progress from this device. You can also remove preferences, reset edits or delete individual diary entries from their screens.</Text>
            <Text style={styles.copy}>The live database schema and provider-side deletion cannot be verified from this app screen. A deletion error may mean some records were already removed; sign in again and retry. Do not interpret a successful account response as proof that third-party copies or local files on other devices were erased.</Text>
          </Section>

          <Section title="Your choices and support">
            <Text style={styles.copy}>You may decline photo consent, choose another photo, or leave without requesting analysis. To withdraw consent before upload, untick the consent box or leave the photo screen. Consent is held only in app memory for the selected photo and is requested again for a new photo or app session.</Text>
            <Text style={styles.copy}>SkinSnap is for people aged {MINIMUM_USER_AGE} and older. The app asks for an age confirmation and does not ask for your date of birth. A public operator contact and external deletion-request service still need to be configured before release.</Text>
          </Section>

          {PUBLISHED_PRIVACY_POLICY_URL && <Pressable accessibilityRole="link" disabled={busy} onPress={() => void openPolicy()} style={styles.linkButton}>
            <Text style={styles.linkText}>{busy ? 'Opening…' : 'Open published Privacy Policy'}</Text>
          </Pressable>}
          <Pressable accessibilityRole="link" onPress={() => router.push('/terms')} style={styles.linkButton}>
            <Text style={styles.linkText}>Terms and service information</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Account &amp; data settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, paddingHorizontal: 24, gap: 15 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: '#FFF', fontSize: 36, lineHeight: 40 },
  brand: { color: '#FFF', fontSize: 19, fontFamily: 'InterExtraBold', textAlign: 'center' },
  title: { color: '#FFF', fontSize: 27, lineHeight: 34, fontFamily: 'InterExtraBold', textAlign: 'center' },
  pink: { color: '#FF6798' },
  lead: { color: '#D0CAD4', fontSize: 14, lineHeight: 21, fontFamily: 'InterRegular', textAlign: 'center', marginBottom: 3 },
  section: { gap: 8, backgroundColor: 'rgba(20,14,20,0.92)', borderColor: '#473340', borderWidth: 1, borderRadius: 17, padding: 15 },
  sectionTitle: { color: '#FF8FB2', fontSize: 15, fontFamily: 'InterSemibold' },
  copy: { color: '#D8D1DA', fontSize: 13, lineHeight: 19, fontFamily: 'InterRegular' },
  linkButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center' },
  linkText: { color: '#FF8FB2', fontSize: 14, fontFamily: 'InterSemibold', textDecorationLine: 'underline' },
  secondaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 24, backgroundColor: 'rgba(38,19,31,0.75)', borderColor: '#694257', borderWidth: 1 },
  secondaryText: { color: '#F5DDE7', fontSize: 13, fontFamily: 'InterSemibold' },
});
