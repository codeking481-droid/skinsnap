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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthApiError, authenticateWithEmail, deleteAccountData, signOut } from '../services/authApi';
import { verifyAuthenticatedSession } from '../services/session';
import { usePhoto } from '../PhotoContext';

export default function SignInScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setPhotoUri, setPhotoUploadConsent, setAnalysisResult } = usePhoto();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  useEffect(() => {
    let active = true;
    verifyAuthenticatedSession().then((session) => {
      if (active) setSignedIn(session.valid);
    });
    return () => { active = false; };
  }, []);

  const returnToPreviousScreen = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/routine');
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await authenticateWithEmail(mode, email, password);
      if (result.confirmationRequired) {
        setMessage('Check your email to confirm your account, then sign in here.');
        setMode('sign-in');
      } else {
        setSignedIn(true);
        setPassword('');
        returnToPreviousScreen();
      }
    } catch (error) {
      setMessage(error instanceof AuthApiError ? error.message : 'Could not complete sign-in. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account and data?',
      'This permanently deletes your Supabase account and attempts to remove account-scoped routine progress saved on this device. Related server records depend on the database relationships, and provider-held copies are not deleted by the app. This cannot be undone.',
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
                setPhotoUri(null);
                setPhotoUploadConsent(false);
                setAnalysisResult(null);
                setMessage('Your account and SkinSnap data were deleted.');
                returnToPreviousScreen();
              } catch (error) {
                if (error instanceof AuthApiError && error.accountDeleted) {
                  setSignedIn(false);
                  setPhotoUri(null);
                  setPhotoUploadConsent(false);
                  setAnalysisResult(null);
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
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#130A12', '#09080D', '#050509']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 24 * scale, paddingTop: Math.max(insets.top, 22 * scale), paddingBottom: Math.max(insets.bottom, 24 * scale) }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={returnToPreviousScreen} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <View style={styles.brandBlock}>
              <Text style={[styles.brand, { fontSize: 21 * scale }]}>Skin<Text style={styles.pink}>Snap</Text></Text>
              <Text style={[styles.title, { fontSize: 28 * scale, lineHeight: 34 * scale, marginTop: 25 * scale }]}>
                {signedIn ? 'Your account' : mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text style={[styles.subtitle, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 8 * scale }]}>
                {signedIn
                  ? 'Manage your secure SkinSnap account and saved data.'
                  : 'Sign in securely to save analysis history and verify premium access.'}
              </Text>
            </View>

            {signedIn ? (
              <View style={[styles.form, { marginTop: 34 * scale }]}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void leaveAccount()} style={[styles.primary, { minHeight: 53 * scale, borderRadius: 28 * scale, opacity: busy ? 0.6 : 1 }]}>
                  <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.buttonFill}>
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
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.primary, { minHeight: 53 * scale, borderRadius: 28 * scale, marginTop: 24 * scale, opacity: busy ? 0.6 : 1 }]}>
                  <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.buttonFill}>
                    {busy ? <ActivityIndicator color="#12070C" /> : <Text style={styles.primaryText}>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMessage(null); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); }} style={styles.switchMode}>
                  <Text style={styles.switchText}>{mode === 'sign-in' ? 'New to SkinSnap? Create an account' : 'Already have an account? Sign in'}</Text>
                </Pressable>
              </View>
            )}

            {message && <Text accessibilityRole="alert" style={[styles.message, { marginTop: 20 * scale }]}>{message}</Text>}
            <View style={{ flex: 1, minHeight: 32 * scale }} />
            <Text style={styles.note}>Your account is protected by Supabase authentication. SkinSnap never stores your password.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1 },
  back: { justifyContent: 'center' },
  backGlyph: { color: '#FFF', fontSize: 38, lineHeight: 42, fontFamily: 'InterRegular' },
  brandBlock: { alignItems: 'center', marginTop: 22 },
  brand: { color: '#FFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  pink: { color: '#FF6395' },
  title: { color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.55 },
  subtitle: { color: '#D0CAD4', fontFamily: 'InterRegular', textAlign: 'center', maxWidth: 340 },
  form: { width: '100%' },
  inputLabel: { color: '#F3EAF0', fontFamily: 'InterSemibold', fontSize: 12 },
  input: { width: '100%', paddingHorizontal: 15, backgroundColor: '#17131A', borderColor: '#4B3542', borderWidth: 1, color: '#FFF', fontFamily: 'InterRegular', fontSize: 14 },
  primary: { width: '100%', overflow: 'hidden', borderWidth: 0.8, borderColor: '#FFA7C1' },
  buttonFill: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#12070C', fontFamily: 'InterExtraBold', fontSize: 15 },
  switchMode: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  switchText: { color: '#FF9FBA', fontFamily: 'InterSemibold', fontSize: 12, textAlign: 'center' },
  deleteButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#8A4259', backgroundColor: 'rgba(62,21,36,0.42)' },
  deleteText: { color: '#FFB3C6', fontFamily: 'InterSemibold', fontSize: 13 },
  message: { color: '#FFD4E0', fontFamily: 'InterMedium', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  note: { color: '#A69EAA', fontFamily: 'InterRegular', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
