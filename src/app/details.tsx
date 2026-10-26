import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { backOrReplace } from '../navigation';
import { visibilityLabel } from '../analysisQuality';

const CATEGORY_LABELS: Record<string, string> = {
  'visible-shine': 'Visible shine',
  'apparent-dryness': 'Apparent dryness',
  'uneven-looking-tone': 'Uneven-looking tone',
  'visible-blemishes': 'Visible blemishes',
  'general-texture': 'General texture',
  'natural-pores': 'Natural pores',
  'color-variation': 'Colour variation',
  'overall-finish': 'Overall finish',
};

export default function DetailsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { analysisResult } = usePhoto();
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
    <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 18 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 18 * scale) }]}>
      <LinearGradient colors={['#101010', '#0A0A0A', '#0A0A0A']} locations={[0, 0.43, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.titleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to results" onPress={() => backOrReplace('/results')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}><Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg></Pressable>
        <Text style={[styles.title, { fontSize: 27 * scale, lineHeight: 36 * scale }]}>Detailed <Text style={styles.accent}>Insights</Text></Text>
        <View style={{ width: 36 * scale }} />
      </View>
      {analysisResult ? <>
        <Text style={[styles.notice, { fontSize: 9 * scale, marginTop: 7 * scale }]}>OBSERVATIONS FROM YOUR COMPLETED REQUEST · NON-DIAGNOSTIC</Text>
        <Text style={[styles.summary, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 14 * scale }]}>{analysisResult.summary}</Text>
        <View style={[styles.list, { gap: 9 * scale, marginTop: 14 * scale }]}>
          {analysisResult.observations.map((item, index) => <View key={`${item.category}-${index}`} style={[styles.card, { borderRadius: 17 * scale, padding: 15 * scale }]}>
            <View style={styles.cardHeading}>
              <Text style={[styles.cardTitle, { fontSize: 14 * scale }]}>{item.title ?? CATEGORY_LABELS[item.category]}</Text>
              {visibilityLabel(item) && <Text style={[styles.confidence, { fontSize: 9 * scale }]}>{visibilityLabel(item)}</Text>}
            </View>
            <Text style={[styles.description, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 6 * scale }]}>{item.observation}</Text>
            {item.location && <Text style={[styles.description, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 8 * scale }]}>Visible area: {item.location}</Text>}
            {item.whyItMatters && <Text style={[styles.description, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 8 * scale }]}>Why it may matter: {item.whyItMatters}</Text>}
            {item.practicalSuggestion && <Text style={[styles.description, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 8 * scale }]}>A gentle next step: {item.practicalSuggestion}</Text>}
            {item.limitation && <Text style={[styles.disclaimer, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 5 * scale }]}>Keep in mind: {item.limitation}</Text>}
          </View>)}
        </View>
        {analysisResult.limitations?.map((limitation, index) => <Text key={index} style={[styles.description, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 8 * scale }]}>{limitation}</Text>)}
        <View style={[styles.disclaimerCard, { borderRadius: 16 * scale, padding: 13 * scale, marginTop: 13 * scale }]}>
          <Text style={[styles.disclaimer, { fontSize: 10 * scale, lineHeight: 15 * scale }]}>Lighting, camera quality and image filters can change visible appearance. These observations are not a medical diagnosis and should not replace professional care.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/recommendations')} style={[styles.cta, { minHeight: 50 * scale, borderRadius: 26 * scale, marginTop: 13 * scale }]}><LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 15 * scale }]}>View routine suggestions</Text><Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#08090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg></LinearGradient></Pressable>
      </> : <>
        <Text style={[styles.empty, { fontSize: 14 * scale, lineHeight: 21 * scale, marginTop: 32 * scale }]}>No completed analysis is available in this session. SkinSnap does not display fabricated sample findings.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/upload')} style={[styles.cta, { minHeight: 50 * scale, borderRadius: 26 * scale, marginTop: 17 * scale }]}><LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 15 * scale }]}>Choose a photo</Text></LinearGradient></Pressable>
      </>}
    </View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' }, scroll: { flexGrow: 1, alignItems: 'center' }, page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { justifyContent: 'center' }, title: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 }, accent: { color: '#E8C9A0' },
  notice: { color: '#E8C9A0', textAlign: 'center', fontFamily: 'InterExtraBold', letterSpacing: 0.5 }, summary: { color: '#D0D0D0', fontFamily: 'InterRegular' },
  list: { width: '100%' }, card: { backgroundColor: 'rgba(26,26,28,0.96)', borderWidth: 1, borderColor: '#2A2A2C' }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: '#FFF', fontFamily: 'InterExtraBold', flex: 1 }, confidence: { color: '#D4B896', fontFamily: 'InterMedium' }, description: { color: '#D0D0D0', fontFamily: 'InterRegular' },
  disclaimerCard: { backgroundColor: 'rgba(40,36,31,0.92)', borderWidth: 1, borderColor: '#534738' }, disclaimer: { color: '#C9C4BC', fontFamily: 'InterRegular' }, empty: { color: '#D0D0D0', fontFamily: 'InterRegular', textAlign: 'center' },
  cta: { overflow: 'hidden', borderColor: '#E8C9A0', borderWidth: 0.7 }, ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, ctaText: { color: '#08090D', fontFamily: 'InterExtraBold' },
});
