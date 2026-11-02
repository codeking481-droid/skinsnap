import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { AnalysisPreferences } from '../analysisQuality';
import type { SkinAnalysisResult } from '../services/analysisApi';
import type { CustomRoutine } from '../retention';
import { ANALYSIS_ROUTINE_ROUTE, buildRoutinePreview, noObservationMessage, presentObservation } from '../analysisPresentation';
import { loadCustomRoutine } from '../services/retentionApi';
import { getRoutineProgressOwner } from '../services/userDataApi';
import { loadRoutineProgress } from '../routineStorage';
import { getCreams, getPerfume, PERFUME_VIBES, type PerfumeVibe, type ProductIdea } from '../resultRecommendations';

const INSIGHT_SECTIONS = [
  { category: 'hydration', label: 'Hydration appearance', observationCategories: ['apparent-dryness'] },
  { category: 'texture', label: 'Texture', observationCategories: ['general-texture', 'natural-pores'] },
  { category: 'evenness', label: 'Evenness', observationCategories: ['uneven-looking-tone', 'color-variation'] },
  { category: 'blemishes', label: 'Blemish appearance', observationCategories: ['visible-blemishes'] },
] as const;
const TIER_LABELS = ['Radiant', 'Great', 'Healthy', 'Balanced', 'Needs Care', 'Clear'] as const;
const LIMITED_DETAIL_TITLE = 'Limited detail in this light';
const LIMITED_DETAIL_TIP = 'Try soft window light, no direct sun, fill the oval for a clearer snapshot.';

