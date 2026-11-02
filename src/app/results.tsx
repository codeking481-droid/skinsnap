import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { AnalysisReport } from '../components/AnalysisReport';
import { responsiveScale } from '../responsive';

export default function ResultsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { analysisResult, photoUri, analysisPreferences, setAnalysisResult, setPhotoUri, setPhotoUploadConsent } = usePhoto();
  const scale = responsiveScale(width);
  const retake = () => {
    setPhotoUri(null);
    setPhotoUploadConsent(false);
    setAnalysisResult(null);
    router.replace('/upload');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { minHeight: height }]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Analysis report"
      >
        <View style={[styles.page, {
          width: Math.min(width, 520),
          paddingHorizontal: 19 * scale,
          paddingTop: Math.max(insets.top, 12 * scale),
          paddingBottom: Math.max(insets.bottom, 20 * scale),
        }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to photo selection" hitSlop={10} onPress={() => router.replace('/upload')} style={[styles.back, { width: 42 * scale, height: 42 * scale }]}>
              <Svg width={22 * scale} height={22 * scale} viewBox="0 0 24 24" fill="none" stroke="#E8C9A0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text style={[styles.headerTitle, { fontSize: 17 * scale }]}>Scan result</Text>
            <View style={{ width: 42 * scale }} />
          </View>
          {analysisResult
            ? <AnalysisReport result={analysisResult} photoUri={photoUri} preferences={analysisPreferences} scale={scale} onRetake={retake} />
            : <View style={styles.empty}>
              <Text accessibilityRole="header" style={[styles.heading, { fontSize: 28 * scale, lineHeight: 35 * scale }]}>
                No analysis{' \n'}<Text style={styles.accent}>results available</Text>
              </Text>
              <Text style={[styles.body, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 12 * scale }]}>
                SkinSnap never substitutes sample scores or invented observations for a real result. Start an analysis to view verified service results.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/upload')} style={({ pressed }) => [styles.cta, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 20 * scale, opacity: pressed ? 0.86 : 1 }]}>
                <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.ctaFill}>
                  <Text style={[styles.ctaText, { fontSize: 15 * scale }]}>Choose a photo</Text>
                  <Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#11070C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg>
                </LinearGradient>
              </Pressable>
            </View>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerTitle: { color: '#FFFFFF', fontFamily: 'InterSemibold' },
  back: { justifyContent: 'center', alignItems: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#302E2D', backgroundColor: '#1A1A1C' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 72 },
  heading: { color: '#F8F7FA', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.7 },
  accent: { color: '#E8C9A0' },
  body: { color: '#D8D1DA', fontFamily: 'InterRegular', textAlign: 'center' },
  cta: { width: '100%', overflow: 'hidden', borderColor: '#E8C9A0', borderWidth: 0.7 },
  ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#181613', fontFamily: 'InterExtraBold' },
});
