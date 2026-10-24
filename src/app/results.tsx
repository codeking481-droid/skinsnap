import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { AnalysisReport } from '../components/AnalysisReport';

export default function ResultsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { analysisResult, photoUri, analysisPreferences } = usePhoto();
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

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
          <Image source={require('../../assets/images/welcome-portrait.png')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient colors={['rgba(4,3,7,0.84)', 'rgba(4,3,7,0.95)', '#050509']} locations={[0, 0.46, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable accessibilityRole="button" accessibilityLabel="Back to photo selection" hitSlop={10} onPress={() => router.replace('/upload')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
            <Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
          </Pressable>
          {analysisResult
            ? <AnalysisReport result={analysisResult} photoUri={photoUri} preferences={analysisPreferences} scale={scale} />
            : <View style={styles.empty}>
              <Text accessibilityRole="header" style={[styles.heading, { fontSize: 28 * scale, lineHeight: 35 * scale }]}>
                No analysis{' \n'}<Text style={styles.pink}>results available</Text>
              </Text>
              <Text style={[styles.body, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 12 * scale }]}>
                SkinSnap never substitutes sample scores or invented observations for a real result. Start an analysis to view verified service results.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/upload')} style={[styles.cta, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 20 * scale }]}>
                <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.ctaFill}>
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
  screen: { flex: 1, backgroundColor: '#050509' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509' },
  back: { justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 72 },
  heading: { color: '#F8F7FA', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.7 },
  pink: { color: '#FF6395' },
  body: { color: '#D8D1DA', fontFamily: 'InterRegular', textAlign: 'center' },
  cta: { width: '100%', overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 },
  ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#11070C', fontFamily: 'InterExtraBold' },
});
