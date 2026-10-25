import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadRoutineProgress, saveRoutineProgress } from '../routineStorage';
import { loadCustomRoutine } from '../services/retentionApi';
import { scheduledSteps, type CustomRoutine } from '../retention';
import { Action } from '../components/RetentionUI';
import { backOrReplace } from '../navigation';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadAnalysisHistory, type AnalysisHistoryItem } from '../services/authApi';
import {
  buildRoutineSteps,
  restoreRoutineGuidance,
  routineTip,
  type RoutinePeriod,
  type RoutineStep,
} from '../routinePresentation';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEMO_ROUTINE = {
  morningRoutine: [
    'Use a gentle cleanser and rinse with lukewarm water.',
    'Apply a fragrance-free moisturizer.',
    'Finish with broad-spectrum SPF 30 or higher.',
  ],
  eveningRoutine: [
    'Remove sunscreen and cleanse gently.',
    'Apply a fragrance-free moisturizer to comfortable, dry skin.',
  ],
  precautions: ['Patch test new products and follow their labels.'],
};

type RoutineGuidance = Pick<AnalysisHistoryItem, 'morningRoutine' | 'eveningRoutine' | 'precautions'>;

export default function RoutineScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ demo?: string }>();
  const demoMode = __DEV__ && params.demo === 'true';
  const [period, setPeriod] = useState<RoutinePeriod>('Morning');
  const [completedDays, setCompletedDays] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [customRoutine, setCustomRoutine] = useState<CustomRoutine | null>(null);
  const [customNotice, setCustomNotice] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<string | undefined>();
  const [owner, setOwner] = useState<string | null>(null);
  const [routine, setRoutine] = useState<RoutineGuidance | null>(demoMode ? DEMO_ROUTINE : null);
  const [generalRoutine, setGeneralRoutine] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState(demoMode ? 'DEMO MODE · progress is stored on this device' : 'Loading your saved routine…');
  const [selectedStep, setSelectedStep] = useState<RoutineStep | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(demoMode);
  const [progressChanged, setProgressChanged] = useState(false);
  const scale = Math.max(0.92, Math.min(Math.min(width, 520) / 393, 1.08));

  const calendarDay = new Date().getDay();
  const presentSteps = useCallback((value: RoutinePeriod): RoutineStep[] => customRoutine
    ? scheduledSteps(customRoutine, calendarDay, value).map((step, index) => ({ id: step.id, order: index + 1, title: step.name, instructions: step.description || 'Your custom routine step.', category: 'Your own step', ingredients: [], frequency: 'On your selected days' }))
    : buildRoutineSteps(value === 'Morning' ? routine?.morningRoutine ?? [] : routine?.eveningRoutine ?? [], value), [calendarDay, customRoutine, routine]);
  const morningSteps = useMemo(() => presentSteps('Morning'), [presentSteps]);
  const eveningSteps = useMemo(() => presentSteps('Evening'), [presentSteps]);
  const steps = period === 'Morning' ? morningSteps : eveningSteps;
  const allStepIds = useMemo(() => [...morningSteps, ...eveningSteps].map(step => step.id), [morningSteps, eveningSteps]);

  useFocusEffect(useCallback(() => {
    if (demoMode) return undefined;
    let active = true;
    setLoading(true);
    setSyncStatus(reloadKey ? 'Refreshing your saved routine...' : 'Loading your saved routine...');
    setLoaded(false);
    setProgressChanged(false);
    setError(null);
    setRoutine(null);
    setGeneralRoutine(false);
    setCustomRoutine(null);
    setCustomNotice(null);
    void (async () => {
      try {
        let accountId: string | null = null;
        let accountMessage: string | null = null;
        try {
          accountId = await getRoutineProgressOwner();
        } catch (cause) {
          accountMessage = cause instanceof Error ? cause.message : 'Secure account history is unavailable.';
        }
        const savedProgress = await loadRoutineProgress(accountId ?? undefined);
        if (!active) return;
        setOwner(accountId);
        setChecked(savedProgress.checkedSteps);
        setCompletedDays(savedProgress.completedDays);
        if (!accountId) {
          setRoutine(null);
          setSyncStatus(`${accountMessage ?? 'Secure account history is unavailable.'} Routine completion is saved on this device.`);
          setLoaded(true);
          return;
        }
        const history = await loadAnalysisHistory();
        if (!active) return;
        const latest = history[0];
        let custom: CustomRoutine | null = null;
        try { custom = await loadCustomRoutine(); }
        catch { if (active) setCustomNotice('Routine editing is awaiting the server update or is temporarily unavailable. Your saved AI guidance is shown below.'); }
        if (!active) return;
        setCustomRoutine(custom);
        const currentRoutineId = custom ? 'custom-' + (custom.sourceResultId ?? 'manual') : latest?.resultId;
        const scopedProgress = await loadRoutineProgress(accountId, currentRoutineId);
        if (!active) return;
        setRoutineId(currentRoutineId);
        setChecked(scopedProgress.checkedSteps);
        setCompletedDays(scopedProgress.completedDays);
        if (custom) {
          setRoutine({ morningRoutine: custom.steps.filter(s => s.period === 'Morning').map(s => s.description || s.name), eveningRoutine: custom.steps.filter(s => s.period === 'Evening').map(s => s.description || s.name), precautions: [] });
          setSafetyNotice("Your routine is customizable. SkinSnap doesn't verify the safety of products you add.");
        } else if (!latest) {
          setRoutine(null);
        } else {
          const restored = restoreRoutineGuidance(latest);
          setRoutine({
            morningRoutine: restored.morningRoutine,
            eveningRoutine: restored.eveningRoutine,
            precautions: restored.precautions,
          });
          setGeneralRoutine(restored.usesGeneralGuidance);
          if (restored.usesGeneralGuidance) {
            setSafetyNotice(restored.removedUnsupportedGuidance
              ? 'Some saved guidance could not be shown. General, non-personalized steps are shown for the missing part of your routine.'
              : 'No saved steps were available for part of your routine. General, non-personalized steps are shown instead.');
          } else if (restored.removedUnsupportedGuidance) {
            setSafetyNotice('Some saved guidance was hidden because it did not meet SkinSnap’s non-diagnostic safety standards.');
          } else {
            setSafetyNotice(null);
          }
        }
        setSyncStatus(custom ? 'Your custom routine is saved to your secure profile. Checkmarks are saved on this device.' : 'Saved routine and progress are private to this account on this device.');
        setLoaded(true);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Your saved routine could not be loaded.');
        setRoutine(null);
        setSafetyNotice(null);
        setLoaded(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [demoMode, reloadKey]));

  useEffect(() => {
    if (!loaded || demoMode || !progressChanged || !routine) return undefined;
    const snapshot = { checkedSteps: checked, completedDays };
    if (!owner) return undefined;
    void saveRoutineProgress(snapshot, owner, routineId)
      .catch(() => setSyncStatus('Progress could not be saved on this device. Please try again.'));
  }, [checked, completedDays, demoMode, loaded, owner, routineId, progressChanged, routine]);

  const today = new Date();
  const currentDayIndex = (today.getDay() + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - currentDayIndex);
  const weekDates = DAYS.map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const todayKey = weekDates[currentDayIndex];

  const toggleStep = (id: string) => {
    setProgressChanged(true);
    const next = checked.includes(id) ? checked.filter((value) => value !== id) : [...checked, id];
    setChecked(next);
    const dayComplete = allStepIds.length > 0 && allStepIds.every((stepId) => next.includes(stepId));
    setCompletedDays((current) => dayComplete
      ? [...new Set([...current, todayKey])]
      : current.filter((key) => key !== todayKey));
  };

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    setLoaded(false);
    setReloadKey((current) => current + 1);
  }, []);
  const startAnalysis = () => router.push('/upload');
  const formatPeriod = (value: string) => value === 'Morning' ? 'morning' : 'evening';
  const tip = routineTip(routine?.morningRoutine ?? [], routine?.eveningRoutine ?? [], routine?.precautions ?? []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: height, paddingBottom: Math.max(insets.bottom, 16) + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 21 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: 24 * scale }]}>
          <LinearGradient colors={['#09070B', '#050509', '#050509']} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.headingRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to recommendations" onPress={() => backOrReplace('/recommendations')} style={[styles.back, { width: 44 * scale, height: 44 * scale }]}>
              <Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.title, { fontSize: 30 * scale, lineHeight: 40 * scale }]}>Your <Text style={styles.pink}>Routine</Text></Text>
            <View style={{ width: 34 * scale }} />
          </View>

          {demoMode
            ? <Text style={[styles.demoNotice, { fontSize: 10 * scale, marginTop: 4 * scale }]}>DEMO ROUTINE · GENERAL EXAMPLE, NOT PERSONALIZED</Text>
            : routine
              ? <Text style={[styles.demoNotice, { fontSize: 10 * scale, marginTop: 4 * scale }]}>{generalRoutine ? 'GENERAL ROUTINE · NOT PERSONALIZED' : customRoutine ? 'YOUR CUSTOM ROUTINE' : 'YOUR SAVED AI-ASSISTED GUIDANCE'} · NON-DIAGNOSTIC</Text>
              : null}
          <Action secondary label="Edit my routine" onPress={() => router.push('/routine-edit')} />
          <Action secondary label="My Skin Diary" onPress={() => router.push('/skin-diary')} />
          {customNotice && <Text style={styles.syncStatus}>{customNotice}</Text>}
          {safetyNotice && <Text accessibilityRole="alert" style={[styles.safetyNotice, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 8 * scale }]}>{safetyNotice}</Text>}
          <Text accessibilityLiveRegion="polite" style={[styles.syncStatus, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 5 * scale }]}>{syncStatus}</Text>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color="#FF6698" />
              <Text style={styles.stateText}>Loading your saved routine…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Text accessibilityRole="header" style={styles.stateTitle}>Routine unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={reload} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Try again</Text></Pressable>
            </View>
          ) : !routine ? (
            <View style={styles.stateCard}>
              <Text accessibilityRole="header" style={styles.stateTitle}>No saved AI routine yet</Text>
              <Text style={styles.stateText}>
                {owner
                  ? 'Complete an authorized skin analysis to create routine guidance saved to your account.'
                  : 'Sign in and complete an authorized skin analysis to see your account-specific routine.'}
              </Text>
              <Pressable accessibilityRole="button" onPress={startAnalysis} style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>{owner ? 'Start a skin analysis' : 'Sign in or start analysis'}</Text>
              </Pressable>
              {__DEV__ && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/routine', params: { demo: 'true' } })} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>View labelled demo routine</Text></Pressable>}
            </View>
          ) : (
            <>
              <View style={[styles.week, { marginTop: 16 * scale }]}>{DAYS.map((day, index) => {
                const completed = completedDays.includes(weekDates[index]);
                const isToday = index === currentDayIndex;
                return (
                  <View key={day} accessibilityLabel={`${day}${isToday ? ', today' : ''}${completed ? ', completed' : ''}`} style={styles.day}>
                    <Text style={[styles.dayLabel, { fontSize: 12 * scale, color: isToday ? '#FF5E94' : '#CBD2DC' }]}>{day}</Text>
                    <View style={[styles.dayCircle, { width: 30 * scale, height: 30 * scale, borderRadius: 16 * scale, borderColor: completed ? (isToday ? '#FF5D94' : '#D7E2F0') : '#38333D', backgroundColor: isToday && completed ? '#FF5D94' : 'transparent' }]}>
                      {completed && <Svg width={17 * scale} height={17 * scale} viewBox="0 0 24 24" fill="none" stroke={isToday ? '#08090D' : '#FFF'} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg>}
                    </View>
                  </View>
                );
              })}</View>

              <View style={[styles.tabs, { marginTop: 15 * scale, borderRadius: 21 * scale }]}>
                {(['Morning', 'Evening'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: period === value }} onPress={() => setPeriod(value)} style={[styles.tab, period === value && styles.activeTab]}>
                    <Text style={[styles.tabText, { fontSize: 14 * scale, color: period === value ? '#09090D' : '#F4F3F6' }]}>{value}</Text>
                    {value === 'Morning' ? <SunIcon size={20 * scale} color={period === value ? '#09090D' : '#FFF'} /> : <MoonIcon size={19 * scale} color={period === value ? '#09090D' : '#FFF'} />}
                  </Pressable>
                ))}
              </View>

              <Text accessibilityLiveRegion="polite" style={[styles.orderNote, { fontSize: 13 * scale, lineHeight: 19 * scale, marginTop: 12 * scale }]}>
                {steps.filter((step) => checked.includes(step.id)).length} of {steps.length} {period.toLowerCase()} steps completed today
              </Text>
              <Text style={[styles.orderNote, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 12 * scale }]}>
                Steps are shown in your saved order for today. Tap a step for its guidance.
              </Text>
              {steps.length ? steps.map((step) => {
                const done = checked.includes(step.id);
                return (
                  <View key={step.id} style={[styles.stepRow, { marginTop: 8 * scale }]}>
                    <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark ${period.toLowerCase()} step ${step.order}: ${step.title}`} accessibilityState={{ checked: done }} onPress={() => toggleStep(step.id)} style={[styles.stepCheck, done && styles.stepCheckDone]}>
                      {done && <Svg width={16 * scale} height={16 * scale} viewBox="0 0 24 24" fill="none" stroke="#08090D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg>}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Step ${step.order}, ${step.title}. Open details`} onPress={() => setSelectedStep(step)} style={styles.stepCard}>
                      <View style={[styles.number, { width: 34 * scale, height: 34 * scale, borderRadius: 18 * scale }]}><Text style={[styles.numberText, { fontSize: 18 * scale }]}>{step.order}</Text></View>
                      <View style={styles.stepCopy}>
                        <Text style={[styles.stepTitle, { fontSize: 15 * scale, lineHeight: 21 * scale }]}>{step.title}</Text>
                        <Text style={[styles.stepDetail, { fontSize: 12 * scale, lineHeight: 17 * scale, marginTop: 3 * scale }]} numberOfLines={2}>{step.instructions}</Text>
                      </View>
                      <Svg width={17 * scale} height={17 * scale} viewBox="0 0 24 24" fill="none" stroke="#FF6497" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="m9 18 6-6-6-6" /></Svg>
                    </Pressable>
                  </View>
                );
              }) : (
                <View style={[styles.stateCard, { marginTop: 12 * scale }]}>
                  <Text style={styles.stateText}>No {formatPeriod(period)} steps were included in the saved routine.</Text>
                </View>
              )}

              {!!routine.precautions.length && (
                <View style={[styles.precautionCard, { marginTop: 14 * scale, padding: 14 * scale }]}>
                  <Text style={[styles.precautionTitle, { fontSize: 14 * scale }]}>Guidance and precautions</Text>
                  {routine.precautions.map((precaution, index) => <Text key={`${index}-${precaution}`} style={[styles.precautionText, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 5 * scale }]}>• {precaution}</Text>)}
                </View>
              )}

              <Action secondary label="Reset today's checkmarks" onPress={() => { setProgressChanged(true); setChecked([]); setCompletedDays(current => current.filter(day => day !== todayKey)); }} />
              <View style={[styles.proTip, { borderRadius: 16 * scale, padding: 15 * scale, marginTop: 14 * scale }]}>
                <View style={[styles.tipIcon, { width: 42 * scale, height: 42 * scale, borderRadius: 13 * scale }]}><TipBulb size={27 * scale} /></View>
                <View style={styles.tipCopy}><Text style={[styles.tipTitle, { fontSize: 15 * scale }]}>Routine tip</Text><Text style={[styles.tipText, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 3 * scale }]}>{tip}</Text></View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={[styles.cta, { minHeight: 54 * scale, borderRadius: 28 * scale, marginTop: 14 * scale }]}>
                <LinearGradient colors={['#FF6494', '#FF6794', '#FF6B99']} style={styles.ctaFill}>
                  <Text style={[styles.ctaText, { fontSize: 16 * scale }]}>Track My Progress</Text>
                  <Svg width={21 * scale} height={21 * scale} viewBox="0 0 24 24" fill="none" stroke="#08090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedStep)} transparent animationType="fade" onRequestClose={() => setSelectedStep(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView accessibilityViewIsModal style={styles.modalCard} contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {selectedStep ? `Step ${selectedStep.order} · ${selectedStep.title}` : ''}
            </Text>
            <Detail label="Routine period" value={`${period} routine · application order ${selectedStep?.order ?? ''}`} />
            <Detail label="Category" value={selectedStep?.category ?? ''} />
            <Detail label="Ingredients" value={selectedStep?.ingredients.length ? selectedStep.ingredients.join(', ') : 'No ingredient is named in the saved guidance.'} />
            <Detail label="Frequency" value={selectedStep?.frequency ?? ''} />
            <Detail label="Instructions" value={selectedStep?.instructions ?? ''} />
            <Text style={styles.modalCaution}>
              {routine?.precautions[0] ?? 'Follow the product label, patch test new products, and stop use if irritation occurs.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setSelectedStep(null)} style={styles.dismissButton}><Text style={styles.dismissText}>Done</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailBlock}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function SunIcon({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round"><Circle cx="12" cy="12" r="4" fill={color} />{Array.from({ length: 8 }, (_, i) => <Path key={i} d="M12 1.5v2.6" transform={`rotate(${i * 45} 12 12)`} />)}</Svg>;
}