export function AnalysisReport({
  result,
  photoUri,
  preferences,
  scale,
  onRetake,
}: {
  result: SkinAnalysisResult;
  photoUri: string | null;
  preferences: AnalysisPreferences;
  scale: number;
  onRetake: () => void;
}) {
  const [customRoutine, setCustomRoutine] = useState<CustomRoutine | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<string[]>([]);
  const [routineReady, setRoutineReady] = useState(false);
  const [routineLoadFailed, setRoutineLoadFailed] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState<PerfumeVibe | undefined>();

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

  const observations = useMemo(() => result.observations.map(presentObservation), [result.observations]);
  const allInsightsUnavailable = INSIGHT_SECTIONS.every(section =>
    !result.cosmeticInsights?.some(item => item.category === section.category));
  const creamIdeas = useMemo(() => getCreams(preferences, result.observations), [preferences, result.observations]);
  const perfumeIdeas = useMemo(() => getPerfume(preferences, selectedVibe), [preferences, selectedVibe]);
  const preview = useMemo(() => buildRoutinePreview(result, customRoutine, checkedSteps, new Date().getDay()),
    [checkedSteps, customRoutine, result]);
  const serverPreview = useMemo(() => buildRoutinePreview(result, null, checkedSteps, new Date().getDay()),
    [checkedSteps, result]);
  const routine = preview ?? serverPreview;
  const analyzedAt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(result.createdAt));
  const openProduct = async (product: ProductIdea) => {
    try {
      await Linking.openURL(product.url);
    } catch {
      Alert.alert('Link unavailable', `Could not open ${product.retailer}. Try again later.`);
    }
  };

  return <View style={styles.report}>
    <Text accessibilityRole="header" style={[styles.completed, { fontSize: 10 * scale }]}>ANALYZED {analyzedAt.toUpperCase()} · COSMETIC OBSERVATIONS</Text>
    <View style={[styles.snapshotWrap, { marginTop: 12 * scale, borderRadius: 16 * scale, padding: 14 * scale }]}>
      {photoUri && <Image source={{ uri: photoUri }} style={[styles.photoThumb, { width: 58 * scale, height: 58 * scale, borderRadius: 29 * scale }]} resizeMode="cover" />}
      <View accessibilityLabel={result.imageQuality === 'clear' ? 'Photo quality: clear enough for review' : 'Photo quality: limited'} style={[styles.qualityPill, { borderRadius: 12 * scale, paddingHorizontal: 8 * scale, paddingVertical: 4 * scale, marginTop: photoUri ? 8 * scale : 0 }]}>
        <Text style={[styles.qualityPillText, { fontSize: 9 * scale }]}>{result.imageQuality === 'clear' ? 'CLEAR PHOTO REVIEW' : 'LIMITED PHOTO DETAIL'}</Text>
      </View>
      <Text style={[styles.snapshotTitle, { fontSize: 15 * scale, marginTop: photoUri ? 9 * scale : 0 }]}>Photo review</Text>
      <Text style={[styles.snapshotCaption, { fontSize: 10 * scale, marginTop: 3 * scale }]}>
        {result.imageQuality === 'clear' ? 'Photo detail was sufficient for review' : 'Photo detail was limited'}
      </Text>
    </View>

    <View style={[styles.cosmeticSnapshot, { marginTop: 14 * scale, borderRadius: 16 * scale, padding: 13 * scale }]}>
      <Text style={[styles.sectionTitle, { fontSize: 15 * scale }]}>Your cosmetic snapshot</Text>
      <View style={[styles.insightGrid, { gap: 8 * scale, marginTop: 10 * scale }]}>
        {INSIGHT_SECTIONS.map(section => {
          const insight = result.cosmeticInsights?.find(item => item.category === section.category);
          const supporting = result.observations.filter(item => (section.observationCategories as readonly string[]).includes(item.category));
          return (
            <View key={section.category} style={[styles.insightCard, { borderRadius: 12 * scale, padding: 10 * scale }]}>
              <Text style={[styles.insightLabel, { fontSize: 10 * scale }]}>{section.label}</Text>
              <Text style={[styles.insightTier, { fontSize: 13 * scale, marginTop: 4 * scale }]}>
                {insight?.tier ?? LIMITED_DETAIL_TITLE}
              </Text>
              {insight && <View accessibilityLabel={`${section.label}: reported appearance tier ${insight.tier}`} style={[styles.tierTrack, { marginTop: 8 * scale, height: 5 * scale, borderRadius: 4 * scale }]}>
                {TIER_LABELS.map((level) => (
                  <View key={level} style={[styles.tierDot, { width: `${100 / TIER_LABELS.length - 2}%`, height: 5 * scale, borderRadius: 4 * scale }, level === insight.tier && styles.tierDotActive]} />
                ))}
              </View>}
              {supporting.length > 0 && <Text style={[styles.insightEvidence, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 4 * scale }]}>
                {supporting.map(item => item.observation).join(' ')}
              </Text>}
              {!insight && <Text style={[styles.insightEvidence, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 4 * scale }]}>
                {LIMITED_DETAIL_TIP}
              </Text>}
            </View>
          );
        })}
      </View>
      <View style={[styles.ageEstimate, { marginTop: 10 * scale, borderRadius: 12 * scale, padding: 10 * scale }]}>
        <Text style={[styles.insightLabel, { fontSize: 10 * scale }]}>Estimated skin age</Text>
        <Text style={[styles.insightTier, { fontSize: 15 * scale, marginTop: 3 * scale }]}>
          {result.skinAgeEstimate == null ? 'Not available for this photo' : `${result.skinAgeEstimate.value} · ${result.skinAgeEstimate.label}`}
        </Text>
        <Text style={[styles.insightEvidence, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: 3 * scale }]}>
          Cosmetic appearance estimate only, not your actual age or a measurement.
        </Text>
      </View>
      <Text style={[styles.insightEvidence, { fontSize: 10 * scale, lineHeight: 14 * scale, marginTop: 8 * scale }]}>
        {result.disclaimer}
      </Text>
      {result.limitations?.length ? <View style={[styles.limitations, { marginTop: 10 * scale, borderRadius: 12 * scale, padding: 10 * scale }]}>
        <Text style={[styles.insightLabel, { fontSize: 10 * scale }]}>What may affect this report</Text>
        {result.limitations.map((limitation, index) => <Text key={`${limitation}-${index}`} style={[styles.insightEvidence, { fontSize: 9 * scale, lineHeight: 13 * scale, marginTop: index ? 4 * scale : 5 * scale }]}>• {limitation}</Text>)}
      </View> : null}
    </View>

    <View style={[styles.summaryCard, { borderRadius: 16 * scale, padding: 12 * scale, marginTop: 16 * scale }]}>
      <Text style={[styles.summaryTitle, { fontSize: 13 * scale }]}>Summary</Text>
      <Text style={[styles.summaryText, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 4 * scale }]}>{result.summary}</Text>
    </View>

    {result.imageQuality === 'limited' && (
      <View style={[styles.qualityNotice, { borderRadius: 14 * scale, padding: 12 * scale, marginTop: 12 * scale }]}>
        <Text style={[styles.qualityText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>{noObservationMessage('limited')}</Text>
      </View>
    )}
    {allInsightsUnavailable && (
      <View style={[styles.retakeCard, { borderRadius: 16 * scale, padding: 14 * scale, marginTop: 12 * scale }]}>
        <Text style={[styles.retakeTitle, { fontSize: 13 * scale }]}>Want a clearer snapshot?</Text>
        <Text style={[styles.retakeCopy, { fontSize: 11 * scale, lineHeight: 16 * scale, marginTop: 5 * scale }]}>
          Tips: Soft window light, no direct sun, fill the oval, hold steady.
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetake} style={[styles.retakeButton, { minHeight: 46 * scale, borderRadius: 24 * scale, marginTop: 11 * scale }]}>
          <Text style={[styles.retakeButtonText, { fontSize: 13 * scale }]}>Retake</Text>
        </Pressable>
      </View>
    )}

    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 22 * scale }]}>Visible observations</Text>
    {observations.length ? observations.map((observation, index) => (
      <View key={`${result.observations[index].category}-${index}`} style={[styles.observation, { borderRadius: 16 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
        <Text style={[styles.observationTitle, { fontSize: 13 * scale }]}>{observation.title}</Text>
        {observation.location && <Text style={[styles.meta, { fontSize: 10 * scale, marginTop: 3 * scale }]}>{observation.location}</Text>}
        <Text style={[styles.observationText, { fontSize: 11 * scale, lineHeight: 17 * scale, marginTop: 6 * scale }]}>{observation.observation}</Text>
        {observation.visibility && <Text style={[styles.meta, { fontSize: 10 * scale, marginTop: 6 * scale }]}>{observation.visibility} in this photo</Text>}
        {observation.limitation && <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>{observation.limitation}</Text>}
        {observation.explanation && <Text style={[styles.supporting, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>{observation.explanation}</Text>}
        {observation.suggestion && <Text style={[styles.suggestion, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>{observation.suggestion}</Text>}
      </View>
    )) : (
      <View style={[styles.emptyCard, { borderRadius: 16 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
        <Text style={[styles.summaryText, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>{noObservationMessage(result.imageQuality)}</Text>
      </View>
    )}

    <View style={[styles.routineHeading, { marginTop: 22 * scale }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale }]}>Routine today</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push(ANALYSIS_ROUTINE_ROUTE)} style={styles.routineLink}>
        <Text style={[styles.routineLinkText, { fontSize: 11 * scale }]}>View routine ›</Text>
      </Pressable>
    </View>
    {!routineReady && <Text style={[styles.meta, { fontSize: 10 * scale, marginTop: 8 * scale }]}>Loading saved routine progress…</Text>}
    {routineReady && routineLoadFailed && <Text accessibilityRole="alert" style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 8 * scale }]}>Saved routine progress could not be loaded. Checkmarks may not reflect earlier updates.</Text>}
    {routine && (routine.morning.length > 0 || routine.evening.length > 0) ? (
      <View style={[styles.routineCard, { borderRadius: 16 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
        {([
          { label: 'MORNING', steps: routine.morning },
          { label: 'EVENING', steps: routine.evening },
        ] as const).filter(period => period.steps.length > 0).map(period => (
          <View key={period.label} style={styles.period}>
            <Text style={[styles.periodLabel, { fontSize: 11 * scale }]}>{period.label}</Text>
            {period.steps.map(step => (
              <View key={step.id} style={styles.routineStep}>
                <Text style={[styles.routineCheck, { color: step.completed ? '#E8C9A0' : '#A8A3A5' }]}>{step.completed ? '✓' : '○'}</Text>
                <Text style={[styles.routineStepText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>{step.title}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    ) : (
      <View style={[styles.emptyCard, { borderRadius: 16 * scale, padding: 12 * scale, marginTop: 10 * scale }]}>
        <Text style={[styles.summaryText, { fontSize: 11 * scale, lineHeight: 17 * scale }]}>No routine guidance was returned for this scan. You can still build a routine from the Routine tab.</Text>
      </View>
    )}

    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 22 * scale }]}>
      {result.observations.length ? 'Common picks for this observation in the UK' : 'Common UK routine picks'}
    </Text>
    <View style={[styles.productList, { gap: 8 * scale, marginTop: 10 * scale }]}>
      {creamIdeas.map(product => (
        <ProductIdeaCard key={product.name} product={product} scale={scale} onPress={() => void openProduct(product)} />
      ))}
    </View>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 18 * scale, marginTop: 22 * scale }]}>Vibe matcher</Text>
    {!perfumeIdeas.length && preferences.fragranceFree === 'prefer' ? (
      <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 8 * scale }]}>You prefer fragrance-free suggestions, so no fragrance ideas are shown.</Text>
    ) : (
      <>
        <Text style={[styles.meta, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 6 * scale }]}>Pick today’s mood for a style idea to pair with your routine. This is not a skin-based match.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose today's fragrance vibe" style={[styles.vibeChoices, { gap: 7 * scale, marginTop: 9 * scale }]}>
          {PERFUME_VIBES.map(vibe => (
            <Pressable
              key={vibe}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedVibe === vibe }}
              onPress={() => setSelectedVibe(vibe)}
              style={[styles.vibeChoice, { borderRadius: 18 * scale, paddingHorizontal: 12 * scale, minHeight: 34 * scale }, selectedVibe === vibe && styles.vibeChoiceSelected]}
            >
              <Text style={[styles.vibeText, { fontSize: 10 * scale }, selectedVibe === vibe && styles.vibeTextSelected]}>{vibe}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.productList, { gap: 8 * scale, marginTop: 10 * scale }]}>
          {perfumeIdeas.map(product => (
            <ProductIdeaCard key={product.name} product={product} scale={scale} onPress={() => void openProduct(product)} />
          ))}
        </View>
      </>
    )}

    <View style={[styles.actions, { marginTop: 18 * scale, gap: 8 * scale }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/skin-diary')} style={[styles.primaryAction, { minHeight: 50 * scale, borderRadius: 25 * scale }]}>
        <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.primaryFill}>
          <Text style={[styles.primaryText, { fontSize: 14 * scale }]}>Add to diary</Text>
        </LinearGradient>
      </Pressable>
      <View style={styles.secondaryRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push(ANALYSIS_ROUTINE_ROUTE)} style={[styles.secondaryAction, { minHeight: 46 * scale, borderRadius: 23 * scale }]}>
          <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>View routine</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void openProduct(creamIdeas[0])} style={[styles.secondaryAction, { minHeight: 46 * scale, borderRadius: 23 * scale }]}>
          <Text style={[styles.secondaryText, { fontSize: 12 * scale }]}>Shop a product</Text>
        </Pressable>
      </View>
    </View>

    <Text style={[styles.disclaimer, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 14 * scale }]}>Lighting, camera quality and filters can affect the observations. Tiers and any age estimate are cosmetic tracking only, not a medical diagnosis. Skin-age estimates are not measurements of your actual age.</Text>
  </View>;
}

function ProductIdeaCard({ product, scale, onPress }: { product: ProductIdea; scale: number; onPress: () => void }) {
  return <View style={[styles.productCard, { borderRadius: 15 * scale, padding: 13 * scale }]}>
    <Text style={[styles.observationTitle, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>{product.name}</Text>
    <Text style={[styles.supporting, { fontSize: 10 * scale, lineHeight: 15 * scale, marginTop: 4 * scale }]}>{product.reason}</Text>
    <View style={[styles.productFooter, { marginTop: 8 * scale }]}>
      <Text style={[styles.meta, { fontSize: 9 * scale }]}>{product.priceLabel}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel={`Check ${product.name} at ${product.retailer}`} onPress={onPress} hitSlop={8}>
      <Text style={[styles.productLink, { fontSize: 10 * scale }]}>{product.retailer === 'Boots' ? 'See current price at Boots ›' : `View at ${product.retailer} ›`}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  report: { alignItems: 'center' },
  completed: { color: '#E8C9A0', fontFamily: 'InterExtraBold', letterSpacing: 0.8, textAlign: 'center' },
  snapshotWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderColor: 'rgba(232,201,160,0.35)', borderWidth: 1, backgroundColor: '#151515' },
  photoThumb: { overflow: 'hidden', borderColor: '#E8C9A0', borderWidth: 1.5 },
  qualityPill: { backgroundColor: 'rgba(232,201,160,0.14)', borderWidth: 1, borderColor: 'rgba(232,201,160,0.32)' },
  qualityPillText: { color: '#E8C9A0', fontFamily: 'InterExtraBold', letterSpacing: 0.6 },
  snapshotTitle: { color: '#FFF', fontFamily: 'InterExtraBold', textAlign: 'center' },
  snapshotCaption: { color: '#AFAFAF', fontFamily: 'InterRegular', textAlign: 'center' },
  cosmeticSnapshot: { width: '100%', backgroundColor: '#17151B', borderColor: '#40364E', borderWidth: 1 },
  insightGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap' },
  insightCard: { width: '48.5%', minHeight: 82, backgroundColor: '#211D27', borderWidth: 1, borderColor: '#39313F' },
  insightLabel: { color: '#C4B4D8', fontFamily: 'InterSemibold' },
  insightTier: { color: '#E8DDF4', fontFamily: 'InterExtraBold' },
  insightEvidence: { color: '#B9B2BD', fontFamily: 'InterRegular' },
  tierTrack: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#39313F', overflow: 'hidden' },
  tierDot: { backgroundColor: '#39313F' },
  tierDotActive: { backgroundColor: '#B18BE4' },
  ageEstimate: { backgroundColor: '#211D27', borderWidth: 1, borderColor: '#39313F' },
  limitations: { backgroundColor: '#1C1921', borderWidth: 1, borderColor: '#39313F' },
  summaryCard: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  summaryTitle: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  summaryText: { color: '#D1D1D1', fontFamily: 'InterRegular' },
  sectionTitle: { color: '#FFF', fontFamily: 'InterExtraBold', alignSelf: 'stretch' },
  qualityNotice: { width: '100%', backgroundColor: 'rgba(69,43,24,0.78)', borderWidth: 1, borderColor: '#A76A40' },
  qualityText: { color: '#FFE1C2', fontFamily: 'InterMedium' },
  retakeCard: { width: '100%', backgroundColor: '#21172B', borderWidth: 1, borderColor: '#72519A' },
  retakeTitle: { color: '#F1E6FF', fontFamily: 'InterExtraBold' },
  retakeCopy: { color: '#D9C7EE', fontFamily: 'InterRegular' },
  retakeButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#8D58D6' },
  retakeButtonText: { color: '#FFFFFF', fontFamily: 'InterExtraBold' },
  observation: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  observationTitle: { color: '#FFF', fontFamily: 'InterSemibold', flex: 1 },
  observationText: { color: '#D0D0D0', fontFamily: 'InterRegular' },
  meta: { color: '#AFAFAF', fontFamily: 'InterRegular' },
  supporting: { color: '#C7C7C7', fontFamily: 'InterRegular' },
  suggestion: { color: '#E8C9A0', fontFamily: 'InterMedium' },
  emptyCard: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  productList: { width: '100%' },
  productCard: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  productFooter: { alignItems: 'flex-start', gap: 7 },
  productLink: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  vibeChoices: { width: '100%', flexDirection: 'row', flexWrap: 'wrap' },
  vibeChoice: { justifyContent: 'center', borderWidth: 1, borderColor: '#4A414F', backgroundColor: '#1A1A1C' },
  vibeChoiceSelected: { borderColor: '#B18BE4', backgroundColor: 'rgba(151, 105, 213, 0.2)' },
  vibeText: { color: '#C7C1CA', fontFamily: 'InterMedium' },
  vibeTextSelected: { color: '#E1CFFF', fontFamily: 'InterSemibold' },
  routineHeading: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  routineLink: { justifyContent: 'center', paddingHorizontal: 7 },
  routineLinkText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  routineCard: { width: '100%', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C', gap: 12 },
  period: { gap: 7 },
  periodLabel: { color: '#E8C9A0', fontFamily: 'InterExtraBold', letterSpacing: 0.7 },
  routineStep: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  routineCheck: { width: 18, fontSize: 15, textAlign: 'center' },
  routineStepText: { flex: 1, color: '#E6DDE6', fontFamily: 'InterRegular' },
  disclaimer: { color: '#B9AFBD', fontFamily: 'InterRegular', textAlign: 'center' },
  actions: { width: '100%', gap: 8 },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondaryAction: { flex: 1, borderWidth: 1, borderColor: '#3B3734', backgroundColor: '#1A1A1C', justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  primaryAction: { overflow: 'hidden', borderColor: '#E8C9A0', borderWidth: 0.7, width: '100%' },
  primaryFill: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 50 },
  primaryText: { color: '#181613', fontFamily: 'InterExtraBold' },
});
