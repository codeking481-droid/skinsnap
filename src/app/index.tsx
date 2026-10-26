import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainBottomNav } from '../components/MainBottomNav';
import { loadRoutineProgress, type RoutineProgress } from '../routineStorage';
import { getRoutineStreak } from '../progressPresentation';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadAnalysisHistory, type AnalysisHistoryItem } from '../services/authApi';
import { loadCustomRoutine, loadDiary } from '../services/retentionApi';
import { scheduledSteps, type CustomRoutine, type DiaryEntry } from '../retention';
import { buildRoutineSteps, restoreRoutineGuidance, routineStepIds } from '../routinePresentation';

const STARTER_MORNING = [
  'Gentle Cream Cleanser. Step 1 · Cleanse gently.',
  'Moisturizer that suits your skin. Step 2 · Follow the product label.',
  'Broad-spectrum Sunscreen. Step 3 · Follow the product label.',
];
const STARTER_EVENING = [
  'Gentle Cleanser. Step 1 · Remove daily buildup.',
  'Moisturizer that suits your skin. Step 2 · Follow the product label.',
  'A comfortable final step. Step 3 · Keep it simple.',
];

type HomeData = {
  progress: RoutineProgress;
  checkedCount: number;
  totalCount: number;
  morningCount: number;
  eveningCount: number;
  streak: number;
  diary: DiaryEntry[];
  latest: AnalysisHistoryItem | null;
  routineLabel: string;
  notice: string | null;
};

function createStarterHomeData(notice: string | null = null): HomeData {
  return {
    progress: { checkedSteps: [], completedDays: [] },
    checkedCount: 0,
    totalCount: 6,
    morningCount: STARTER_MORNING.length,
    eveningCount: STARTER_EVENING.length,
    streak: 0,
    diary: [],
    latest: null,
    routineLabel: 'GENERAL STARTER · NOT PERSONALIZED',
    notice,
  };
}

function SettingsGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke="#E8C9A0" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3.5" />
      <Path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
    </Svg>
  );
}

function RoutineIcon({ evening = false, size = 30 }: { evening?: boolean; size?: number }) {
  if (evening) {
    return <Svg width={size} height={size} viewBox="0 0 32 32" fill="none"><Path d="M23.5 21.5A11.5 11.5 0 0 1 10.5 8.2 11.5 11.5 0 1 0 23.5 21.5Z" fill="#E8C9A0" /></Svg>;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="#E8C9A0" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 22a9 9 0 0 1 18 0v4H7v-4Z" fill="#E8C9A0" />
      <Path d="M16 4v3m-9 2 2 2m14-2-2 2M3 17h3m20 0h3" />
    </Svg>
  );
}

