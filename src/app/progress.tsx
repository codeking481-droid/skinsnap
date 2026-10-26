import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadRoutineProgress, type RoutineProgress } from '../routineStorage';
import { loadAnalysisHistory, type AnalysisHistoryItem, AuthApiError } from '../services/authApi';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadCustomRoutine, loadDiary } from '../services/retentionApi';
import type { DiaryEntry } from '../retention';
import { getCurrentWeekCount, getProgressWeek, getRoutineStreak } from '../progressPresentation';
import { usePhoto } from '../PhotoContext';

const EMPTY_PROGRESS: RoutineProgress = { checkedSteps: [], completedDays: [] };

function dateLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setAnalysisResult, setPhotoUri, setPhotoUploadConsent } = usePhoto();
  const generation = useRef(0);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [diaryLoading, setDiaryLoading] = useState(true);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [routineMessage, setRoutineMessage] = useState('Loading your routine history…');
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));
  const now = new Date();
  const week = getProgressWeek(progress.completedDays, now);
  const completedThisWeek = week.filter(day => day.completed).length;
  const checkInsThisWeek = getCurrentWeekCount(diary.map(entry => entry.date), now);
  const streak = getRoutineStreak(progress.completedDays, now);
  const recentDiary = [...diary].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  const refresh = useCallback(async () => {
    const requestId = ++generation.current;
    setHistoryLoading(true);
    setDiaryLoading(true);
    setHistoryError(null);
    setDiaryError(null);

    let owner: string | null = null;
    let ownerMessage: string | null = null;
    try {
      owner = await getRoutineProgressOwner();
    } catch (error) {
      ownerMessage = error instanceof Error ? error.message : 'Secure profile history is unavailable.';
    }
    if (requestId !== generation.current) return;

    const [historyResult, diaryResult, customResult] = await Promise.allSettled([
      loadAnalysisHistory(),
      loadDiary(),
      owner ? loadCustomRoutine() : Promise.resolve(null),
    ]);
    if (requestId !== generation.current) return;

    const items = historyResult.status === 'fulfilled' ? historyResult.value : [];
    setHistory(items);
    setHistoryError(historyResult.status === 'rejected'
      ? historyResult.reason instanceof AuthApiError || historyResult.reason instanceof Error
        ? historyResult.reason.message
        : 'Saved analysis history could not be loaded.'
      : null);
    setHistoryLoading(false);

    const entries = diaryResult.status === 'fulfilled' ? diaryResult.value.entries : [];
    setDiary(entries);
    setDiaryError(diaryResult.status === 'rejected'
      ? diaryResult.reason instanceof Error ? diaryResult.reason.message : 'Diary check-ins could not be loaded.'
      : null);
    setDiaryLoading(false);

    const customRoutine = customResult.status === 'fulfilled' ? customResult.value : null;
    const routineId = customRoutine
      ? `custom-${customRoutine.sourceResultId ?? 'manual'}`
      : items[0]?.resultId;
    let currentProgress: RoutineProgress;
    try {
      currentProgress = await loadRoutineProgress(owner ?? undefined, routineId);
    } catch (error) {
      if (requestId !== generation.current) return;
      setRoutineMessage(error instanceof Error
        ? error.message
        : 'Saved routine progress could not be loaded. It was not changed.');
      return;
    }
    if (requestId !== generation.current) return;
    setProgress(currentProgress);
    setRoutineMessage(owner
      ? customResult.status === 'rejected'
        ? 'Routine checkmarks are saved on this device. Your custom routine could not be verified.'
        : 'A completed day means all scheduled routine steps were checked off.'
      : `${ownerMessage ?? 'Secure profile unavailable.'} Routine completion is shown from this device.`);
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]));

  const openAnalysis = (item: AnalysisHistoryItem) => {
    setAnalysisResult(item);
    setPhotoUri(null);
    setPhotoUploadConsent(false);
    router.push('/results');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 20 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 20 * scale) }]}>
          <LinearGradient colors={['#171512', '#0A0A0A', '#0A0A0A']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

          <View style={styles.titleRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => router.replace('/')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={24 * scale} height={24 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text style={[styles.title, { fontSize: 29 * scale, lineHeight: 37 * scale }]}>Your <Text style={styles.accent}>progress</Text></Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={[styles.settingsButton, { width: 40 * scale, height: 40 * scale }]}>
              <Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#E9E0F1" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><Path d="M19.4 15a1.7 1.7 0 0 0 1.2-1.6 1.7 1.7 0 0 0-1.2-1.6 1.7 1.7 0 0 1-.8-2.5 1.7 1.7 0 0 0-2.4-2.4 1.7 1.7 0 0 1-2.5-.8 1.7 1.7 0 0 0-3.2 0 1.7 1.7 0 0 1-2.5.8 1.7 1.7 0 0 0-2.4 2.4 1.7 1.7 0 0 1-.8 2.5A1.7 1.7 0 0 0 3.6 13.4 1.7 1.7 0 0 1 4.8 15a1.7 1.7 0 0 0 2.4 2.4 1.7 1.7 0 0 1 2.5.8 1.7 1.7 0 0 0 3.2 0 1.7 1.7 0 0 1 2.5-.8 1.7 1.7 0 0 0 2.4-2.4 1.7 1.7 0 0 1 1.6 0Z" /></Svg>
            </Pressable>
          </View>
          <Text style={[styles.intro, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>A steady record of your routines, check-ins, and saved observations.</Text>

          <View style={[styles.stats, { gap: 8 * scale, marginTop: 18 * scale }]}>
            <StatCard value={historyLoading ? '—' : String(history.length)} label="Saved scans" />
            <StatCard value={`${completedThisWeek}/7`} label="Routine days" />
            <StatCard value={diaryLoading ? '—' : String(checkInsThisWeek)} label="Check-ins" />
          </View>

          <View style={[styles.card, { marginTop: 14 * scale, padding: 16 * scale, borderRadius: 20 * scale }]}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={[styles.cardTitle, { fontSize: 17 * scale }]}>Routine consistency</Text>
                <Text style={[styles.muted, { fontSize: 10.5 * scale, marginTop: 4 * scale }]}>This week · completed days</Text>
              </View>
              <View style={styles.streakPill}><Text style={styles.streakNumber}>{streak}</Text><Text style={styles.streakLabel}>day streak</Text></View>
            </View>
            <View style={[styles.week, { marginTop: 20 * scale }]}>
              {week.map(day => (
                <View key={day.key} style={styles.day}>
                  <View style={[styles.barTrack, { height: 54 * scale }, day.today && styles.todayTrack]}>
                    <View style={[styles.bar, { height: day.completed ? 42 * scale : 8 * scale }, day.completed && styles.barComplete]} />
                  </View>
                  <Text style={[styles.dayLabel, { fontSize: 9.5 * scale }, day.today && styles.dayToday]}>{day.label}</Text>
                  {day.today && <View style={styles.todayDot} />}
                </View>
              ))}
            </View>
            <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 13 * scale }]}>{routineMessage}</Text>
          </View>

          <View style={[styles.card, { marginTop: 12 * scale, padding: 16 * scale, borderRadius: 20 * scale }]}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.cardTitle, { fontSize: 16 * scale }]}>Recent check-ins</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/skin-diary')}><Text style={[styles.actionLink, { fontSize: 10.5 * scale }]}>Open diary</Text></Pressable>
            </View>
            {diaryLoading
              ? <Text style={[styles.copy, { fontSize: 11 * scale, marginTop: 10 * scale }]}>Loading your private check-ins…</Text>
              : diaryError
                ? <>
                  <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 9 * scale }]}>{diaryError}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><Text style={styles.actionLink}>Retry</Text></Pressable>
                </>
                : recentDiary.length === 0
                  ? <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 9 * scale }]}>Your personal check-ins will appear here when you add them. Skin feelings are self-reported, not measured skin changes.</Text>
                  : <View style={{ marginTop: 8 * scale }}>
                    {recentDiary.map(entry => (
                      <View key={entry.date} style={styles.timelineRow}>
                        <View style={styles.timelineDot} />
                        <View style={styles.timelineContent}>
                          <Text style={[styles.date, { fontSize: 10 * scale }]}>{dateLabel(entry.date)}</Text>
                          <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 2 * scale }]}>
                            {entry.feeling ?? 'Personal check-in'}{entry.concerns.length ? ` · ${entry.concerns.join(', ')}` : ''}
                          </Text>
                          <Text style={[styles.muted, { fontSize: 9.5 * scale, marginTop: 3 * scale }]}>
                            {entry.morningCompleted || entry.eveningCompleted
                              ? `Routine noted: ${[entry.morningCompleted ? 'morning' : '', entry.eveningCompleted ? 'evening' : ''].filter(Boolean).join(' and ')}`
                              : 'Self-reported diary entry'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>}
            <Text style={[styles.disclaimer, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 10 * scale }]}>Diary notes describe what you recorded; they are not an AI assessment or a diagnosis.</Text>
          </View>

          <View style={[styles.card, { marginTop: 12 * scale, padding: 16 * scale, borderRadius: 20 * scale }]}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.cardTitle, { fontSize: 16 * scale }]}>Saved skin observations</Text>
              <Text style={[styles.muted, { fontSize: 9.5 * scale }]}>{historyLoading ? '…' : `${history.length} total`}</Text>
            </View>
            {historyLoading
              ? <Text style={[styles.copy, { fontSize: 11 * scale, marginTop: 9 * scale }]}>Loading your private history…</Text>
              : historyError
                ? <>
                  <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 9 * scale }]}>{historyError}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><Text style={styles.actionLink}>Retry loading history</Text></Pressable>
                </>
                : history.length === 0
                  ? <Text style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 9 * scale }]}>Completed and saved observations will appear here. SkinSnap does not store submitted photos in this history.</Text>
                  : <View style={{ marginTop: 8 * scale }}>
                    {history.slice(0, 5).map(item => (
                      <Pressable key={item.resultId} accessibilityRole="button" onPress={() => openAnalysis(item)} style={styles.analysisItem}>
                        <View style={styles.analysisMarker} />
                        <View style={styles.timelineContent}>
                          <Text style={[styles.date, { fontSize: 10 * scale }]}>{dateLabel(item.createdAt)}</Text>
                          <Text numberOfLines={3} style={[styles.copy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 3 * scale }]}>{item.summary}</Text>
                          <Text style={[styles.actionLink, { fontSize: 10 * scale, marginTop: 5 * scale }]}>View saved observations</Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </Pressable>
                    ))}
                  </View>}
          </View>

          <View style={[styles.actions, { marginTop: 14 * scale, gap: 9 * scale }]}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/upload')} style={[styles.primaryButton, { minHeight: 50 * scale, borderRadius: 26 * scale }]}>
              <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.buttonFill}><Text style={[styles.primaryText, { fontSize: 13 * scale }]}>Start a new scan</Text></LinearGradient>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/skin-diary')} style={[styles.secondaryButton, { minHeight: 46 * scale, borderRadius: 24 * scale }]}>
              <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Add a skin check-in</Text>
            </Pressable>
          </View>
          <Text style={[styles.footer, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 12 * scale }]}>Lighting, camera quality, and filters can affect observations. SkinSnap tracks your records over time but does not diagnose or promise a particular result.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { alignItems: 'flex-start', justifyContent: 'center' },
  settingsButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#534738', backgroundColor: '#1A1A1C' },
  title: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  accent: { color: '#E8C9A0' },
  intro: { color: '#BDBABD', fontFamily: 'InterRegular', marginTop: 1 },
  stats: { flexDirection: 'row' },
  statCard: { flex: 1, minHeight: 75, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 11, backgroundColor: '#1A1A1C', borderColor: '#2A2A2C', borderWidth: 1, borderRadius: 16 },
  statValue: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 20 },
  statLabel: { color: '#BDBABD', fontFamily: 'InterMedium', fontSize: 9, marginTop: 3 },
  card: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: '#FFF', fontFamily: 'InterExtraBold' },
  muted: { color: '#8A8A8A', fontFamily: 'InterRegular' },
  copy: { color: '#D0CAD4', fontFamily: 'InterRegular' },
  streakPill: { flexDirection: 'row', alignItems: 'baseline', gap: 4, borderRadius: 20, backgroundColor: '#302920', paddingHorizontal: 10, paddingVertical: 6 },
  streakNumber: { color: '#E8C9A0', fontFamily: 'InterExtraBold', fontSize: 14 },
  streakLabel: { color: '#D4B896', fontFamily: 'InterMedium', fontSize: 9 },
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { width: '100%', maxWidth: 31, justifyContent: 'flex-end', alignItems: 'center', padding: 4, borderRadius: 12, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  todayTrack: { borderColor: '#D4B896' },
  bar: { width: '100%', borderRadius: 7, backgroundColor: '#534738' },
  barComplete: { backgroundColor: '#D4B896' },
  dayLabel: { color: '#8A8A8A', fontFamily: 'InterMedium' },
  dayToday: { color: '#E8C9A0' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D4B896' },
  actionLink: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  timelineRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2C' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D4B896', marginTop: 4 },
  timelineContent: { flex: 1 },
  date: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  analysisItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#2A2A2C' },
  analysisMarker: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#D4B896', marginTop: 4 },
  chevron: { color: '#8A8A8A', fontSize: 23, lineHeight: 25 },
  disclaimer: { color: '#8A8A8A', fontFamily: 'InterRegular' },
  actions: { width: '100%' },
  primaryButton: { width: '100%', overflow: 'hidden' },
  buttonFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#181613', fontFamily: 'InterExtraBold' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#534738', backgroundColor: '#1A1A1C' },
  secondaryText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  footer: { color: '#948B99', textAlign: 'center', fontFamily: 'InterRegular' },
});
