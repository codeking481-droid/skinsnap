import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { backOrReplace } from '../navigation';
import { AnalysisRequestError, requestSkinAnalysis } from '../services/analysisApi';

const requestKey = () => `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function AnalysisScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    photoUri,
    photoUploadConsent,
    setPhotoUri,
    setAnalysisResult,
  } = usePhoto();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const idempotencyKey = useRef(requestKey());
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));
  const ringSize = Math.min(width - 96 * scale, 286 * scale);
  const photo = photoUri && !photoUnavailable ? { uri: photoUri } : null;

  const runAnalysis = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrorMessage(null);
    setErrorCode(null);
    try {
      if (!photoUri || photoUnavailable) {
        throw new AnalysisRequestError('photo-unavailable', 'Choose a photo again before requesting analysis.');
      }
      const result = await requestSkinAnalysis(photoUri, photoUploadConsent, idempotencyKey.current);
      if (!active.current) return;
      setAnalysisResult(result);
      router.replace('/results');
    } catch (error) {
      if (!active.current) return;
      const code = error instanceof AnalysisRequestError ? error.code : 'network-error';
      setErrorCode(code);
      setErrorMessage(error instanceof Error ? error.message : 'Analysis could not be completed.');
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }, [photoUnavailable, photoUploadConsent, photoUri, setAnalysisResult]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    if (!started.current) {
      started.current = true;
      void runAnalysis();
    }
    return () => { active.current = false; };
  }, [runAnalysis]));

  const retry = () => {
    if (inFlight.current) return;
    started.current = true;
    void runAnalysis();
  };

  const returnToPlans = () => router.replace('/paywall');
  const returnToUpload = () => backOrReplace('/upload');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 27 * scale, paddingTop: Math.max(insets.top, 14 * scale), paddingBottom: Math.max(insets.bottom, 22 * scale) }]}>
          <Image source={require('../../assets/images/welcome-portrait.png')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient colors={['rgba(4,3,7,0.83)', 'rgba(4,3,7,0.92)', '#050509']} locations={[0, 0.49, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable accessibilityRole="button" accessibilityLabel="Back to selected photo" hitSlop={12} onPress={returnToUpload} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
            <Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
          </Pressable>

          <Text style={[styles.heading, { fontSize: 27 * scale, lineHeight: 34 * scale, marginTop: 18 * scale }]}>
            {busy ? <>Preparing your{'\n'}<Text style={styles.pink}>skin insights</Text></> : 'Analysis not completed'}
          </Text>
          <Text style={[styles.subtitle, { fontSize: 12.5 * scale, lineHeight: 18 * scale, marginTop: 7 * scale }]}>
            {busy
              ? 'Verifying your subscription and requesting analysis from the secure service. No sample results are shown.'
              : errorMessage}
          </Text>

          <View style={[styles.scanner, { width: ringSize, height: ringSize, marginTop: 27 * scale }]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width="100%" height="100%" viewBox="0 0 300 300">
                <Circle cx="150" cy="150" r="138" stroke="#49303C" strokeWidth="1.4" fill="none" />
                <Circle cx="150" cy="150" r="127" stroke="#9A3C61" strokeOpacity="0.72" strokeWidth="1" fill="none" />
                {Array.from({ length: 36 }, (_, tick) => <Path key={tick} d="M150 13v7" transform={`rotate(${tick * 10} 150 150)`} stroke={tick % 3 === 0 ? '#FF78A4' : '#74324A'} strokeOpacity={tick % 3 === 0 ? 0.8 : 0.5} strokeWidth={tick % 3 === 0 ? 1.2 : 0.7} />)}
              </Svg>
            </View>
            <View style={[styles.photoFrame, { width: ringSize * 0.75, height: ringSize * 0.75, borderRadius: ringSize / 2 }]}>
              {photo
                ? <Image source={photo} style={styles.face} resizeMode="cover" onError={() => { setPhotoUnavailable(true); setPhotoUri(null); }} accessible accessibilityLabel="Selected photo for the requested paid analysis" />
                : <View style={[styles.face, styles.noPhoto]}><Text style={styles.noPhotoText}>Photo unavailable</Text></View>}
              <LinearGradient colors={['rgba(5,3,8,0.03)', 'transparent', 'rgba(5,3,8,0.13)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <View pointerEvents="none" style={[styles.faceCorner, styles.faceTL]} />
              <View pointerEvents="none" style={[styles.faceCorner, styles.faceTR]} />
              <View pointerEvents="none" style={[styles.faceCorner, styles.faceBL]} />
              <View pointerEvents="none" style={[styles.faceCorner, styles.faceBR]} />
            </View>
            {busy && <View style={styles.spinner}><ActivityIndicator size="large" color="#FF78A4" /></View>}
            {!busy && errorMessage && <View style={styles.errorIcon}><Svg width={31 * scale} height={31 * scale} viewBox="0 0 24 24" fill="none" stroke="#FF8BAE" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="9" /><Path d="M12 8v5m0 3h.01" /></Svg></View>}
          </View>

          <View style={[styles.infoCard, { borderRadius: 18 * scale, marginTop: 19 * scale, padding: 16 * scale }]}>
            <Text style={[styles.infoTitle, { fontSize: 14 * scale }]}>Your photo and results</Text>
            <Text style={[styles.infoText, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 5 * scale }]}>
              {busy
                ? 'The app will only upload your selected image after a verified subscription, your consent and a secure backend check.'
                  : 'Only a validated response from the secure service is displayed. If a network request was interrupted, retrying uses the same request key to avoid duplicate inference where the backend supports idempotency.'}
            </Text>
          </View>

          {!busy && <View style={styles.actions}>
            {errorCode === 'subscription-required'
              ? <Pressable accessibilityRole="button" onPress={returnToPlans} style={[styles.primaryButton, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 18 * scale }]}>
                <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.buttonFill}><Text style={[styles.primaryText, { fontSize: 15 * scale }]}>View subscription options</Text></LinearGradient>
              </Pressable>
              : <Pressable accessibilityRole="button" onPress={retry} style={[styles.primaryButton, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 18 * scale }]}>
                <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.buttonFill}><Text style={[styles.primaryText, { fontSize: 15 * scale }]}>Try secure analysis again</Text></LinearGradient>
              </Pressable>}
            <Pressable accessibilityRole="button" onPress={returnToUpload} style={[styles.secondaryButton, { minHeight: 44 * scale, borderRadius: 23 * scale, marginTop: 8 * scale }]}><Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Return to photo and free tools</Text></Pressable>
          </View>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509', alignItems: 'center' },
  back: { alignSelf: 'flex-start', justifyContent: 'center' },
  heading: { maxWidth: 330, color: '#F8F7FA', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.7 },
  pink: { color: '#FF6999' },
  subtitle: { maxWidth: 350, color: '#D0CCD6', textAlign: 'center', fontFamily: 'InterRegular' },
  scanner: { alignItems: 'center', justifyContent: 'center' },
  photoFrame: { overflow: 'hidden', borderWidth: 1.5, borderColor: '#FF709B', backgroundColor: '#21171D' },
  face: { width: '100%', height: '100%' },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#22171E' },
  noPhotoText: { color: '#D8BCC8', fontFamily: 'InterMedium', fontSize: 12 },
  faceCorner: { position: 'absolute', width: 22, height: 22, borderColor: '#FFF', borderWidth: 1.4 },
  faceTL: { left: 12, top: 12, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 7 },
  faceTR: { right: 12, top: 12, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 7 },
  faceBL: { left: 12, bottom: 12, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 7 },
  faceBR: { right: 12, bottom: 12, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 7 },
  spinner: { position: 'absolute', right: '15%', bottom: '13%', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: 'rgba(15,9,14,0.92)', borderWidth: 1, borderColor: '#FF78A4' },
  errorIcon: { position: 'absolute', right: '15%', bottom: '13%', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: 'rgba(15,9,14,0.92)', borderWidth: 1, borderColor: '#FF78A4' },
  infoCard: { width: '100%', maxWidth: 370, backgroundColor: 'rgba(20,15,21,0.92)', borderColor: 'rgba(157,81,112,0.52)', borderWidth: 1 },
  infoTitle: { color: '#FFF', fontFamily: 'InterExtraBold' },
  infoText: { color: '#CFC7D2', fontFamily: 'InterRegular' },
  actions: { width: '100%', maxWidth: 370 },
  primaryButton: { overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 },
  buttonFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryText: { color: '#12070C', fontFamily: 'InterExtraBold', textAlign: 'center' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(19,15,21,0.92)', borderColor: '#584750', borderWidth: 1 },
  secondaryText: { color: '#E4D9E1', fontFamily: 'InterSemibold' },
});
