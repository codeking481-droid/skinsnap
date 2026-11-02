import { useEffect, useState } from 'react';
import { Alert, Animated, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadPreferences, markOnboardingComplete, saveOnboardingSkinType, saveOnboardingStep, type SkinType } from '../preferences';
import { getNextAppFlowRoute, getOnboardingResumeStep } from '../flowLogic';
import { MINIMUM_USER_AGE } from '../privacy';
import { responsiveScale } from '../responsive';

const portrait = require('../../assets/images/upload-sample.webp');
const skinTypes: { value: SkinType; title: string; detail: string; icon: 'shine' | 'drop' | 'mix' | 'heart' | 'balance' | 'question' }[] = [
  { value: 'oily', title: 'Oily', detail: 'Shiny through the day', icon: 'shine' },
  { value: 'dry', title: 'Dry', detail: 'Tight or flaky feeling', icon: 'drop' },
  { value: 'combination', title: 'Combination', detail: 'Oily and dry areas', icon: 'mix' },
  { value: 'sensitive', title: 'Sensitive', detail: 'Easily feels irritated', icon: 'heart' },
  { value: 'normal', title: 'Balanced', detail: 'A little of everything', icon: 'balance' },
  { value: 'unsure', title: 'Not sure', detail: 'Help me figure it out', icon: 'question' },
];

function StepProgress({ step, scale }: { step: 1 | 2 | 3 | 4; scale: number }) {
  return (
    <View accessibilityLabel={`Onboarding, screen ${step} of 4`} style={[styles.progress, { gap: 7 * scale }]}>
      {[1, 2, 3, 4].map((index) => (
        <View key={index} style={[styles.progressTrack, { height: 4 * scale, borderRadius: 4 * scale }]}>
          {index <= step && <LinearGradient colors={['#D4B896', '#E8C9A0']} style={StyleSheet.absoluteFill} />}
        </View>
      ))}
      <Text style={[styles.stepCount, { fontSize: 13 * scale }]}>{step}/4</Text>
    </View>
  );
}

function SkinIcon({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#E8C9A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === 'shine' && <><Circle cx="20" cy="20" r="7" /><Path d="M20 3v5m0 24v5M3 20h5m24 0h5M8 8l4 4m16 16 4 4m0-24-4 4M12 28l-4 4" /></>}
      {name === 'drop' && <Path d="M20 4C16 12 9 18 9 25a11 11 0 0 0 22 0C31 18 24 12 20 4Z" />}
      {name === 'mix' && <><Path d="M20 5v30M9 12h8m6 16h8" /><Circle cx="11" cy="12" r="3" /><Circle cx="29" cy="28" r="3" /></>}
      {name === 'heart' && <Path d="M20 34S5 25 5 14a8 8 0 0 1 15-4 8 8 0 0 1 15 4c0 11-15 20-15 20Z" />}
      {name === 'balance' && <><Path d="M20 6v27M10 34h20M9 13h22M12 13l-6 12h12l-6-12Zm16 0-6 12h12l-6-12Z" /></>}
      {name === 'question' && <><Circle cx="20" cy="20" r="15" /><Path d="M15 15a5 5 0 1 1 8 4c-2 1-3 2-3 5m0 5v.2" /></>}
      {name === 'scan' && <><Path d="M5 14V6h8m14 0h8v8M5 26v8h8m14 0h8v-8M12 19c2-5 14-5 16 0m-16 5c2 5 14 5 16 0" /><Circle cx="20" cy="20" r="2" /></>}
      {name === 'sparkle' && <><Path d="M20 4c-1 9-4 12-13 13 9 1 12 4 13 13 1-9 4-12 13-13-9-1-12-4-13-13Z" /><Path d="M7 5v6m-3-3h6m22 19v6m-3-3h6" /></>}
      {name === 'routine' && <><Path d="M10 7h21M10 20h21M10 33h21" /><Circle cx="5" cy="7" r="1" /><Circle cx="5" cy="20" r="1" /><Circle cx="5" cy="33" r="1" /></>}
      {name === 'lock' && <><Path d="M10 17v-5a10 10 0 0 1 20 0v5M8 17h24v18H8z" /><Circle cx="20" cy="25" r="2" /><Path d="M20 27v3" /></>}
    </Svg>
  );
}

