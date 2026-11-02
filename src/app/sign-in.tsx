import { Action as RetentionAction } from '../components/RetentionUI';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthApiError, authenticateWithEmail, deleteAccountData, signOut } from '../services/authApi';
import { isAnonymousSession, verifyAuthenticatedSession } from '../services/session';
import { usePhoto } from '../PhotoContext';
import { MINIMUM_USER_AGE } from '../privacy';
import { responsiveScale } from '../responsive';

export default function SignInScreen() {
  const { continueScan: continueScanParam, mode: modeParam } = useLocalSearchParams<{ continueScan?: string; mode?: string }>();
  const continueScan = continueScanParam === 'true';
  const developmentScan = continueScan && modeParam === 'development';
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setPhotoUri, setPhotoUploadConsent, setAnalysisResult, setAnalysisPreferences } = usePhoto();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [anonymousSession, setAnonymousSession] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const scale = responsiveScale(width);

  useEffect(() => {
    let active = true;
    verifyAuthenticatedSession().then((session) => {
      if (active) {
        setSignedIn(session.valid);
        void isAnonymousSession().then(setAnonymousSession);
      }
    });
    return () => { active = false; };
  }, []);

  const returnToPreviousScreen = () => {
    if (continueScan) {
      router.replace({ pathname: '/analysis', ...(developmentScan ? { params: { mode: 'development' } } : {}) });
      return;
    }
    router.replace('/');
  };

  const submit = async () => {
    if (busy) return;
    if (mode === 'sign-up' && !ageConfirmed) {
      setMessage(`SkinSnap accounts are available only to people aged ${MINIMUM_USER_AGE} or older.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await authenticateWithEmail(mode, email, password);
      if (result.confirmationRequired) {
        setMessage('Check your email to confirm your account, then sign in here.');
        setMode('sign-in');
      } else {
        if (!continueScan) {
          setPhotoUri(null);
          setPhotoUploadConsent(false);
          setAnalysisPreferences({});
        }
        setAnalysisResult(null);
        setSignedIn(true);
        setAnonymousSession(false);
        setPassword('');
        returnToPreviousScreen();
      }
    } catch (error) {
      setMessage(error instanceof AuthApiError ? error.message : 'Could not complete sign-in. Please retry.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account and data?',
      'SkinSnap will remove the known server-side account records and request deletion of your Supabase sign-in. If a step fails, some records may already be removed; sign in again and retry. This does not remove provider-held copies or files on your other devices, and it does not cancel a store subscription.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                await deleteAccountData();
                setSignedIn(false);
                setAnonymousSession(false);
                setPhotoUri(null);
                setPhotoUploadConsent(false);
                setAnalysisResult(null);
                setMessage('Your SkinSnap account and configured server records were deleted. Provider copies and files on your other devices may remain.');
                setAnalysisPreferences({});
              } catch (error) {
                if (error instanceof AuthApiError && error.accountDeleted) {
                  setSignedIn(false);
                  setAnonymousSession(false);
                  setPhotoUri(null);
                  setPhotoUploadConsent(false);
                  setAnalysisResult(null);
                  setAnalysisPreferences({});
                }
                setMessage(error instanceof AuthApiError ? error.message : 'Account deletion could not be confirmed. Please retry.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const leaveAccount = async () => {
    if (busy) return;
    if (anonymousSession) {
      Alert.alert(
        'Leave this guest profile?',
        'This signs the device out but does not delete server data. Guest history cannot currently be recovered through email linking. Delete the guest account instead if you want its configured server records removed.',
        [
          { text: 'Stay signed in', style: 'cancel' },
          { text: 'Sign out', style: 'destructive', onPress: () => { void completeSignOut(); } },
        ],
      );
      return;
    }
    await completeSignOut();
  };

  const completeSignOut = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await signOut();
      setSignedIn(false);
      setMessage('You are signed out on this device.');
    } catch (error) {
      setSignedIn(false);
      setMessage(error instanceof AuthApiError ? error.message : 'You are signed out on this device.');
    } finally {
      setPhotoUri(null);
      setPhotoUploadConsent(false);
      setAnalysisResult(null);
      setAnalysisPreferences({});
      setAnonymousSession(false);
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#171512', '#0A0A0A', '#050509']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 24 * scale, paddingTop: Math.max(insets.top, 22 * scale), paddingBottom: Math.max(insets.bottom, 24 * scale) }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={returnToPreviousScreen} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <View style={styles.brandBlock}>
              <Text style={[styles.brand, { fontSize: 21 * scale }]}>Skin<Text style={styles.accent}>Snap</Text></Text>
              <Text style={[styles.title, { fontSize: 28 * scale, lineHeight: 34 * scale, marginTop: 25 * scale }]}>
                {signedIn ? 'Your account' : continueScan ? 'Sign in to continue your scan' : mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text style={[styles.subtitle, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 8 * scale }]}>
                {signedIn
                  ? anonymousSession
                    ? 'Your secure guest profile keeps account-scoped data private on this installation.'
                    : 'Manage your secure SkinSnap account and saved data.'
                  : continueScan
                    ? 'Your selected photo stays on this device. After signing in, return to analysis and retry; the photo is not uploaded until you retry.'
                    : 'An email account is optional. Continue exploring without registration, or sign in to an existing account.'}
              </Text>
            </View>

            <RetentionAction secondary label="My Skin Preferences" onPress={() => router.push('/skin-preferences')} /><RetentionAction secondary label="My Skin Diary" onPress={() => router.push('/skin-diary')} />{signedIn ? (
              <View style={[styles.form, { marginTop: 34 * scale }]}>
                {anonymousSession && <Text style={styles.note}>
                  Guest recovery by email is not enabled. Clearing app data or reinstalling may make this profile and its saved history inaccessible. Use account deletion before leaving this profile if you want its configured server records removed.
                </Text>}
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void leaveAccount()} style={[styles.primary, { minHeight: 53 * scale, borderRadius: 28 * scale, opacity: busy ? 0.6 : 1 }]}>
                  <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.buttonFill}>
                    {busy ? <ActivityIndicator color="#12070C" /> : <Text style={styles.primaryText}>Sign out</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDelete} style={[styles.deleteButton, { minHeight: 49 * scale, borderRadius: 25 * scale, marginTop: 13 * scale }]}>
                  <Text style={styles.deleteText}>Delete account and data</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.form, { marginTop: 34 * scale }]}>
                <Text style={styles.inputLabel}>Email address</Text>
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#8F8792"
                  style={[styles.input, { minHeight: 53 * scale, borderRadius: 15 * scale, marginTop: 7 * scale }]}
                  textContentType="emailAddress"
                  value={email}
                />
                <Text style={[styles.inputLabel, { marginTop: 19 * scale }]}>Password</Text>
                <TextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submit()}
                  placeholder="Enter your password"
                  placeholderTextColor="#8F8792"
                  secureTextEntry
                  style={[styles.input, { minHeight: 53 * scale, borderRadius: 15 * scale, marginTop: 7 * scale }]}
                  textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
                  value={password}
                />
                {mode === 'sign-up' && (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ageConfirmed }}
                    accessibilityLabel={`I confirm I am ${MINIMUM_USER_AGE} or older`}
                    onPress={() => setAgeConfirmed((confirmed) => !confirmed)}
                    style={styles.ageConfirmation}
                  >
                    <View style={[styles.ageCheckbox, ageConfirmed && styles.ageCheckboxSelected]}>
                      {ageConfirmed && <Text style={styles.ageCheckmark}>✓</Text>}
                    </View>
                    <Text style={styles.ageText}>I confirm I am {MINIMUM_USER_AGE} or older.</Text>
                  </Pressable>
                )}
                {mode === 'sign-up' && (
                  <View style={styles.legalLinks}>
                    <Pressable accessibilityRole="link" onPress={() => router.push('/terms')}>
                      <Text style={styles.legalLink}>Terms</Text>
                    </Pressable>
                    <Text style={styles.legalDivider}>·</Text>
                    <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')}>
                      <Text style={styles.legalLink}>Privacy</Text>
                    </Pressable>
                  </View>
                )}
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.primary, { minHeight: 53 * scale, borderRadius: 28 * scale, marginTop: 24 * scale, opacity: busy ? 0.6 : 1 }]}>
                  <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.buttonFill}>
                    {busy ? <ActivityIndicator color="#12070C" /> : <Text style={styles.primaryText}>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMessage(null); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); }} style={styles.switchMode}>
                  <Text style={styles.switchText}>{mode === 'sign-in' ? 'New to SkinSnap? Create an account' : 'Already have an account? Sign in'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={returnToPreviousScreen} style={styles.switchMode}>
                  <Text style={styles.switchText}>Continue without an email account</Text>
                </Pressable>
              </View>
            )}

            {message && <Text accessibilityRole="alert" style={[styles.message, { marginTop: 20 * scale }]}>{message}</Text>}
            <View style={{ flex: 1, minHeight: 32 * scale }} />
            <Text style={styles.note}>Your password is sent securely to Supabase for sign-in. SkinSnap does not save it in local app storage.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1 },
  back: { justifyContent: 'center' },
  backGlyph: { color: '#FFF', fontSize: 38, lineHeight: 42, fontFamily: 'InterRegular' },
  brandBlock: { alignItems: 'center', marginTop: 22 },
  brand: { color: '#FFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  accent: { color: '#E8C9A0' },
  title: { color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.55 },
  subtitle: { color: '#BDBABD', fontFamily: 'InterRegular', textAlign: 'center', maxWidth: 340 },
  form: { width: '100%' },
  inputLabel: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 12 },
  input: { width: '100%', paddingHorizontal: 15, backgroundColor: '#1A1A1C', borderColor: '#534738', borderWidth: 1, color: '#FFF', fontFamily: 'InterRegular', fontSize: 14 },
  primary: { width: '100%', overflow: 'hidden', borderWidth: 0.8, borderColor: '#E8C9A0' },
  buttonFill: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#12070C', fontFamily: 'InterExtraBold', fontSize: 15 },
  switchMode: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  switchText: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 12, textAlign: 'center' },
  deleteButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#534738', backgroundColor: '#1A1A1C' },
  deleteText: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 13 },
  message: { color: '#E8C9A0', fontFamily: 'InterMedium', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  note: { color: '#8A8A8A', fontFamily: 'InterRegular', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  ageConfirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  ageCheckbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#534738', alignItems: 'center', justifyContent: 'center' },
  ageCheckboxSelected: { backgroundColor: '#D4B896', borderColor: '#E8C9A0' },
  ageCheckmark: { color: '#12070C', fontFamily: 'InterExtraBold', fontSize: 15, lineHeight: 19 },
  ageText: { color: '#D1D1D1', fontFamily: 'InterRegular', fontSize: 12, flex: 1 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 },
  legalLink: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 12, textDecorationLine: 'underline' },
  legalDivider: { color: '#8A8A8A', fontSize: 12 },
});
