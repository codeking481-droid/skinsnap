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
import { MainBottomNav } from '../components/MainBottomNav';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadAnalysisHistory, type AnalysisHistoryItem } from '../services/authApi';
import {
  buildRoutineSteps,
  restoreRoutineGuidance,
  type RoutinePeriod,
  type RoutineStep,
} from '../routinePresentation';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEMO_ROUTINE = {
  morningRoutine: [
    'Gentle Cream Cleanser. Step 1 · 60s · Cleanse impurities.',
    'Vitamin C Serum. Step 2 · 3–4 drops · Brighten & protect.',
    'Daily SPF 50 Sunscreen. Step 3 · 2-finger rule · Reapply as needed.',
  ],
  eveningRoutine: [
    'Overnight Repair Cleanser. Step 1 · 60s · Remove makeup & dirt.',
    'Retinol Serum. Step 2 · Pea-size · Smooth & renew.',
    'Hydrating Moisturizer. Step 3 · Night cream · Lock in hydration.',
  ],
  precautions: ['General example only. Follow product labels and patch test new products.'],
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
    setRoutineId(undefined);
    setCustomRoutine(null);
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
          setRoutine(DEMO_ROUTINE);
          setGeneralRoutine(true);
          setSafetyNotice('This is a general example, not personalized guidance. Follow product labels and stop use if irritation occurs.');
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
          setRoutine(DEMO_ROUTINE);
          setGeneralRoutine(true);
          setSafetyNotice('This is a general example, not personalized guidance. Complete an authorized analysis for saved AI-assisted guidance.');
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
    void saveRoutineProgress(snapshot, owner ?? undefined, routineId)
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
  const formatPeriod = (value: string) => value === 'Morning' ? 'morning' : 'evening';
  const completedStepCount = allStepIds.filter((stepId) => checked.includes(stepId)).length;
  const completionPercent = allStepIds.length ? Math.round((completedStepCount / allStepIds.length) * 100) : 0;
  const ringCircumference = 2 * Math.PI * 46;

  const renderRoutineSection = (name: RoutinePeriod, time: string, sectionSteps: RoutineStep[]) => (
    <View key={name} style={styles.routineSection}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleGroup}>
          {name === 'Morning'
            ? <SunIcon size={22 * scale} color="#D4B896" />
            : <MoonIcon size={21 * scale} color="#D4B896" />}
          <Text style={[styles.sectionTitle, { fontSize: 17 * scale }]}>{name} Routine</Text>
        </View>
        <Text style={[styles.sectionMeta, { fontSize: 11 * scale }]}>{time} · {sectionSteps.length} steps</Text>
      </View>
      {sectionSteps.length ? sectionSteps.map((step) => {
        const done = checked.includes(step.id);
        return (
          <View key={step.id} style={[styles.stepCard, { minHeight: 77 * scale, borderRadius: 16 * scale, marginTop: 8 * scale, paddingHorizontal: 13 * scale, paddingVertical: 10 * scale }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Step ${step.order}, ${step.title}. Open details`} onPress={() => {
              setPeriod(name);
              setSelectedStep(step);
            }} style={styles.stepDetails}>
              <ProductIcon category={step.category} size={34 * scale} />
              <View style={styles.stepCopy}>
                <Text numberOfLines={1} style={[styles.stepTitle, { fontSize: 14.5 * scale }]}>{step.title}</Text>
                <Text numberOfLines={2} style={[styles.stepDetail, { fontSize: 10.5 * scale, lineHeight: 15 * scale, marginTop: 3 * scale }]}>
                  {step.instructions.replace(`${step.title}. `, '')}
                </Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark ${name.toLowerCase()} step ${step.order}: ${step.title}`} accessibilityState={{ checked: done }} onPress={() => toggleStep(step.id)} style={[styles.stepCheck, { width: 38 * scale, height: 42 * scale }]}>
              {done
                ? <View style={[styles.completedMark, { width: 28 * scale, height: 28 * scale, borderRadius: 15 * scale }]}><Svg width={16 * scale} height={16 * scale} viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 12 5 5L20 6" /></Svg></View>
                : <View style={[styles.emptyMark, { width: 28 * scale, height: 28 * scale, borderRadius: 15 * scale }]} />}
            </Pressable>
          </View>
        );
      }) : <Text style={[styles.sectionMeta, { marginTop: 8 * scale }]}>No {formatPeriod(name)} steps in your saved routine.</Text>}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.content} contentContainerStyle={[styles.scroll, { minHeight: height, paddingBottom: 18 * scale }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, { width: Math.min(width, 520), paddingHorizontal: 20 * scale, paddingTop: Math.max(insets.top, 10 * scale), paddingBottom: 14 * scale }]}>
          <LinearGradient colors={['#0A0A0A', '#0A0A0A', '#0A0A0A']} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.headingRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => router.replace('/')} style={[styles.back, { width: 42 * scale, height: 42 * scale }]}>
              <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.brand, { fontSize: 19 * scale }]}>SkinSnap</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit my routine" onPress={() => router.push('/routine-edit')} style={[styles.editButton, { minHeight: 36 * scale, paddingHorizontal: 12 * scale }]}>
              <Text style={[styles.editText, { fontSize: 10 * scale }]}>Edit</Text>
            </Pressable>
          </View>

          {demoMode
            ? <Text style={[styles.demoNotice, { fontSize: 9 * scale, marginTop: 4 * scale }]}>DEMO ROUTINE · GENERAL EXAMPLE, NOT PERSONALIZED</Text>
            : routine
              ? <Text style={[styles.demoNotice, { fontSize: 9 * scale, marginTop: 4 * scale }]}>{generalRoutine ? 'GENERAL ROUTINE · NOT PERSONALIZED' : customRoutine ? 'YOUR CUSTOM ROUTINE' : 'YOUR SAVED AI-ASSISTED GUIDANCE'} · NON-DIAGNOSTIC</Text>
              : null}
          {customNotice && <Text style={[styles.syncStatus, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 5 * scale }]}>{customNotice}</Text>}
          {safetyNotice && <Text accessibilityRole="alert" style={[styles.safetyNotice, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 5 * scale }]}>{safetyNotice}</Text>}
          {syncStatus.startsWith('Progress could not be saved') && <Text accessibilityRole="alert" style={[styles.syncStatus, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 5 * scale }]}>{syncStatus}</Text>}

          {loading ? (
            <View style={[styles.stateCard, { marginTop: 12 * scale }]}>
              <ActivityIndicator color="#D4B896" />
              <Text style={styles.stateText}>Loading your saved routine…</Text>
            </View>
          ) : error ? (
            <View style={[styles.stateCard, { marginTop: 12 * scale }]}>
              <Text accessibilityRole="header" style={styles.stateTitle}>Routine unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={reload} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Try again</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.scoreCard, { marginTop: 12 * scale, borderRadius: 16 * scale, padding: 15 * scale }]}>
                <View style={[styles.scoreRing, { width: 94 * scale, height: 94 * scale }]}>
                  <Svg width={94 * scale} height={94 * scale} viewBox="0 0 104 104" style={StyleSheet.absoluteFill}>
                    <Circle cx="52" cy="52" r="46" fill="none" stroke="#2A2A2C" strokeWidth="4" />
                    <Circle cx="52" cy="52" r="46" fill="none" stroke="#D4B896" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${ringCircumference}`} strokeDashoffset={ringCircumference * (1 - completionPercent / 100)} transform="rotate(-90 52 52)" />
                  </Svg>
                  <Text style={[styles.scoreValue, { fontSize: 26 * scale }]}>{completionPercent}%</Text>
                  <Text style={[styles.scoreLabel, { fontSize: 8.5 * scale }]}>TODAY</Text>
                </View>
                <View style={styles.scoreCopy}>
                  <Text style={[styles.scoreHeading, { fontSize: 20 * scale, lineHeight: 25 * scale }]}>{completedStepCount} of {allStepIds.length} done</Text>
                  <Text style={[styles.scoreDetail, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 3 * scale }]}>Routine progress · based on your checkmarks today</Text>
                  <View style={[styles.updatedPill, { marginTop: 8 * scale, paddingHorizontal: 10 * scale, paddingVertical: 5 * scale }]}>
                    <Text style={[styles.updatedText, { fontSize: 9 * scale }]}>Updated today</Text>
                  </View>
                </View>
              </View>

              {renderRoutineSection('Morning', '8:00 AM', morningSteps)}
              {renderRoutineSection('Evening', '9:00 PM', eveningSteps)}

              {!!routine?.precautions.length && (
                <View style={[styles.precautionCard, { marginTop: 12 * scale, padding: 12 * scale }]}>
                  <Text style={[styles.precautionTitle, { fontSize: 11 * scale }]}>Guidance and precautions</Text>
                  {routine.precautions.map((precaution, index) => <Text key={`${index}-${precaution}`} style={[styles.precautionText, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 4 * scale }]}>• {precaution}</Text>)}
                </View>
              )}

              <View style={[styles.utilityActions, { marginTop: 12 * scale, gap: 8 * scale }]}>
                <Pressable accessibilityRole="button" onPress={() => { setProgressChanged(true); setChecked([]); setCompletedDays(current => current.filter(day => day !== todayKey)); }} style={[styles.utilityButton, { minHeight: 42 * scale, borderRadius: 14 * scale }]}>
                  <Text style={[styles.utilityText, { fontSize: 11 * scale }]}>Reset today’s checkmarks</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.push('/skin-diary')} style={[styles.utilityButton, { minHeight: 42 * scale, borderRadius: 14 * scale }]}>
                  <Text style={[styles.utilityText, { fontSize: 11 * scale }]}>My Skin Diary</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={[styles.trackButton, { minHeight: 46 * scale, borderRadius: 16 * scale }]}>
                  <Text style={[styles.trackText, { fontSize: 12 * scale }]}>View my progress</Text>
                  <Svg width={18 * scale} height={18 * scale} viewBox="0 0 24 24" fill="none" stroke="#D4B896" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <MainBottomNav active={null} bottomInset={insets.bottom} />

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

function ProductIcon({ category, size }: { category: string; size: number }) {
  const stroke = '#D4B896';
  if (/serum/i.test(category)) {
    return <Svg width={size} height={size} viewBox="0 0 40 48" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 4h10v5H15zM17 9v7h6V9M13 16h14v26H13zM17 22h6M17 27h6" />
    </Svg>;
  }
  if (/sun protection/i.test(category)) {
    return <Svg width={size} height={size} viewBox="0 0 40 48" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 7h24l-3 36H11L8 7ZM11 12h18M13 37h14M20 19v9m-4.5-4.5h9m-8-3.2 6.4 6.4m0-6.4-6.4 6.4" />
    </Svg>;
  }
  if (/moisturizer/i.test(category)) {
    return <Svg width={size} height={size} viewBox="0 0 40 48" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 15h24v25H8zM11 10h18v5H11zM14 7h12v3H14zM12 22h16" />
    </Svg>;
  }
  return <Svg width={size} height={size} viewBox="0 0 40 48" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M13 10h14l3 6-4 27H14l-4-27 3-6ZM16 10V6a4 4 0 0 1 8 0v4M13 18h14M16 35h8" />
  </Svg>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { justifyContent: 'center', alignItems: 'flex-start' },
  brand: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.4 },
  editButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2C', backgroundColor: '#1A1A1C' },
  editText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  demoNotice: { alignSelf: 'center', color: '#D4B896', fontFamily: 'InterSemibold', textAlign: 'center', letterSpacing: 0.55 },
  syncStatus: { color: '#8A8A8A', fontFamily: 'InterRegular', textAlign: 'center' },
  safetyNotice: { color: '#8B9AB5', fontFamily: 'InterMedium', textAlign: 'center' },
  scoreCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  scoreRing: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  scoreLabel: { color: '#8A8A8A', fontFamily: 'InterMedium', marginTop: -2 },
  scoreCopy: { flex: 1, minWidth: 0 },
  scoreHeading: { color: '#FFFFFF', fontFamily: 'InterExtraBold' },
  scoreDetail: { color: '#8B9AB5', fontFamily: 'InterMedium' },
  updatedPill: { alignSelf: 'flex-start', borderRadius: 20, backgroundColor: '#2A2A2C' },
  updatedText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  routineSection: { width: '100%', marginTop: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sectionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.4 },
  sectionMeta: { color: '#8A8A8A', fontFamily: 'InterMedium', textAlign: 'right' },
  stepCard: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  stepDetails: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepCopy: { flex: 1, minWidth: 0 },
  stepTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold' },
  stepDetail: { color: '#8A8A8A', fontFamily: 'InterRegular' },
  stepCheck: { alignItems: 'center', justifyContent: 'center' },
  completedMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#D4B896' },
  emptyMark: { borderWidth: 1.5, borderColor: '#8A8A8A' },
  utilityActions: { width: '100%' },
  utilityButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  utilityText: { color: '#8A8A8A', fontFamily: 'InterMedium' },
  trackButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  trackText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  stateCard: { width: '100%', alignItems: 'center', padding: 22, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2C', backgroundColor: '#1A1A1C' },
  stateTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold', fontSize: 18, textAlign: 'center' },
  stateText: { color: '#8A8A8A', fontFamily: 'InterRegular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryActionText: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 14, textAlign: 'center' },
  precautionCard: { width: '100%', borderWidth: 1, borderColor: '#2A2A2C', borderRadius: 16, backgroundColor: '#1A1A1C' },
  precautionTitle: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  precautionText: { color: '#8B9AB5', fontFamily: 'InterRegular' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0A0A0A' },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '90%', alignSelf: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2C', backgroundColor: '#1A1A1C' },
  modalContent: { padding: 20 },
  modalTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold', fontSize: 19, lineHeight: 27, marginBottom: 8 },
  detailBlock: { marginTop: 8 },
  detailLabel: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 13 },
  detailValue: { color: '#8B9AB5', fontFamily: 'InterRegular', fontSize: 14, lineHeight: 20, marginTop: 2 },
  modalCaution: { color: '#8A8A8A', fontFamily: 'InterRegular', fontSize: 12, lineHeight: 18, marginTop: 14 },
  dismissButton: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  dismissText: { color: '#E8C9A0', fontFamily: 'InterExtraBold', fontSize: 15 },
});
