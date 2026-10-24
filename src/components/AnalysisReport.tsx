import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import type { AnalysisPreferences } from '../analysisQuality';
import type { SkinAnalysisResult } from '../services/analysisApi';
import type { CustomRoutine } from '../retention';
import { ANALYSIS_ROUTINE_ROUTE, buildRoutinePreview, buildSkinFocus, noObservationMessage, presentObservation, shouldAnimateSnapshot } from '../analysisPresentation';
import { loadCustomRoutine } from '../services/retentionApi';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadRoutineProgress } from '../routineStorage';

const AnimatedView = Animated.View;

export function AnalysisReport({
  result,
  photoUri,
  preferences,
  scale,
}: {
  result: SkinAnalysisResult;
  photoUri: string | null;
  preferences: AnalysisPreferences;
  scale: number;
}) {
  const [customRoutine, setCustomRoutine] = useState<CustomRoutine | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<string[]>([]);
  const [routineReady, setRoutineReady] = useState(false);
  const [routineLoadFailed, setRoutineLoadFailed] = useState(false);
  const ringOpacity = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [owner, custom] = await Promise.all([
          getRoutineProgressOwner(),
          loadCustomRoutine(),
        ]);
        const currentRoutineId = custom ? `custom-${custom.sourceResultId ?? 'manual'}` : result.resultId;
        const progress = await loadRoutineProgress(owner ?? undefined, currentRoutineId);
        if (!active) return;
        setCustomRoutine(custom);
        setCheckedSteps(progress.checkedSteps);
      } catch {
        if (active) {
          setRoutineLoadFailed(true);
          setCustomRoutine(null);
          setCheckedSteps([]);
        }
      } finally {
        if (active) setRoutineReady(true);
      }
    })();
    return () => { active = false; };
  }, [result.resultId]);

  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | null = null;
    const applyMotionPreference = (reduced: boolean) => {
      if (!active) return;
      animation?.stop();
      ringOpacity.setValue(reduced ? 1 : 0.35);
      if (shouldAnimateSnapshot(reduced)) {
        animation = Animated.timing(ringOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
        animation.start();
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(applyMotionPreference);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', applyMotionPreference);
    return () => {
      active = false;
      animation?.stop();
      subscription.remove();
    };
  }, [ringOpacity]);

  const focus = useMemo(() => buildSkinFocus(preferences, result.observations), [preferences, result.observations]);
  const observations = useMemo(() => result.observations.map(presentObservation), [result.observations]);
  const preview = useMemo(() => buildRoutinePreview(result, customRoutine, checkedSteps, new Date().getDay()),
    [checkedSteps, customRoutine, result]);
  const circleSize = 204 * scale;

  return <View style={styles.report}>
    <Text accessibilityRole="header" style={[styles.completed, { fontSize: 10 * scale }]}>ANALYSIS COMPLETE · COSMETIC OBSERVATIONS</Text>
    <View accessibilityRole="summary" accessibilityLabel={`Skin snapshot. ${result.summary}`} style={[styles.snapshotWrap, { width: circleSize, height: circleSize, marginTop: 14 * scale }]}>
      <LinearGradient colors={['rgba(255,108,155,0.24)', 'rgba(75,30,57,0.12)', 'rgba(10,7,13,0.95)']} style={StyleSheet.absoluteFill} />
      <AnimatedView pointerEvents="none" style={[styles.ringLayer, { opacity: ringOpacity }]}>
        <Svg width={circleSize} height={circleSize} viewBox="0 0 204 204" accessible={false}>
          <Circle cx="102" cy="102" r="94" fill="none" stroke="#FF76A2" strokeOpacity="0.85" strokeWidth="1.5" />
          <Circle cx="102" cy="102" r="87" fill="none" stroke="#FFB2CA" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 6" />
        </Svg>
      </AnimatedView>
      <View style={styles.snapshotCore}>
        {photoUri
          ? <View accessible={false} style={[styles.photoThumb, { width: 54 * scale, height: 54 * scale, borderRadius: 28 * scale }]}>
            <Animated.Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
          : <Text accessible={false} style={[styles.snapshotGlyph, { fontSize: 24 * scale }]}>✦</Text>}
        <Text style={[styles.snapshotTitle, { fontSize: 16 * scale, marginTop: 8 * scale }]}>Skin Snapshot</Text>
        <Text style={[styles.snapshotCaption, { fontSize: 10 * scale, marginTop: 4 * scale }]}>Your photo, thoughtfully reviewed</Text>
      </View>
    </View>

    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 21 * scale }]}>Your overview</Text>
    <Text style={[styles.summary, { fontSize: 13 * scale, lineHeight: 20 * scale, marginTop: 7 * scale }]}>{result.summary}</Text>
    {result.imageQuality === 'limited' && <View accessibilityRole="alert" style={[styles.qualityNotice, { borderRadius: 14 * scale, padding: 12 * scale, marginTop: 11 * scale }]}>
      <Text style={[styles.qualityText, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>{result.imageAssessment?.guidance ?? 'Photo detail was limited, so this review may miss features. A steady, evenly lit photo may provide more detail.'}</Text>
    </View>}

    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 21 * scale, marginBottom: 9 * scale }]}>Visible observations</Text>
    {observations.length
      ? observations.map((observation, index) => <View key={`${observation.title}-${index}`} style={[styles.observation, { borderRadius: 16 * scale, padding: 14 * scale, marginBottom: 8 * scale }]}>
        <View style={styles.observationHeading}>
          <View style={[styles.observationGlyph, { width: 30 * scale, height: 30 * scale, borderRadius: 16 * scale }]}><Text style={[styles.glyph, { fontSize: 14 * scale }]}>✦</Text></View>
          <Text accessibilityRole="header" style={[styles.observationTitle, { fontSize: 14 * scale }]}>{observation.title}</Text>
          {observation.visibility && <Text style={[styles.visibility, { fontSize: 9 * scale }]}>{observation.visibility === 'clearly-visible' ? 'Visible' : 'Possible'}</Text>}
        </View>
        <Text style={[styles.observationText, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 8 * scale }]}>{observation.observation}</Text>
        {observation.location && <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>Visible area: {observation.location}</Text>}
        {observation.explanation && <Text style={[styles.supporting, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 7 * scale }]}>{observation.explanation}</Text>}
        {observation.suggestion && <Text style={[styles.suggestion, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 7 * scale }]}>A gentle next step: {observation.suggestion}</Text>}
        {observation.limitation && <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>Keep in mind: {observation.limitation}</Text>}
      </View>)
      : <View style={[styles.emptyCard, { borderRadius: 15 * scale, padding: 14 * scale }]}>
        <Text style={[styles.observationText, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>{noObservationMessage(result.imageQuality)}</Text>
      </View>}

    {result.limitations?.length ? <View style={[styles.qualityNotice, { borderRadius: 14 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
      <Text style={[styles.observationTitle, { fontSize: 13 * scale }]}>What this photo cannot tell us</Text>
      {result.limitations.map((limitation, index) => <Text key={`${index}-${limitation}`} style={[styles.qualityText, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 6 * scale }]}>{limitation}</Text>)}
    </View> : null}

    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 21 * scale }]}>Your Skin Focus</Text>
    <View style={[styles.focusCard, { borderRadius: 16 * scale, padding: 14 * scale, marginTop: 8 * scale }]}>
      {focus.length
        ? <View style={styles.focusList}>{focus.map(item => <View key={`${item.source}-${item.label}`} style={[styles.focusChip, { borderRadius: 14 * scale }]}>
          <Text style={[styles.focusText, { fontSize: 11 * scale }]}>{item.label}</Text>
        </View>)}</View>
        : <Text style={[styles.observationText, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>
          {result.observations.length
            ? 'Your observations above are the supported focus for this photo.'
            : 'Simple, consistent daily care is a useful general focus. This photo did not support more specific observations.'}
        </Text>}
    </View>

    <View style={styles.routineHeading}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 21 * scale }]}>Today’s Routine</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your full routine" onPress={() => router.push(ANALYSIS_ROUTINE_ROUTE)} style={[styles.routineLink, { minHeight: 44 * scale }]}>
        <Text style={[styles.routineLinkText, { fontSize: 11 * scale }]}>Open routine ›</Text>
      </Pressable>
    </View>
    <View style={[styles.routineCard, { borderRadius: 16 * scale, padding: 14 * scale, marginTop: 6 * scale }]}>
      {!routineReady
        ? <Text style={[styles.meta, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>Loading your saved routine preview…</Text>
        : routineLoadFailed
          ? <Text style={[styles.meta, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>Your saved routine could not be loaded. Reconnect and open Your Routine to check your current steps.</Text>
          : !preview
          ? <Text style={[styles.meta, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>Routine guidance is not available for this analysis yet. Open Your Routine to view saved guidance.</Text>
          : (['morning', 'evening'] as const).map(period => <View key={period} style={styles.period}>
            <Text style={[styles.periodLabel, { fontSize: 11 * scale }]}>{period === 'morning' ? 'MORNING' : 'EVENING'}</Text>
            {preview[period].length
              ? preview[period].map(step => <View key={step.id} style={styles.routineStep}>
                <Text style={[styles.routineCheck, { color: step.completed ? '#FF8DB0' : '#827986' }]}>{step.completed ? '✓' : '○'}</Text>
                <Text style={[styles.routineStepText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>{step.title}</Text>
                <Text style={[styles.meta, { fontSize: 9 * scale }]}>{step.completed ? 'Done' : 'Upcoming'}</Text>
              </View>)
              : <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale }]}>No steps scheduled.</Text>}
          </View>)}
    </View>

    <Text style={[styles.disclaimer, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 15 * scale }]}>
      Lighting, camera quality and filters can affect observations. This cosmetic overview is not a medical diagnosis or a substitute for professional care.
    </Text>
    <View style={[styles.actions, { marginTop: 12 * scale }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/details')} style={[styles.secondaryAction, { minHeight: 48 * scale, borderRadius: 24 * scale }]}>
        <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Detailed insights</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push(ANALYSIS_ROUTINE_ROUTE)} style={[styles.primaryAction, { minHeight: 50 * scale, borderRadius: 25 * scale }]}>
        <LinearGradient colors={['#FFB0C4', '#FF6C9B', '#FF4E88']} style={styles.primaryFill}>
          <Text style={[styles.primaryText, { fontSize: 14 * scale }]}>Open my full routine</Text>
        </LinearGradient>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  report: { alignItems: 'center' },
  completed: { color: '#FF9FBD', fontFamily: 'InterExtraBold', letterSpacing: 0.8, textAlign: 'center' },
  snapshotWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 120, overflow: 'hidden', borderColor: 'rgba(255,135,174,0.35)', borderWidth: 1 },
  ringLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  snapshotCore: { alignItems: 'center', justifyContent: 'center', width: '76%' },
  snapshotGlyph: { color: '#FF98B8', textShadowColor: '#FF4F90', textShadowRadius: 15 },
  photoThumb: { overflow: 'hidden', borderColor: '#FF88AE', borderWidth: 1.5 },
  snapshotTitle: { color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center' },
  snapshotCaption: { color: '#D7C6D0', fontFamily: 'InterRegular', textAlign: 'center' },
  sectionTitle: { color: '#FFF', fontFamily: 'InterExtraBold', alignSelf: 'stretch' },
  summary: { color: '#E2D9E1', fontFamily: 'InterRegular', alignSelf: 'stretch' },
  qualityNotice: { width: '100%', backgroundColor: 'rgba(69,43,24,0.78)', borderWidth: 1, borderColor: '#A76A40' },
  qualityText: { color: '#FFE1C2', fontFamily: 'InterMedium' },
  observation: { width: '100%', backgroundColor: 'rgba(17,15,21,0.96)', borderWidth: 1, borderColor: '#49323D' },
  observationHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  observationGlyph: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,105,154,0.12)', borderWidth: 1, borderColor: 'rgba(255,145,179,0.3)' },
  glyph: { color: '#FF93B5' },
  observationTitle: { color: '#FFF', fontFamily: 'InterSemibold', flex: 1 },
  visibility: { color: '#FFAAC3', fontFamily: 'InterMedium' },
  observationText: { color: '#DCD2DD', fontFamily: 'InterRegular' },
  meta: { color: '#BBAFBC', fontFamily: 'InterRegular' },
  supporting: { color: '#D0C3CF', fontFamily: 'InterRegular' },
  suggestion: { color: '#FFD2E0', fontFamily: 'InterMedium' },
  emptyCard: { width: '100%', backgroundColor: 'rgba(17,15,21,0.96)', borderWidth: 1, borderColor: '#49323D' },
  focusCard: { width: '100%', backgroundColor: 'rgba(44,24,37,0.78)', borderWidth: 1, borderColor: '#71425A' },
  focusList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusChip: { borderWidth: 1, borderColor: 'rgba(255,140,177,0.32)', backgroundColor: 'rgba(255,110,158,0.1)', paddingHorizontal: 11, paddingVertical: 8 },
  focusText: { color: '#FFD9E5', fontFamily: 'InterMedium' },
  routineHeading: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  routineLink: { justifyContent: 'center', paddingHorizontal: 7 },
  routineLinkText: { color: '#FF9FBD', fontFamily: 'InterSemibold' },
  routineCard: { width: '100%', backgroundColor: 'rgba(17,15,21,0.96)', borderWidth: 1, borderColor: '#49323D', gap: 12 },
  period: { gap: 7 },
  periodLabel: { color: '#FF9FBD', fontFamily: 'InterExtraBold', letterSpacing: 0.7 },
  routineStep: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  routineCheck: { width: 18, fontSize: 15, textAlign: 'center' },
  routineStepText: { flex: 1, color: '#E6DDE6', fontFamily: 'InterRegular' },
  disclaimer: { color: '#B9AFBD', fontFamily: 'InterRegular', textAlign: 'center' },
  actions: { width: '100%', gap: 8 },
  secondaryAction: { borderWidth: 1, borderColor: '#79506A', backgroundColor: '#291827', justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: '#FFD0DF', fontFamily: 'InterSemibold' },
  primaryAction: { overflow: 'hidden', borderColor: '#FFA3BF', borderWidth: 0.7 },
  primaryFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: '#11070C', fontFamily: 'InterExtraBold' },
});