function SectionHeading({ title, trailing, onPress }: { title: string; trailing?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {trailing && <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}><Text style={styles.sectionAction}>{trailing}</Text></Pressable>}
    </View>
  );
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData>(createStarterHomeData());
  const [refreshKey, setRefreshKey] = useState(0);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));

  useFocusEffect(useCallback(() => {
    let active = true;
    setData(createStarterHomeData(refreshKey ? 'Refreshing saved history…' : null));
    void (async () => {
      const issues: string[] = [];
      let owner: string | null = null;
      try {
        owner = await getRoutineProgressOwner();
      } catch (cause) {
        issues.push(cause instanceof Error ? cause.message : 'Your secure profile could not be checked.');
      }

      let custom: CustomRoutine | null = null;
      let latest: AnalysisHistoryItem | null = null;
      let diary: DiaryEntry[] = [];
      if (owner) {
        const results = await Promise.allSettled([loadCustomRoutine(), loadAnalysisHistory(), loadDiary()]);
        if (results[0].status === 'fulfilled') custom = results[0].value;
        else issues.push(results[0].reason instanceof Error ? results[0].reason.message : 'Your saved routine could not be loaded.');
        if (results[1].status === 'fulfilled') latest = results[1].value[0] ?? null;
        else issues.push(results[1].reason instanceof Error ? results[1].reason.message : 'Your saved observations could not be loaded.');
        if (results[2].status === 'fulfilled') diary = results[2].value.entries;
        else issues.push(results[2].reason instanceof Error ? results[2].reason.message : 'Your private diary could not be loaded.');
      }

      const weekday = new Date().getDay();
      const customToday = custom ? scheduledSteps(custom, weekday) : [];
      let morningGuidance = STARTER_MORNING;
      let eveningGuidance = STARTER_EVENING;
      let morningIds: string[];
      let eveningIds: string[];
      let routineId: string | undefined;
      let routineLabel = 'GENERAL STARTER · NOT PERSONALIZED';
      if (custom) {
        const morning = customToday.filter(step => step.period === 'Morning');
        const evening = customToday.filter(step => step.period === 'Evening');
        morningIds = morning.map(step => step.id);
        eveningIds = evening.map(step => step.id);
        morningGuidance = morning.map(step => step.name);
        eveningGuidance = evening.map(step => step.name);
        routineId = `custom-${custom.sourceResultId ?? 'manual'}`;
        routineLabel = 'YOUR CUSTOM ROUTINE';
      } else if (latest) {
        const restored = restoreRoutineGuidance(latest);
        morningGuidance = restored.morningRoutine;
        eveningGuidance = restored.eveningRoutine;
        morningIds = routineStepIds(morningGuidance, []).filter(id => id.startsWith('Morning-'));
        eveningIds = routineStepIds([], eveningGuidance).filter(id => id.startsWith('Evening-'));
        routineId = latest.resultId;
        routineLabel = restored.usesGeneralGuidance ? 'SAVED GUIDANCE · SOME GENERAL STEPS' : 'YOUR SAVED GUIDANCE';
      } else {
        morningIds = buildRoutineSteps(morningGuidance, 'Morning').map(step => step.id);
        eveningIds = buildRoutineSteps(eveningGuidance, 'Evening').map(step => step.id);
      }
      const progress = await loadRoutineProgress(owner ?? undefined, routineId);
      if (!active) return;
      const allIds = [...morningIds, ...eveningIds];
      setData({
        progress,
        checkedCount: allIds.filter(id => progress.checkedSteps.includes(id)).length,
        totalCount: allIds.length,
        morningCount: morningGuidance.length,
        eveningCount: eveningGuidance.length,
        streak: getRoutineStreak(progress.completedDays),
        diary: diary.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
        latest,
        routineLabel,
        notice: issues.length
          ? 'Some saved history is unavailable right now. You can still use your on-device routine.'
          : owner ? null : 'Saved history needs a connected profile. Your routine is available on this device.',
      });
    })().catch((cause: unknown) => {
      if (!active) return;
      setData(createStarterHomeData(cause instanceof Error ? cause.message : 'Your dashboard could not load. Please try again.'));
    });
    return () => { active = false; };
  }, [refreshKey]));

  const checkedPercent = data?.totalCount ? Math.round((data.checkedCount / data.totalCount) * 100) : 0;
  const ringCircumference = 2 * Math.PI * 48;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { minHeight: height, paddingBottom: 24 * scale }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingTop: Math.max(insets.top, 14 * scale), paddingHorizontal: 18 * scale }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.welcome, { fontSize: 23 * scale, lineHeight: 29 * scale }]}>Welcome back,</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open profile and settings" onPress={() => router.push('/settings')} style={[styles.settingsButton, { width: 42 * scale, height: 42 * scale }]}>
              <SettingsGlyph />
            </Pressable>
          </View>

          <View style={[styles.summary, { marginTop: 12 * scale, paddingVertical: 12 * scale }]}>
            <View style={[styles.progressRing, { width: 134 * scale, height: 134 * scale }]}>
              <Svg width={134 * scale} height={134 * scale} viewBox="0 0 108 108" style={StyleSheet.absoluteFill}>
                <Circle cx="54" cy="54" r="48" fill="none" stroke="#312B25" strokeWidth="4.5" />
                <Circle cx="54" cy="54" r="48" fill="none" stroke="#E8C9A0" strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${ringCircumference}`} strokeDashoffset={ringCircumference * (1 - checkedPercent / 100)} transform="rotate(-90 54 54)" />
              </Svg>
              <Text style={[styles.ringValue, { fontSize: 38 * scale }]}>{data ? `${checkedPercent}%` : '—'}</Text>
              <Text style={[styles.ringLabel, { fontSize: 11 * scale }]}>ROUTINE TODAY</Text>
            </View>
            <Text style={[styles.summaryLine, { fontSize: 13 * scale }]}>
              {data?.totalCount ? `${data.checkedCount} of ${data.totalCount} steps checked` : 'Your routine progress will appear here'}
            </Text>
            <View style={styles.updatedLine}><Text style={styles.clockGlyph}>◷</Text><Text style={[styles.updatedText, { fontSize: 12 * scale }]}>Updates as you check off steps</Text></View>
          </View>

          <View style={[styles.stats, { gap: 10 * scale, marginTop: 14 * scale }]}>
            <View style={[styles.statCard, { borderRadius: 18 * scale, minHeight: 92 * scale, padding: 13 * scale }]}>
              <Text style={[styles.statLabel, { fontSize: 12 * scale }]}>Streak</Text>
              <Text style={[styles.statValue, { fontSize: 27 * scale }]}>{data ? `${data.streak} ${data.streak === 1 ? 'day' : 'days'}` : '—'}</Text>
            </View>
            <View style={[styles.statCard, { borderRadius: 18 * scale, minHeight: 92 * scale, padding: 13 * scale }]}>
              <Text style={[styles.statLabel, { fontSize: 12 * scale }]}>Routine done</Text>
              <Text style={[styles.statValue, { fontSize: 27 * scale }]}>{data ? `${checkedPercent}%` : '—'}</Text>
              <Text style={[styles.statHint, { fontSize: 10 * scale }]}>{data ? `${data.checkedCount}/${data.totalCount} steps today` : 'Loading progress'}</Text>
            </View>
          </View>

          <Text style={[styles.routineLabel, { marginTop: 18 * scale }]}>{data.routineLabel}</Text>
          <SectionHeading title="Routines" trailing="See all" onPress={() => router.push('/routine')} />
          <View style={styles.routineCards}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/routine')} style={[styles.routineCard, { minHeight: 77 * scale, borderRadius: 17 * scale, paddingHorizontal: 12 * scale, gap: 11 * scale }]}>
              <View style={[styles.routineIcon, { width: 48 * scale, height: 48 * scale, borderRadius: 14 * scale }]}><RoutineIcon size={29 * scale} /></View>
              <View style={styles.routineCopy}>
                <Text style={[styles.routineTitle, { fontSize: 15 * scale }]}>Morning Routine</Text>
                <Text style={[styles.routineMeta, { fontSize: 11 * scale }]}>8 AM · {data?.morningCount ?? '—'} steps</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/routine')} style={[styles.routineCard, { minHeight: 77 * scale, borderRadius: 17 * scale, paddingHorizontal: 12 * scale, gap: 11 * scale }]}>
              <View style={[styles.routineIcon, { width: 48 * scale, height: 48 * scale, borderRadius: 14 * scale }]}><RoutineIcon evening size={27 * scale} /></View>
              <View style={styles.routineCopy}>
                <Text style={[styles.routineTitle, { fontSize: 15 * scale }]}>Evening Routine</Text>
                <Text style={[styles.routineMeta, { fontSize: 11 * scale }]}>9 PM · {data?.eveningCount ?? '—'} steps</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
          <SectionHeading title="Skin Diary" trailing={data ? `${data.diary.length} ${data.diary.length === 1 ? 'check-in' : 'check-ins'}` : undefined} onPress={() => router.push('/skin-diary')} />
          {data?.diary.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.diaryStrip, { gap: 10 * scale }]}>
              {data.diary.map(entry => (
                <Pressable key={entry.date} accessibilityRole="button" onPress={() => router.push('/skin-diary')} style={[styles.diaryCard, { width: 150 * scale, minHeight: 116 * scale, borderRadius: 16 * scale, padding: 13 * scale }]}>
                  <Text style={[styles.diaryDate, { fontSize: 10 * scale }]}>{dateLabel(entry.date)}</Text>
                  <Text numberOfLines={2} style={[styles.diaryFeeling, { fontSize: 14 * scale, lineHeight: 18 * scale }]}>{entry.feeling ?? 'Personal check-in'}</Text>
                  <Text numberOfLines={2} style={[styles.diaryDetail, { fontSize: 10 * scale, lineHeight: 14 * scale }]}>{entry.concerns.length ? entry.concerns.join(' · ') : 'Your own note · private diary'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push('/skin-diary')} style={[styles.emptyDiary, { borderRadius: 16 * scale, padding: 15 * scale, minHeight: 74 * scale }]}>
              <View style={styles.emptyDiaryIcon}><Text style={styles.plus}>＋</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptyDiaryTitle, { fontSize: 13 * scale }]}>Add your first check-in</Text>
                <Text style={[styles.emptyDiaryCopy, { fontSize: 10 * scale, lineHeight: 14 * scale }]}>Record how your skin feels. Diary notes are self-reported.</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          {data?.latest && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={[styles.latestCard, { borderRadius: 16 * scale, padding: 13 * scale, marginTop: 12 * scale }]}>
              <Text style={[styles.latestEyebrow, { fontSize: 9 * scale }]}>LATEST SAVED OBSERVATIONS</Text>
              <Text numberOfLines={2} style={[styles.latestSummary, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>{data.latest.summary}</Text>
              <Text style={[styles.sectionAction, { marginTop: 7 * scale, fontSize: 11 * scale }]}>View observations ›</Text>
            </Pressable>
          )}
          {data?.notice && (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading saved dashboard data" onPress={() => setRefreshKey(value => value + 1)} style={[styles.notice, { borderRadius: 13 * scale, padding: 11 * scale }]}>
              <Text style={[styles.noticeText, { fontSize: 10 * scale, lineHeight: 15 * scale }]}>{data.notice}</Text>
              <Text style={[styles.noticeAction, { fontSize: 10 * scale }]}>Tap to retry</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <MainBottomNav active="home" bottomInset={Math.max(insets.bottom, 8 * scale)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcome: { color: '#BDBABD', fontFamily: 'InterMedium', letterSpacing: -0.5 },
  settingsButton: { borderRadius: 22, borderWidth: 1, borderColor: '#2A2A2C', backgroundColor: '#1A1A1C', alignItems: 'center', justifyContent: 'center' },
  summary: { alignItems: 'center' },
  progressRing: { alignItems: 'center', justifyContent: 'center' },
  ringValue: { color: '#FFFFFF', fontFamily: 'InterRegular', letterSpacing: -1.4 },
  ringLabel: { color: '#E8C9A0', fontFamily: 'InterMedium', marginTop: -2 },
  summaryLine: { color: '#E8C9A0', fontFamily: 'InterSemibold', textAlign: 'center', marginTop: 10 },
  updatedLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  clockGlyph: { color: '#E8C9A0', fontSize: 17, lineHeight: 19 },
  updatedText: { color: '#9A9698', fontFamily: 'InterRegular' },
  stats: { flexDirection: 'row' },
  statCard: { flex: 1, backgroundColor: '#1A1A1C', alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: '#969195', fontFamily: 'InterMedium' },
  statValue: { color: '#FFFFFF', fontFamily: 'InterSemibold', marginTop: 3, letterSpacing: -0.5 },
  statHint: { color: '#A29DA1', fontFamily: 'InterRegular', marginTop: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 9 },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'InterSemibold', fontSize: 18, letterSpacing: -0.35 },
  routineLabel: { color: '#8A8586', fontFamily: 'InterSemibold', fontSize: 9, letterSpacing: 1.25, marginBottom: 3 },
  sectionAction: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 13 },
  routineCards: { gap: 9 },
  routineCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1C' },
  routineIcon: { backgroundColor: '#2A2A2C', alignItems: 'center', justifyContent: 'center' },
  routineCopy: { flex: 1 },
  routineTitle: { color: '#F8F7F7', fontFamily: 'InterSemibold' },
  routineMeta: { color: '#9E999D', fontFamily: 'InterRegular', marginTop: 2 },
  chevron: { color: '#777276', fontFamily: 'InterRegular', fontSize: 30, lineHeight: 32 },
  diaryStrip: { paddingBottom: 2 },
  diaryCard: { backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C', justifyContent: 'space-between' },
  diaryDate: { color: '#E8C9A0', fontFamily: 'InterMedium' },
  diaryFeeling: { color: '#FFFFFF', fontFamily: 'InterSemibold', marginTop: 9 },
  diaryDetail: { color: '#A5A0A3', fontFamily: 'InterRegular', marginTop: 5 },
  emptyDiary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  emptyDiaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#302920', alignItems: 'center', justifyContent: 'center' },
  plus: { color: '#E8C9A0', fontSize: 22 },
  emptyDiaryTitle: { color: '#F7F5F5', fontFamily: 'InterSemibold' },
  emptyDiaryCopy: { color: '#9E999D', fontFamily: 'InterRegular', marginTop: 3 },
  latestCard: { backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  latestEyebrow: { color: '#E8C9A0', fontFamily: 'InterSemibold', letterSpacing: 0.8 },
  latestSummary: { color: '#E9E6E8', fontFamily: 'InterRegular', marginTop: 6 },
  notice: { marginTop: 10, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  noticeText: { color: '#B6AFB6', fontFamily: 'InterRegular' },
  noticeAction: { color: '#E8C9A0', fontFamily: 'InterSemibold', marginTop: 4 },
});