function PrimaryButton({ label, onPress, scale, disabled = false }: { label: string; onPress: () => void; scale: number; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, { minHeight: 56 * scale, borderRadius: 30 * scale, opacity: disabled ? 0.45 : pressed ? 0.86 : 1 }]}>
      <LinearGradient colors={['#E8C9A0', '#D4B896']} style={[StyleSheet.absoluteFill, { borderRadius: 30 * scale }]} />
      <Text style={[styles.primaryLabel, { fontSize: 18 * scale }]}>{label}</Text>
      <Text style={[styles.primaryArrow, { fontSize: 24 * scale }]}>→</Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [ready, setReady] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [under18Selected, setUnder18Selected] = useState(false);
  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [legalInfo, setLegalInfo] = useState<'Terms of Service' | 'Privacy Policy' | null>(null);
  const [opacity] = useState(() => new Animated.Value(1));
  const [offset] = useState(() => new Animated.Value(0));
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(width, 520);
  const scale = responsiveScale(pageWidth);

  useEffect(() => {
    let active = true;
    loadPreferences().then((preferences) => {
      if (!active) return;
      setAgeConfirmed(preferences.ageConfirmed);
      setSkinType(preferences.skinType);
      setStep(getOnboardingResumeStep(preferences.onboardingStep));
      setReady(true);
    }).catch(() => {
      if (!active) return;
      Alert.alert('Could not load onboarding', 'Please restart SkinSnap and try again.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (transitioning) return true;
      if (step > 1) {
        const previousStep = (step - 1) as 1 | 2 | 3;
        setTransitioning(true);
        void saveOnboardingStep(previousStep).then(() => {
          setDirection(-1);
          setStep(previousStep);
        }).catch(() => {
          setTransitioning(false);
          Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
        });
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [ready, step, transitioning]);

  useEffect(() => {
    if (!ready) return;
    opacity.setValue(0.7);
    offset.setValue(direction * 18);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 210, useNativeDriver: true }),
      Animated.spring(offset, { toValue: 0, speed: 22, bounciness: 2, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) setTransitioning(false); });
    return () => animation.stop();
  }, [direction, offset, opacity, ready, step]);

  const goNext = async () => {
    if (transitioning) return;
    if (step === 4 && under18Selected) {
      Alert.alert('18+ age requirement', 'SkinSnap is 18+ for launch. Join waitlist for 16+ version.');
      return;
    }
    if (step === 4 && !ageConfirmed) {
      Alert.alert(`${MINIMUM_USER_AGE}+ age requirement`, `SkinSnap is available only to people aged ${MINIMUM_USER_AGE} or older.`);
      return;
    }
    setTransitioning(true);
    try {
      if (step < 4) {
        const nextStep = (step + 1) as 2 | 3 | 4;
        await saveOnboardingStep(nextStep);
        setDirection(1);
        setStep(nextStep);
        return;
      }
      await markOnboardingComplete(ageConfirmed);
      router.replace(getNextAppFlowRoute('onboarding'));
    } catch {
      setTransitioning(false);
      Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
    }
  };

  const selectSkinType = async (value: SkinType) => {
    setSkinType(value);
    try {
      await saveOnboardingSkinType(value);
    } catch {
      Alert.alert('Could not save your preference', 'Please try selecting your skin type again.');
    }
  };

  const goBack = async () => {
    if (transitioning || step === 1) return;
    const previousStep = (step - 1) as 1 | 2 | 3;
    setTransitioning(true);
    try {
      await saveOnboardingStep(previousStep);
      setDirection(-1);
      setStep(previousStep);
    } catch {
      setTransitioning(false);
      Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
    }
  };

  const continueWithoutSkinType = async () => {
    if (transitioning) return;
    setTransitioning(true);
    try {
      await saveOnboardingStep(3);
      setDirection(1);
      setStep(3);
    } catch {
      setTransitioning(false);
      Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#0A0A0A', '#111111', '#0A0A0A']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: Math.max(height, 700 * scale) }]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.page, { width: pageWidth, paddingTop: Math.max(insets.top, 14 * scale), paddingBottom: Math.max(insets.bottom, 16 * scale), paddingHorizontal: 22 * scale, minHeight: Math.max(height, 700 * scale), opacity, transform: [{ translateX: offset }] }]}>
          {step === 1 && <Image source={portrait} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />}
          <LinearGradient colors={step === 1 ? ['rgba(5,5,5,0.25)', 'rgba(5,5,5,0.14)', 'rgba(5,5,5,0.94)'] : ['rgba(10,10,10,0.9)', 'rgba(10,10,10,0.72)', 'rgba(10,10,10,0.96)']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

          <View style={[styles.header, { minHeight: 35 * scale }]}>
            {step > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Go to previous onboarding screen" onPress={goBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
            ) : <View style={styles.brandSpark}><Text style={styles.sparkText}>✦</Text></View>}
            <Text style={[styles.brand, { fontSize: 18 * scale }]}>SkinSnap</Text>
            <View style={{ flex: 1 }} />
            <StepProgress step={step} scale={scale} />
          </View>

          {step === 1 && (
            <View style={styles.welcomeContent}>
              <View style={[styles.welcomeBadge, { borderRadius: 20 * scale, paddingHorizontal: 13 * scale, paddingVertical: 8 * scale }]}>
                <Text style={[styles.badgeText, { fontSize: 11 * scale }]}>YOUR SKIN, YOUR JOURNEY</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={[styles.welcomeTitle, { fontSize: 48 * scale, lineHeight: 50 * scale }]}>Get to know{'\n'}your <Text style={styles.accent}>glow.</Text></Text>
              <Text style={[styles.welcomeSubtitle, { fontSize: 16 * scale, lineHeight: 23 * scale }]}>Thoughtful skin insights and a routine{'\n'}that starts with what matters to you.</Text>
            </View>
          )}

          {step === 2 && (
            <View style={styles.body}>
              <View style={styles.headingBlock}>
                <Text style={[styles.eyebrow, { fontSize: 11 * scale }]}>A LITTLE ABOUT YOUR SKIN</Text>
                <Text style={[styles.title, { fontSize: 31 * scale, lineHeight: 38 * scale }]}>What is your{'\n'}skin type?</Text>
                <Text style={[styles.subtitle, { fontSize: 15 * scale, lineHeight: 22 * scale }]}>Choose what feels closest. This is optional and self-described.</Text>
              </View>
              <View style={styles.skinGrid}>
                {skinTypes.map((item) => {
                  const selected = skinType === item.value;
                  return (
                    <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${item.title}: ${item.detail}`} onPress={() => { void selectSkinType(item.value); }} style={({ pressed }) => [styles.skinCard, selected && styles.skinCardSelected, { minHeight: 112 * scale, borderRadius: 20 * scale, padding: 13 * scale, opacity: pressed ? 0.84 : 1 }]}>
                      <View style={[styles.skinIcon, { width: 39 * scale, height: 39 * scale, borderRadius: 14 * scale }, selected && styles.skinIconSelected]}><SkinIcon name={item.icon} size={24 * scale} /></View>
                      <View style={{ flex: 1, marginLeft: 10 * scale }}>
                        <Text style={[styles.skinTitle, { fontSize: 15 * scale }, selected && styles.skinTitleSelected]}>{item.title}</Text>
                        <Text style={[styles.skinDetail, { fontSize: 11 * scale, lineHeight: 15 * scale }]}>{item.detail}</Text>
                      </View>
                      {selected && <View style={styles.selectedMark}><Text style={styles.selectedCheck}>✓</Text></View>}
                    </Pressable>
                  );
                })}
              </View>
              <Pressable accessibilityRole="button" onPress={continueWithoutSkinType} style={styles.skipType}>
                <Text style={[styles.skipTypeText, { fontSize: 13 * scale }]}>I’ll decide later</Text>
              </Pressable>
            </View>
          )}

          {step === 3 && (
            <View style={styles.body}>
              <View style={styles.headingBlock}>
                <Text style={[styles.eyebrow, { fontSize: 11 * scale }]}>SIMPLE. PERSONAL. YOURS.</Text>
                <Text style={[styles.title, { fontSize: 30 * scale, lineHeight: 37 * scale }]}>How SkinSnap{'\n'}works</Text>
                <Text style={[styles.subtitle, { fontSize: 15 * scale, lineHeight: 22 * scale }]}>A few thoughtful steps toward a routine that fits.</Text>
              </View>
              <View style={styles.steps}>
                {[
                  { icon: 'scan', title: 'Choose a skin photo', copy: 'Use a clear photo if you want visible-skin observations.' },
                  { icon: 'sparkle', title: 'Review gentle insights', copy: 'With your consent, receive non-medical observations—not a diagnosis.' },
                  { icon: 'routine', title: 'Build a simple routine', copy: 'Use your goals and preferences to guide everyday care.' },
                ].map((item, index) => (
                  <View key={item.title} accessibilityLabel={`${index + 1}. ${item.title}. ${item.copy}`} style={[styles.howCard, { borderRadius: 20 * scale, padding: 16 * scale, minHeight: 108 * scale }]}>
                    <View style={[styles.howIcon, { width: 54 * scale, height: 54 * scale, borderRadius: 27 * scale }, index === 1 && styles.howIconPurple]}><SkinIcon name={item.icon} size={30 * scale} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.howTitle, { fontSize: 16 * scale }]}>{index + 1}. {item.title}</Text>
                      <Text style={[styles.howCopy, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>{item.copy}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={[styles.disclaimer, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>Lighting, camera quality and filters can affect what a photo shows.</Text>
            </View>
          )}

          {step === 4 && (
            <View style={styles.body}>
              <View style={styles.headingBlock}>
                <Text style={[styles.eyebrow, { fontSize: 11 * scale }]}>YOUR CHOICE COMES FIRST</Text>
                <Text style={[styles.title, { fontSize: 31 * scale, lineHeight: 38 * scale }]}>Your skin is{'\n'}personal.</Text>
                <Text style={[styles.subtitle, { fontSize: 15 * scale, lineHeight: 22 * scale }]}>You stay in control of when a photo is shared for analysis.</Text>
              </View>
              <View style={styles.privacyCards}>
                {[
                  { icon: 'lock', title: 'Nothing is analyzed yet', copy: 'You will review the photo and provide consent before any analysis request.' },
                  { icon: 'drop', title: 'Cosmetic, not medical', copy: 'SkinSnap offers general visible-skin observations and is not a substitute for professional care.' },
                  { icon: 'heart', title: 'Your goals guide the experience', copy: 'Skin type and preferences are self-described. SkinSnap does not infer identity from your face.' },
                ].map((item) => (
                  <View key={item.title} accessibilityLabel={`${item.title}. ${item.copy}`} style={[styles.privacyCard, { borderRadius: 18 * scale, padding: 14 * scale, gap: 12 * scale }]}>
                    <View style={[styles.privacyIcon, { width: 42 * scale, height: 42 * scale, borderRadius: 15 * scale }]}><SkinIcon name={item.icon} size={23 * scale} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.privacyTitle, { fontSize: 14 * scale }]}>{item.title}</Text>
                      <Text style={[styles.privacyCopy, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>{item.copy}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Pressable accessibilityRole="checkbox" disabled={under18Selected} accessibilityState={{ checked: ageConfirmed, disabled: under18Selected }} accessibilityLabel={`I confirm that I am ${MINIMUM_USER_AGE} years of age or older`} onPress={() => setAgeConfirmed((confirmed) => !confirmed)} style={[styles.ageConfirmation, { marginTop: 13 * scale, marginBottom: 8 * scale }, under18Selected && { opacity: 0.45 }]}>
                <View style={[styles.ageCheckbox, ageConfirmed && styles.ageCheckboxSelected]}>{ageConfirmed && <Text style={styles.ageCheckmark}>✓</Text>}</View>
                <Text style={[styles.ageConfirmationText, { fontSize: 12 * scale, lineHeight: 17 * scale }]}>I confirm that I am {MINIMUM_USER_AGE} years of age or older.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: under18Selected }}
                onPress={() => {
                  setAgeConfirmed(false);
                  setUnder18Selected(true);
                }}
                style={[styles.under18Choice, { marginBottom: 8 * scale }]}
              >
                <Text style={[styles.under18Text, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>I am under 18</Text>
              </Pressable>
              {under18Selected && <Text accessibilityRole="alert" style={[styles.ageBlockMessage, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>
                SkinSnap is 18+ for launch. Join waitlist for 16+ version.
              </Text>}
              {under18Selected && <Text style={[styles.under18WaitlistNote, { fontSize: 10 * scale, lineHeight: 14 * scale }]}>
                Waitlist sign-up is not available in this build.
              </Text>}
              <View style={styles.legal}>
                <Text style={[styles.legalIntro, { fontSize: 10 * scale }]}>By continuing, you agree to our</Text>
                <View style={styles.legalLinks}>
                  <Pressable accessibilityRole="link" onPress={() => setLegalInfo('Terms of Service')}><Text style={[styles.legalLink, { fontSize: 11 * scale }]}>Terms of Service</Text></Pressable>
                  <Text style={styles.legalIntro}>and</Text>
                  <Pressable accessibilityRole="link" onPress={() => setLegalInfo('Privacy Policy')}><Text style={[styles.legalLink, { fontSize: 11 * scale }]}>Privacy Policy</Text></Pressable>
                </View>
              </View>
            </View>
          )}

          <View pointerEvents="none" style={{ flex: 1, minHeight: 17 * scale }} />
          <PrimaryButton label={step === 4 ? 'Continue' : 'Next'} onPress={() => { void goNext(); }} scale={scale} disabled={transitioning || (step === 2 && !skinType) || (step === 4 && (!ageConfirmed || under18Selected))} />
          {step === 2 && <Text style={[styles.optionalNote, { fontSize: 10 * scale }]}>Optional · You can change this anytime</Text>}
        </Animated.View>
      </ScrollView>
      <Modal visible={!!legalInfo} transparent animationType="fade" onRequestClose={() => setLegalInfo(null)}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>SKINSNAP</Text>
            <Text style={styles.modalTitle}>{legalInfo}</Text>
            <Text style={styles.modalCopy}>{legalInfo === 'Privacy Policy'
              ? 'With your consent, SkinSnap sends your photo for non-diagnostic cosmetic observations. Photos are not analyzed until you make the request and provide consent. Data handling and retention are described in the Privacy section.'
              : 'Terms of Service are a review draft and are not yet effective. Subscription terms and legal notices require review before publication.'}</Text>
            {legalInfo === 'Privacy Policy' && <Pressable accessibilityRole="link" onPress={() => { setLegalInfo(null); router.push('/privacy'); }}><Text style={styles.legalLink}>Read privacy information</Text></Pressable>}
            {legalInfo === 'Terms of Service' && <Pressable accessibilityRole="link" onPress={() => { setLegalInfo(null); router.push('/terms'); }}><Text style={styles.legalLink}>Read service information</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => setLegalInfo(null)} style={styles.modalButton}><Text style={styles.modalButtonText}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, zIndex: 1 },
  brandSpark: { width: 24, alignItems: 'center' },
  sparkText: { color: '#E8C9A0', fontSize: 22 },
  brand: { color: '#F8F5FC', fontFamily: 'InterSemibold', letterSpacing: -0.4 },
  progress: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  progressTrack: { flex: 1, maxWidth: 38, overflow: 'hidden', backgroundColor: 'rgba(232,201,160,0.2)' },
  stepCount: { color: '#B7A893', fontFamily: 'InterMedium', marginLeft: 5 },
  backButton: { width: 27, alignItems: 'flex-start' },
  backText: { color: '#E8C9A0', fontSize: 31, lineHeight: 34 },
  welcomeContent: { flex: 1, paddingBottom: 31 },
  welcomeBadge: { alignSelf: 'flex-start', marginTop: 20, backgroundColor: 'rgba(212,184,150,0.14)', borderWidth: 1, borderColor: 'rgba(232,201,160,0.3)' },
  badgeText: { color: '#E8C9A0', fontFamily: 'InterSemibold', letterSpacing: 0.6 },
  welcomeTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -1.5 },
  accent: { color: '#E8C9A0' },
  welcomeSubtitle: { color: '#D8D2CE', fontFamily: 'InterRegular', marginTop: 12 },
  body: { flex: 1, paddingTop: 38 },
  headingBlock: { marginBottom: 22 },
  eyebrow: { color: '#D4B896', fontFamily: 'InterSemibold', letterSpacing: 1.1, marginBottom: 9 },
  title: { color: '#FFFFFF', fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  subtitle: { color: '#B9B4B5', fontFamily: 'InterRegular', marginTop: 8 },
  skinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skinCard: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  skinCardSelected: { backgroundColor: '#302A21', borderColor: '#D4B896' },
  skinIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(212,184,150,0.12)' },
  skinIconSelected: { backgroundColor: '#54452F' },
  skinTitle: { color: '#F7F4FA', fontFamily: 'InterSemibold', marginBottom: 4 },
  skinTitleSelected: { color: '#F8F2E8' },
  skinDetail: { color: '#AAA2A2', fontFamily: 'InterRegular' },
  selectedMark: { position: 'absolute', right: 9, top: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#D4B896', alignItems: 'center', justifyContent: 'center' },
  selectedCheck: { color: '#FFF', fontSize: 12, fontFamily: 'InterExtraBold' },
  skipType: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  skipTypeText: { color: '#E8C9A0', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  steps: { gap: 12 },
  howCard: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  howIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#302A21', borderWidth: 1, borderColor: '#8A7458' },
  howIconPurple: { backgroundColor: '#302A21', borderColor: '#8A7458' },
  howTitle: { color: '#F8F5FC', fontFamily: 'InterSemibold', marginBottom: 5 },
  howCopy: { color: '#B9B4B5', fontFamily: 'InterRegular' },
  disclaimer: { color: '#918B8B', fontFamily: 'InterRegular', textAlign: 'center', marginTop: 14 },
  privacyCards: { gap: 10 },
  privacyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  privacyIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(212,184,150,0.12)' },
  privacyTitle: { color: '#F7F4FA', fontFamily: 'InterSemibold', marginBottom: 4 },
  privacyCopy: { color: '#B9B4B5', fontFamily: 'InterRegular' },
  ageConfirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  ageCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#8B7960', alignItems: 'center', justifyContent: 'center' },
  ageCheckboxSelected: { backgroundColor: '#E8C9A0', borderColor: '#E8C9A0' },
  ageCheckmark: { color: '#181613', fontFamily: 'InterExtraBold', fontSize: 15, lineHeight: 19 },
  ageConfirmationText: { color: '#D8D2CE', fontFamily: 'InterRegular', flex: 1 },
  under18Choice: { alignSelf: 'flex-start', paddingHorizontal: 2, paddingVertical: 5 },
  under18Text: { color: '#E8C9A0', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  ageBlockMessage: { color: '#F0B6C2', fontFamily: 'InterMedium', textAlign: 'center', marginBottom: 8 },
  under18WaitlistNote: { color: '#AAA2A2', fontFamily: 'InterRegular', textAlign: 'center', marginBottom: 8 },
  legal: { alignItems: 'center', gap: 4 },
  legalIntro: { color: '#A9A3A4', fontFamily: 'InterRegular' },
  legalLinks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legalLink: { color: '#E8C9A0', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  primaryButton: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 24, marginTop: 9 },
  primaryLabel: { color: '#181613', fontFamily: 'InterExtraBold', letterSpacing: -0.25 },
  primaryArrow: { color: '#181613', position: 'absolute', right: 25, top: '50%', marginTop: -17 },
  optionalNote: { color: '#8A8585', textAlign: 'center', marginTop: 8 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalCard: { width: '100%', maxWidth: 380, padding: 26, gap: 15, backgroundColor: '#1A1A1C', borderRadius: 24, borderWidth: 1, borderColor: '#3B3735' },
  modalEyebrow: { color: '#D4B896', fontFamily: 'InterSemibold', fontSize: 12, letterSpacing: 3 },
  modalTitle: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 26 },
  modalCopy: { color: '#C2BCBC', fontFamily: 'InterRegular', fontSize: 15, lineHeight: 22 },
  modalButton: { backgroundColor: '#E8C9A0', borderRadius: 28, padding: 15, alignItems: 'center' },
  modalButtonText: { color: '#181613', fontFamily: 'InterExtraBold', fontSize: 15 },
});
