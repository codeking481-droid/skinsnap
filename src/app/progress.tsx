import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadRoutineProgress, type RoutineProgress } from '../routineStorage';
import { backOrReplace } from '../navigation';
import { usePhoto } from '../PhotoContext';
import { loadAnalysisHistory, type AnalysisHistoryItem, AuthApiError } from '../services/authApi';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMPTY_PROGRESS: RoutineProgress = { checkedSteps: [], completedDays: [] };

export default function ProgressScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setAnalysisResult } = usePhoto();
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await loadAnalysisHistory());
    } catch (error) {
      setHistoryError(error instanceof AuthApiError ? error.message : 'Analysis history is unavailable right now.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const historyRequest = setTimeout(() => { void refreshHistory(); }, 0);
    loadRoutineProgress().then((value) => {
      if (active) setProgress(value);
    });
    return () => {
      active = false;
      clearTimeout(historyRequest);
    };
  }, [refreshHistory]);

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekKeys = DAYS.map((_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  });
  const completedThisWeek = weekKeys.filter((date) => progress.completedDays.includes(date)).length;

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
    <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 20 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 20 * scale) }]}>
      <LinearGradient colors={['#09070B', '#050509', '#050509']} locations={[0, 0.46, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.titleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to routine" onPress={() => backOrReplace('/routine')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}><Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg></Pressable>
        <Text style={[styles.title, { fontSize: 31 * scale, lineHeight: 40 * scale }]}>Your <Text style={styles.pink}>Progress</Text></Text><View style={{ width: 34 * scale }} />
      </View>

      <View style={[styles.card, { borderRadius: 19 * scale, padding: 17 * scale, marginTop: 18 * scale }]}>
        <Text style={[styles.cardTitle, { fontSize: 17 * scale }]}>Routine consistency</Text>
        <Text style={[styles.copy, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 5 * scale }]}>Completed days recorded on this device. Completing all steps is optional; consistency is personal.</Text>
        <View style={[styles.week, { marginTop: 19 * scale }]}>
          {DAYS.map((day, index) => {
            const completed = progress.completedDays.includes(weekKeys[index]);
            return <View key={day} style={styles.day}>
              <Text style={[styles.dayName, { fontSize: 10 * scale }]}>{day}</Text>
              <View style={[styles.dayCircle, { width: 30 * scale, height: 30 * scale, borderRadius: 16 * scale, borderColor: completed ? '#FF6595' : '#4D4650', backgroundColor: completed ? '#FF6595' : 'transparent' }]}>
                {completed && <Svg width={16 * scale} height={16 * scale} viewBox="0 0 24 24" fill="none" stroke="#10080C" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg>}
              </View>
            </View>;
          })}
        </View>
        <Text style={[styles.weekSummary, { fontSize: 12 * scale, marginTop: 15 * scale }]}>{completedThisWeek} of 7 days completed this week</Text>
      </View>

      <View style={[styles.card, { borderRadius: 19 * scale, padding: 17 * scale, marginTop: 12 * scale }]}>
        <Text style={[styles.cardTitle, { fontSize: 16 * scale }]}>Analysis history</Text>
        {historyLoading
          ? <Text style={[styles.copy, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 8 * scale }]}>Loading your private history…</Text>
          : historyError
            ? <>
              <Text style={[styles.copy, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 6 * scale }]}>{historyError}</Text>
              {/sign.?in/i.test(historyError)
                ? <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={[styles.secondaryButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 12 * scale }]}>
                  <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Sign in or create an account</Text>
                </Pressable>
                : <Pressable accessibilityRole="button" onPress={() => void refreshHistory()} style={[styles.secondaryButton, { minHeight: 42 * scale, borderRadius: 22 * scale, marginTop: 12 * scale }]}>
                  <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Retry loading history</Text>
                </Pressable>}
            </>
            : history.length === 0
              ? <Text style={[styles.copy, { fontSize: 11.5 * scale, lineHeight: 17 * scale, marginTop: 6 * scale }]}>
                No saved analyses yet. Results appear here only after a verified subscription and a successful secure analysis.
              </Text>
              : <View style={{ marginTop: 8 * scale, gap: 9 * scale }}>
                {history.map((item) => (
                  <Pressable key={item.resultId} accessibilityRole="button" onPress={() => {
                    setAnalysisResult(item);
                    router.push('/results');
                  }} style={[styles.historyItem, { borderRadius: 13 * scale, padding: 12 * scale }]}>
                    <Text style={[styles.historyDate, { fontSize: 10 * scale }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    <Text numberOfLines={3} style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 4 * scale }]}>{item.summary}</Text>
                    <Text style={[styles.historyOpen, { fontSize: 10 * scale, marginTop: 6 * scale }]}>View verified analysis</Text>
                  </Pressable>
                ))}
              </View>}
        <Pressable accessibilityRole="button" onPress={() => router.push('/upload')} style={[styles.secondaryButton, { minHeight: 44 * scale, borderRadius: 23 * scale, marginTop: 13 * scale }]}>
          <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Start a paid analysis</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={[styles.secondaryButton, { minHeight: 44 * scale, borderRadius: 23 * scale, marginTop: 12 * scale }]}>
        <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Account &amp; data settings</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.replace('/routine')} style={[styles.cta, { minHeight: 53 * scale, borderRadius: 28 * scale, marginTop: 16 * scale }]}><LinearGradient colors={['#FF6494', '#FF6794', '#FF6B99']} style={styles.ctaFill}><Text style={[styles.ctaText, { fontSize: 16 * scale }]}>Back to my routine</Text></LinearGradient></Pressable>
    </View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' }, scroll: { flexGrow: 1, alignItems: 'center' }, page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { justifyContent: 'center' }, title: { color: '#F7F6F9', fontFamily: 'InterExtraBold', letterSpacing: -0.7 }, pink: { color: '#FF5A91' },
  card: { width: '100%', backgroundColor: 'rgba(16,14,20,0.95)', borderWidth: 1, borderColor: '#45333D' }, cardTitle: { color: '#FFF', fontFamily: 'InterExtraBold' }, copy: { color: '#D0CAD4', fontFamily: 'InterRegular' },
  historyItem: { backgroundColor: '#211820', borderWidth: 1, borderColor: '#56394A' }, historyDate: { color: '#FF9FBA', fontFamily: 'InterSemibold' }, historyOpen: { color: '#FFF', fontFamily: 'InterSemibold' },
  week: { flexDirection: 'row', justifyContent: 'space-between' }, day: { flex: 1, alignItems: 'center', gap: 8 }, dayName: { color: '#C9C1CC', fontFamily: 'InterMedium' }, dayCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 }, weekSummary: { color: '#FF8EAE', fontFamily: 'InterSemibold' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#694257', backgroundColor: 'rgba(38,19,31,0.75)' }, secondaryText: { color: '#F5DDE7', fontFamily: 'InterSemibold' },
  cta: { width: '100%', overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 }, ctaFill: { flex: 1, alignItems: 'center', justifyContent: 'center' }, ctaText: { color: '#08090D', fontFamily: 'InterExtraBold' },
});