function MoonIcon({ size, color }: { size: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M20.5 15.5A8.8 8.8 0 0 1 8.5 3.5 9.5 9.5 0 1 0 20.5 15.5Z" /></Svg>;
}

function TipBulb({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#FF75A2" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M13 25c0-4-5-6-5-12a12 12 0 0 1 24 0c0 6-5 8-5 12M14 29h12m-9 4h6m-3-22v12" /></Svg>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#050509' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { justifyContent: 'center', alignItems: 'center' },
  title: { color: '#F7F6F9', fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  pink: { color: '#FF5A91' },
  demoNotice: { alignSelf: 'center', color: '#FF9CBC', fontFamily: 'InterSemibold', textAlign: 'center', letterSpacing: 0.55 },
  syncStatus: { alignSelf: 'center', color: '#D7A7B9', fontFamily: 'InterRegular', textAlign: 'center' },
  safetyNotice: { color: '#FFD3DF', fontFamily: 'InterMedium', textAlign: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: 6 },
  dayLabel: { fontFamily: 'InterMedium' },
  dayCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  tabs: { flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(12,13,18,0.97)', borderWidth: 1, borderColor: '#383640' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12 },
  activeTab: { backgroundColor: '#FF6094' },
  tabText: { fontFamily: 'InterSemibold' },
  orderNote: { color: '#BDB6C2', fontFamily: 'InterRegular' },
  stepRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  stepCheck: { width: 38, minHeight: 62, borderRadius: 12, borderWidth: 1.5, borderColor: '#68505D', alignItems: 'center', justifyContent: 'center' },
  stepCheckDone: { backgroundColor: '#FF6294', borderColor: '#FF6294' },
  stepCard: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 72, backgroundColor: 'rgba(10,12,17,0.94)', borderWidth: 1, borderColor: '#292C34', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  number: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(85,28,49,0.85)', borderWidth: 0.9, borderColor: '#BD3A68' },
  numberText: { color: '#FFF', fontFamily: 'InterExtraBold' },
  stepCopy: { flex: 1, minWidth: 0 },
  stepTitle: { color: '#F7F6F9', fontFamily: 'InterSemibold' },
  stepDetail: { color: '#C2C8D2', fontFamily: 'InterRegular' },
  stateCard: { width: '100%', alignItems: 'center', padding: 22, gap: 12, marginTop: 22, borderRadius: 18, borderWidth: 1, borderColor: '#45323E', backgroundColor: 'rgba(15,12,18,0.96)' },
  stateTitle: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 18, textAlign: 'center' },
  stateText: { color: '#D0C8D2', fontFamily: 'InterRegular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primaryAction: { minHeight: 50, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 25, paddingHorizontal: 16, backgroundColor: '#FF6898' },
  primaryActionText: { color: '#10080D', fontFamily: 'InterExtraBold', fontSize: 15, textAlign: 'center' },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryActionText: { color: '#FF9CBC', fontFamily: 'InterSemibold', fontSize: 14, textAlign: 'center' },
  precautionCard: { width: '100%', borderWidth: 1, borderColor: '#58414E', borderRadius: 14, backgroundColor: 'rgba(24,15,21,0.92)' },
  precautionTitle: { color: '#FF9CBC', fontFamily: 'InterSemibold' },
  precautionText: { color: '#D4CCD5', fontFamily: 'InterRegular' },
  proTip: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1.2, borderColor: '#FF4788', backgroundColor: 'rgba(34,10,24,0.86)' },
  tipIcon: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DD3D75', backgroundColor: 'rgba(75,22,44,0.9)' },
  tipCopy: { flex: 1 },
  tipTitle: { color: '#FF5D94', fontFamily: 'InterSemibold' },
  tipText: { color: '#C4CAD5', fontFamily: 'InterRegular' },
  cta: { width: '100%', overflow: 'hidden', boxShadow: '0px 0px 24px 2px rgba(255,68,128,0.4)' },
  ctaFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#08090D', fontFamily: 'InterExtraBold' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '90%', alignSelf: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#704052', backgroundColor: '#171118' },
  modalContent: { padding: 20 },
  modalTitle: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 19, lineHeight: 27, marginBottom: 8 },
  detailBlock: { marginTop: 8 },
  detailLabel: { color: '#FF9CBC', fontFamily: 'InterSemibold', fontSize: 13 },
  detailValue: { color: '#E2DCE4', fontFamily: 'InterRegular', fontSize: 14, lineHeight: 20, marginTop: 2 },
  modalCaution: { color: '#D0BFC8', fontFamily: 'InterRegular', fontSize: 12, lineHeight: 18, marginTop: 14 },
  dismissButton: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  dismissText: { color: '#FF92B4', fontFamily: 'InterExtraBold', fontSize: 15 },
});
