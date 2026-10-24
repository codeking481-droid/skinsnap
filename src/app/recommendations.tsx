import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { backOrReplace } from '../navigation';

export default function RecommendationsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { analysisResult } = usePhoto();
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
    <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 18 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 18 * scale) }]}>
      <LinearGradient colors={['#09070B', '#050509', '#050509']} locations={[0, 0.43, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.titleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to insights" onPress={() => backOrReplace('/details')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}><Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg></Pressable>
        <Text style={[styles.title, { fontSize: 27 * scale, lineHeight: 37 * scale }]}>Routine <Text style={styles.pink}>Suggestions</Text></Text><View style={{ width: 36 * scale }} />
      </View>
      <Text style={[styles.notice, { fontSize: 9 * scale, marginTop: 7 * scale }]}>BASED ON THIS ANALYSIS RESPONSE · NOT MEDICAL ADVICE</Text>
      {analysisResult ? <>
        <Text style={[styles.intro, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 13 * scale }]}>Use these general suggestions as a starting point. Follow product labels and stop using anything that irritates your skin.</Text>
        <Text style={[styles.section, { fontSize: 17 * scale, marginTop: 15 * scale }]}>Morning</Text>
        <View style={[styles.list, { gap: 8 * scale, marginTop: 8 * scale }]}>
            {analysisResult.morningRoutine.map((suggestion, index) => <View key={`morning-${index}-${suggestion}`} style={[styles.item, { borderRadius: 16 * scale, padding: 14 * scale, gap: 11 * scale }]}>
              <LinearGradient colors={['#FF8BAA', '#E7467D']} style={[styles.number, { width: 31 * scale, height: 31 * scale, borderRadius: 16 * scale }]}><Text style={[styles.numberText, { fontSize: 14 * scale }]}>{index + 1}</Text></LinearGradient>
              <Text style={[styles.itemText, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>{suggestion}</Text>
            </View>)}
        </View>
        <Text style={[styles.section, { fontSize: 17 * scale, marginTop: 16 * scale }]}>Evening</Text>
        <View style={[styles.list, { gap: 8 * scale, marginTop: 8 * scale }]}>
            {analysisResult.eveningRoutine.map((suggestion, index) => <View key={`evening-${index}-${suggestion}`} style={[styles.item, { borderRadius: 16 * scale, padding: 14 * scale, gap: 11 * scale }]}>
              <LinearGradient colors={['#FF8BAA', '#E7467D']} style={[styles.number, { width: 31 * scale, height: 31 * scale, borderRadius: 16 * scale }]}><Text style={[styles.numberText, { fontSize: 14 * scale }]}>{index + 1}</Text></LinearGradient>
              <Text style={[styles.itemText, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>{suggestion}</Text>
            </View>)}
        </View>
        {analysisResult.precautions.length > 0 && <View style={[styles.disclaimer, { borderRadius: 16 * scale, padding: 13 * scale, marginTop: 15 * scale }]}>
          <Text style={[styles.section, { fontSize: 14 * scale }]}>Precautions</Text>
          {analysisResult.precautions.map((item, index) => <Text key={`${index}-${item}`} style={[styles.disclaimerText, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 5 * scale }]}>• {item}</Text>)}
        </View>}
        <View style={[styles.disclaimer, { borderRadius: 16 * scale, padding: 13 * scale, marginTop: 15 * scale }]}>
          <Text style={[styles.disclaimerText, { fontSize: 10 * scale, lineHeight: 15 * scale }]}>These are non-medical suggestions. SkinSnap cannot diagnose or treat skin conditions. Ask a qualified professional about persistent or concerning symptoms.</Text>
        </View>
      </> : <Text style={[styles.empty, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 28 * scale }]}>Your suggestions will appear after a successful skin analysis. You can open your saved routine below.</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/routine')} style={[styles.cta, { minHeight: 53 * scale, borderRadius: 28 * scale, marginTop: 17 * scale }]}><LinearGradient colors={['#FF6494', '#FF6794', '#FF6B99']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 16 * scale }]}>Open my routine tracker</Text><Svg width={21 * scale} height={21 * scale} viewBox="0 0 24 24" fill="none" stroke="#08090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg></LinearGradient></Pressable>
      <Text style={[styles.demoNotice, { fontSize: 8.5 * scale, marginTop: 7 * scale }]}>Your tracker uses guidance from your saved analysis. Introduce new products gradually.</Text>
    </View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' }, scroll: { flexGrow: 1, alignItems: 'center' }, page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { justifyContent: 'center' }, title: { color: '#F7F6F9', fontFamily: 'InterExtraBold', letterSpacing: -0.65 }, pink: { color: '#FF5A91' },
  notice: { color: '#FF8EAF', textAlign: 'center', fontFamily: 'InterExtraBold', letterSpacing: 0.4 }, intro: { color: '#D6D0DA', fontFamily: 'InterRegular' },
  section: { color: '#FFF', fontFamily: 'InterExtraBold' },
  list: { width: '100%' }, item: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(17,15,21,0.96)', borderWidth: 1, borderColor: '#49323D' }, number: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, numberText: { color: '#13070C', fontFamily: 'InterExtraBold' }, itemText: { flex: 1, color: '#F4EEF3', fontFamily: 'InterMedium' },
  empty: { color: '#D6D0DA', fontFamily: 'InterRegular', textAlign: 'center' }, disclaimer: { backgroundColor: 'rgba(35,21,30,0.92)', borderWidth: 1, borderColor: '#6D344D' }, disclaimerText: { color: '#D3C3CE', fontFamily: 'InterRegular' },
  cta: { overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 }, ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, ctaText: { color: '#08090D', fontFamily: 'InterExtraBold' },
  demoNotice: { color: '#AFA6B3', fontFamily: 'InterRegular', textAlign: 'center' },
});
