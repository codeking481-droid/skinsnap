import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';

const CATEGORY_LABELS: Record<string, string> = {
  'visible-shine': 'Visible shine',
  'apparent-dryness': 'Apparent dryness',
  'uneven-looking-tone': 'Uneven-looking tone',
  'visible-blemishes': 'Visible blemishes',
  'general-texture': 'General texture',
};

export default function ResultsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { analysisResult, photoUri } = usePhoto();
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 19 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 20 * scale) }]}>
          <Image source={require('../../assets/images/welcome-portrait.png')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient colors={['rgba(4,3,7,0.84)', 'rgba(4,3,7,0.95)', '#050509']} locations={[0, 0.46, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable accessibilityRole="button" accessibilityLabel="Back to photo selection" hitSlop={10} onPress={() => router.replace('/upload')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
            <Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
          </Pressable>

          {analysisResult ? (
            <>
              <Text style={[styles.heading, { fontSize: 29 * scale, lineHeight: 36 * scale, marginTop: 7 * scale }]}>Your Skin<Text style={styles.pink}> Insights</Text></Text>
              <Text style={[styles.subheading, { fontSize: 10 * scale, marginTop: 5 * scale }]}>REAL SERVICE RESPONSE · NON-DIAGNOSTIC OBSERVATIONS</Text>
              <View style={[styles.summary, { borderRadius: 19 * scale, padding: 17 * scale, marginTop: 16 * scale }]}>
                {photoUri && <Image source={{ uri: photoUri }} style={[styles.photo, { width: 66 * scale, height: 66 * scale, borderRadius: 34 * scale }]} resizeMode="cover" accessible accessibilityLabel="Photo used for this requested analysis" />}
                <Text style={[styles.summaryTitle, { fontSize: 15 * scale, marginTop: photoUri ? 11 * scale : 0 }]}>Overview</Text>
                <Text style={[styles.body, { fontSize: 13 * scale, lineHeight: 19 * scale, marginTop: 5 * scale }]}>{analysisResult.summary}</Text>
                <Text style={[styles.timestamp, { fontSize: 9 * scale, marginTop: 10 * scale }]}>Completed {new Date(analysisResult.createdAt).toLocaleString()}</Text>
              </View>
              {analysisResult.imageQuality === 'limited' && <View style={[styles.qualityNotice, { borderRadius: 14 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
                <Text style={[styles.qualityText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>Image quality was limited. These observations may miss details; try a clear, front-facing photo in even light for a more useful review.</Text>
              </View>}

              <Text style={[styles.sectionTitle, { fontSize: 17 * scale, marginTop: 18 * scale, marginBottom: 8 * scale }]}>Visible observations</Text>
              {analysisResult.observations.map((observation, index) => (
                <View key={`${observation.category}-${index}`} style={[styles.observation, { borderRadius: 15 * scale, padding: 14 * scale, marginBottom: 7 * scale }]}>
                  <View style={styles.observationHeader}>
                    <Text style={[styles.observationTitle, { fontSize: 13 * scale }]}>{CATEGORY_LABELS[observation.category]}</Text>
                    <Text style={[styles.confidence, { fontSize: 9 * scale }]}>{observation.confidence} confidence</Text>
                  </View>
                  <Text style={[styles.body, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 5 * scale }]}>{observation.observation}</Text>
                </View>
              ))}

              <Text style={[styles.disclaimer, { fontSize: 9.5 * scale, lineHeight: 14 * scale, marginTop: 9 * scale }]}>
                Lighting, camera quality and filters can affect observations. This is not a medical diagnosis or a substitute for professional care.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/details')} style={[styles.cta, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 13 * scale }]}>
                <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 15 * scale }]}>Review all observations</Text><Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#11070C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg></LinearGradient>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.heading, { fontSize: 28 * scale, lineHeight: 35 * scale, marginTop: 16 * scale }]}>No analysis{'\n'}<Text style={styles.pink}>results available</Text></Text>
              <Text style={[styles.body, { fontSize: 13 * scale, lineHeight: 19 * scale, marginTop: 12 * scale }]}>SkinSnap never substitutes sample scores or invented observations for a real result. Start a paid analysis to view verified service results.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/upload')} style={[styles.cta, { minHeight: 52 * scale, borderRadius: 27 * scale, marginTop: 20 * scale }]}>
                <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 15 * scale }]}>Choose a photo</Text><Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#11070C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg></LinearGradient>
              </Pressable>
            </>
          )}
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
  heading: { color: '#F8F7FA', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -0.7 },
  pink: { color: '#FF6395' },
  subheading: { color: '#FF95B4', fontFamily: 'InterExtraBold', letterSpacing: 0.8, textAlign: 'center' },
  summary: { width: '100%', backgroundColor: 'rgba(25,16,23,0.93)', borderColor: '#8C3B5B', borderWidth: 1 },
  qualityNotice: { width: '100%', backgroundColor: 'rgba(69,43,24,0.78)', borderWidth: 1, borderColor: '#A76A40' },
  qualityText: { color: '#FFE1C2', fontFamily: 'InterMedium' },
  photo: { alignSelf: 'center', borderWidth: 2, borderColor: '#FF6F9D' },
  summaryTitle: { color: '#FFF', fontFamily: 'InterExtraBold' },
  body: { color: '#D8D1DA', fontFamily: 'InterRegular' },
  timestamp: { color: '#AFA4B1', fontFamily: 'InterRegular' },
  sectionTitle: { color: '#FFF', fontFamily: 'InterExtraBold' },
  observation: { width: '100%', backgroundColor: 'rgba(16,14,20,0.93)', borderWidth: 1, borderColor: '#39323D' },
  observationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  observationTitle: { flex: 1, color: '#FFF', fontFamily: 'InterSemibold' },
  confidence: { color: '#FF9CB7', fontFamily: 'InterMedium' },
  disclaimer: { color: '#B9AFBD', fontFamily: 'InterRegular', textAlign: 'center' },
  cta: { overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 },
  ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#11070C', fontFamily: 'InterExtraBold' },
});
