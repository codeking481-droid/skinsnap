import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINIMUM_USER_AGE, PUBLISHED_TERMS_URL } from '../privacy';

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const published = PUBLISHED_TERMS_URL;
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.button}><Text style={styles.link}>Back</Text></Pressable>
    <Text accessibilityRole="header" style={styles.title}>Terms &amp; service information</Text>
    <Text style={styles.copy}>SkinSnap is operated under the Alphatekx brand in Nigeria. You must be at least {MINIMUM_USER_AGE} years old to use SkinSnap. This terms summary remains a review draft; the operator contact and final legal review are still required.</Text>
    <Text style={styles.heading}>Cosmetic guidance, not medical care</Text>
    <Text style={styles.copy}>SkinSnap is not a medical device. It does not diagnose, treat, cure or prevent any medical condition. Photo observations and routines may be incomplete or wrong. Ask a qualified healthcare professional about medical concerns.</Text>
    <Text style={styles.heading}>Your photos and choices</Text>
    <Text style={styles.copy}>Only submit a photo you have permission to use. Read the photo consent before upload. Optional routine preferences are your own reports, not facts inferred from a photo. Do not rely on SkinSnap for emergencies or use it to identify or rate people.</Text>
    <Text style={styles.heading}>Subscriptions</Text>
    <Text style={styles.copy}>When subscription purchases are available in your build and store, the current localized price and renewal period are shown before confirmation. Google Play processes Android purchases and manages cancellation and refund requests under its policies and applicable law. Account deletion does not cancel a store subscription.</Text>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://play.google.com/store/account/subscriptions')} style={styles.button}><Text style={styles.link}>Manage Google Play subscriptions</Text></Pressable>
    <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.button}><Text style={styles.link}>Privacy and data controls</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.button}><Text style={styles.link}>Account settings and deletion</Text></Pressable>
    {published?.startsWith('https://') && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(published)} style={styles.button}><Text style={styles.link}>Open published terms</Text></Pressable>}
  </ScrollView></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#08070C' }, content: { paddingHorizontal: 24, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 15 },
  title: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 27, lineHeight: 35 },
  heading: { color: '#FF9BB9', fontFamily: 'InterSemibold', fontSize: 17, marginTop: 8 },
  copy: { color: '#DDD2DD', fontFamily: 'InterRegular', fontSize: 14, lineHeight: 22 },
  button: { minHeight: 48, justifyContent: 'center' }, link: { color: '#FF9BB9', fontSize: 14, textDecorationLine: 'underline' },
});
