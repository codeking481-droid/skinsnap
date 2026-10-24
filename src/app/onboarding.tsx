import { useEffect, useState } from 'react';
import { Alert, Animated, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowButton } from '../components/GlowButton';
import { LaunchSplash } from '../components/LaunchSplash';
import { loadPreferences, markOnboardingComplete, saveOnboardingStep } from '../preferences';
import { getOnboardingResumeStep } from '../flowLogic';
import { MINIMUM_USER_AGE } from '../privacy';

const portrait = require('../../assets/images/welcome-portrait.png');
const inclusivity = require('../../assets/images/skin-tone-strip.png');

const concerns = [
  { icon: 'sparkles', label: 'Acne &\nbreakouts' },
  { icon: 'sun', label: 'Dark spots &\nhyperpigmentation' },
  { icon: 'waves', label: 'Uneven\ntone' },
  { icon: 'dots', label: 'Texture &\npores' },
] as const;

function Progress({ step, scale }: { step: 1 | 2 | 3; scale: number }) {
  return (
      <View accessibilityLabel={`Onboarding, screen ${step} of 3`} style={[styles.progress, { gap: 8 * scale, marginTop: 13 * scale }]}>
      {[0, 1, 2].map((part) => (
        <View key={part} style={{ flex: 1, height: 12 * scale, borderRadius: 4 * scale, overflow: 'hidden', backgroundColor: '#262933' }}>
          {part < step && <LinearGradient colors={['#FF7FAE', '#FF6799']} style={StyleSheet.absoluteFill} />}
        </View>
      ))}
      <Text style={[styles.stepCount, { fontSize: 16 * scale, lineHeight: 22 * scale }]}>{step}/3</Text>
    </View>
  );
}

function ConcernIcon({ icon, size }: { icon: string; size: number }) {
  const common = { stroke: '#FF78A4', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" {...common}>
      {icon === 'sparkles' && <><Path d="M17 4c-1 8-4 11-12 12 8 1 11 4 12 12 1-8 4-11 12-12-8-1-11-4-12-12Z" /><Path d="M31 24c-.6 4.5-2.2 6.1-6.5 6.8 4.3.7 5.9 2.3 6.5 6.8.7-4.5 2.3-6.1 6.5-6.8-4.2-.7-5.8-2.3-6.5-6.8Z" /><Path d="M6 30c-.3 2.2-1.1 3-3.2 3.3 2.1.4 2.9 1.2 3.2 3.4.4-2.2 1.2-3 3.3-3.4C7.2 33 6.4 32.2 6 30Z" /></>}
      {icon === 'sun' && <><Circle cx="20" cy="20" r="7" fill="#FF78A4" />{Array.from({ length: 8 }, (_, i) => <Path key={i} d="M20 3v4" transform={`rotate(${i * 45} 20 20)`} />)}</>}
      {icon === 'waves' && <><Path d="M5 12c5-7 10 7 15 0s10 7 15 0M5 21c5-7 10 7 15 0s10 7 15 0M5 30c5-7 10 7 15 0s10 7 15 0" /></>}
      {icon === 'dots' && <>{Array.from({ length: 9 }, (_, i) => <Circle key={i} cx={10 + (i % 3) * 10} cy={10 + Math.floor(i / 3) * 10} r="2" fill="#FF78A4" stroke="none" />)}</>}
    </Svg>
  );
}

function PhotoCards({ scale, showFour = false }: { scale: number; showFour?: boolean }) {
  return (
    <View style={[styles.photoStage, { height: (showFour ? 234 : 204) * scale, marginTop: (showFour ? 16 : 13) * scale }]}>
      {showFour ? (
        <View style={[styles.fourPhotoStage, { height: 224 * scale }]}>
          {[0, 1, 2, 3].map((person) => {
            const width = 104 * scale;
            const x = person * 81 * scale;
            return <View key={person} style={[styles.fourPhotoCard, { width, height: 213 * scale, left: x, borderRadius: 22 * scale, zIndex: person === 1 ? 5 : person === 2 ? 4 : 3, transform: [{ rotate: `${[-7, -2, 2, 7][person]}deg` }] }]}>
              <Image source={inclusivity} resizeMode="cover" style={[styles.fourPhotoImage, { width: width * 4, transform: [{ translateX: -person * width }] }]} accessible={false} />
            </View>;
          })}
        </View>
      ) : (
        <>
          <View style={[styles.sidePhoto, styles.leftPhoto, { width: 115 * scale, height: 174 * scale, borderRadius: 21 * scale, left: 3 * scale, transform: [{ rotate: '-8deg' }] }]}><Image source={portrait} resizeMode="cover" style={[styles.cardImage, { transform: [{ scale: 1.23 }, { translateX: 8 * scale }, { translateY: 2 * scale }] }]} /></View>
          <View style={[styles.sidePhoto, styles.rightPhoto, { width: 115 * scale, height: 174 * scale, borderRadius: 21 * scale, right: 3 * scale, transform: [{ rotate: '8deg' }] }]}><Image source={portrait} resizeMode="cover" style={[styles.cardImage, { transform: [{ scale: 1.24 }, { translateX: -8 * scale }, { translateY: 8 * scale }] }]} /></View>
          <View style={[styles.centerPhoto, { width: 166 * scale, height: 198 * scale, borderRadius: 26 * scale }]}><Image source={portrait} resizeMode="cover" style={styles.cardImage} /></View>
        </>
      )}
    </View>
  );
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ready, setReady] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const [legalInfo, setLegalInfo] = useState<'Terms of Service' | 'Privacy Policy' | null>(null);
  const [contentOpacity] = useState(() => new Animated.Value(1));
  const [contentOffset] = useState(() => new Animated.Value(0));
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(width, 520);
  const scale = Math.max(1, Math.min(pageWidth / 393, 1.08));
  useEffect(() => {
    let active = true;
    loadPreferences().then((preferences) => {
      if (!active) return;
      setAgeConfirmed(preferences.ageConfirmed);
      if (preferences.onboardingComplete && preferences.ageConfirmed) {
        setStep(1);
      } else if (preferences.onboardingComplete) {
        setStep(3);
      } else {
        setStep(getOnboardingResumeStep(preferences.onboardingStep));
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (transitioning) return true;
      if (step > 1) {
        const previousStep = (step - 1) as 1 | 2;
        setTransitioning(true);
        void saveOnboardingStep(previousStep).then(() => {
          setTransitionDirection(-1);
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
    contentOpacity.setValue(0.72);
    contentOffset.setValue(transitionDirection * 22);
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 230,
        useNativeDriver: true,
      }),
      Animated.spring(contentOffset, {
        toValue: 0,
        speed: 22,
        bounciness: 2,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setTransitioning(false);
    });
    return () => animation.stop();
  }, [contentOffset, contentOpacity, ready, step, transitionDirection]);
  const goNext = async () => {
    if (transitioning) return;
    if (step === 3 && !ageConfirmed) {
      Alert.alert(`${MINIMUM_USER_AGE}+ age requirement`, `SkinSnap is available only to people aged ${MINIMUM_USER_AGE} or older.`);
      return;
    }
    setTransitioning(true);
    try {
      if (step < 3) {
        const nextStep = (step + 1) as 2 | 3;
        await saveOnboardingStep(nextStep);
        setTransitionDirection(1);
        setStep(nextStep);
        return;
      }
      await markOnboardingComplete(ageConfirmed);
      router.replace('/upload');
    } catch {
      setTransitioning(false);
      Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
    }
  };
  const skipToPrivacy = async () => {
    if (transitioning || step === 3) return;
    setTransitioning(true);
    try {
      await saveOnboardingStep(3);
      setTransitionDirection(1);
      setStep(3);
    } catch {
      setTransitioning(false);
      Alert.alert('Could not save your progress', 'Please check your device storage and try again.');
    }
  };

  if (!ready) return <LaunchSplash />;
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { minHeight: Math.max(height, 698 * scale) }]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.page, { width: pageWidth, paddingHorizontal: 20 * scale, paddingTop: Math.max(insets.top, 12 * scale), paddingBottom: Math.max(insets.bottom, 17 * scale), opacity: contentOpacity, transform: [{ translateX: contentOffset }] }]}>
          {step === 1 && <Image source={portrait} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />}
          {step === 2 && <Image source={inclusivity} style={[StyleSheet.absoluteFill, styles.inclusivityBackdrop]} resizeMode="cover" accessible={false} />}
          <LinearGradient colors={step === 3 ? ['#0D080F', '#050509', '#08060B'] : ['rgba(0,0,0,0.34)', 'rgba(0,0,0,0.80)', '#030305']} locations={[0, 0.38, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Progress step={step} scale={scale} />

          {step === 1 ? (
            <>
              <View style={{ marginTop: 23 * scale }}>
                <Text style={[styles.heading, { fontSize: 40 * scale, lineHeight: 38 * scale, letterSpacing: -1.45 * scale }]}>Skincare made{'\n'}for <Text style={styles.accent}>your skin.</Text></Text>
                <Text style={[styles.subtitle, { fontSize: 18 * scale, lineHeight: 22 * scale, marginTop: 8 * scale }]}>Explore skincare habits and{ '\n' }build a routine at your pace.</Text>
              </View>
              <PhotoCards scale={scale} />
              <View style={[styles.featureCards, { gap: 8 * scale, marginTop: 4 * scale }]}>
                <FeatureCard icon="scan" title="Photo-based insights" detail="Real results require your consent and verified premium access." scale={scale} />
                <FeatureCard icon="leaf" title="Build a gentle routine" detail="Personalised guidance follows a completed analysis." scale={scale} />
                <FeatureCard icon="chart" title="Track your progress" detail="Routine completion can be tracked on this device." scale={scale} />
              </View>
            </>
          ) : step === 2 ? (
            <>
              <View style={[styles.titleCenter, { marginTop: 34 * scale }]}>
                <Text style={[styles.heading, styles.center, { fontSize: 39 * scale, lineHeight: 38 * scale, letterSpacing: -1.3 * scale }]}>Designed with{'\n'}every <Text style={styles.accent}>skin tone.</Text></Text>
                <Text style={[styles.subtitle, styles.center, { fontSize: 17 * scale, lineHeight: 21 * scale, marginTop: 8 * scale }]}>Choose your own skincare goals.{ '\n' }SkinSnap does not infer identity from a face.</Text>
              </View>
              <PhotoCards scale={scale} showFour />
              <View style={[styles.concerns, { marginTop: 13 * scale }]}>
                {concerns.map((item) => <View key={item.icon} style={styles.concern}>
                  <View style={[styles.roundIcon, { width: 47 * scale, height: 47 * scale, borderRadius: 24 * scale }]}><ConcernIcon icon={item.icon} size={25 * scale} /></View>
                  <Text style={[styles.concernText, { fontSize: 12 * scale, lineHeight: 14 * scale }]}>{item.label}</Text>
                </View>)}
              </View>
            </>
          ) : (
            <View style={[styles.privacyContent, { marginTop: 44 * scale, gap: 10 * scale }]}>
              <Image source={portrait} resizeMode="cover" style={[styles.privacyPortrait, { width: 248 * scale, height: 470 * scale, right: -20 * scale, top: 12 * scale }]} accessible={false} />
              <LinearGradient pointerEvents="none" colors={['rgba(5,5,8,0.12)', 'rgba(5,5,8,0.04)', 'rgba(5,5,8,0.52)']} style={[styles.privacyPortraitShade, { right: -22 * scale, top: 12 * scale, width: 250 * scale, height: 470 * scale }]} />
              <View style={{ minHeight: 120 * scale, justifyContent: 'center' }}>
                <Text style={[styles.heading, { fontSize: 38 * scale, lineHeight: 38 * scale, letterSpacing: -1.2 * scale }]}>Your privacy{'\n'}comes <Text style={styles.accent}>first.</Text></Text>
                <Text style={[styles.subtitle, { fontSize: 16 * scale, lineHeight: 21 * scale, marginTop: 8 * scale }]}>Your photo stays local until{'\n'}you choose an analysis.</Text>
              </View>
              <View style={[styles.privacyCards, { gap: 9 * scale }]}>
                <PrivacyCard icon="lock" title="Your choice comes first" detail="The preview keeps your selected photo on this device." scale={scale} />
                <PrivacyCard icon="trash" title="Photo handling" detail="A prepared copy is removed after processing when cleanup succeeds. Provider retention follows provider terms." scale={scale} />
                <PrivacyCard icon="shield" title="Clear processing choices" detail="Groq receives the photo for visual observations and text for routine guidance. Analysis results may be saved to your account." scale={scale} />
              </View>
            </View>
          )}

          <View style={{ flex: 1, minHeight: 13 * scale }} />
          {step === 3 ? (
            <>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ageConfirmed }}
                accessibilityLabel={`I confirm that I am ${MINIMUM_USER_AGE} years of age or older`}
                onPress={() => setAgeConfirmed((confirmed) => !confirmed)}
                style={[styles.ageConfirmation, { marginBottom: 12 * scale }]}
              >
                <View style={[styles.ageCheckbox, ageConfirmed && styles.ageCheckboxSelected]}>
                  {ageConfirmed && <Text style={styles.ageCheckmark}>✓</Text>}
                </View>
                <Text style={[styles.ageConfirmationText, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>
                  I confirm that I am {MINIMUM_USER_AGE} years of age or older.
                </Text>
              </Pressable>
              <GlowButton scale={scale} label="Continue" accessibilityLabel="Continue to photo selection" onPress={goNext} />
              <View style={[styles.legal, { marginTop: 13 * scale }]}>
                <Text style={[styles.legalIntro, { fontSize: 10 * scale }]}>By continuing, you agree to our</Text>
                <View style={[styles.legalLinks, { gap: 12 * scale, marginTop: 4 * scale }]}>
                  <Pressable accessibilityRole="link" onPress={() => setLegalInfo('Terms of Service')}><Text style={[styles.legalLink, { fontSize: 11 * scale }]}>Terms of Service</Text></Pressable>
                  <Text style={[styles.legalIntro, { fontSize: 10 * scale }]}>and</Text>
                  <Pressable accessibilityRole="link" onPress={() => setLegalInfo('Privacy Policy')}><Text style={[styles.legalLink, { fontSize: 11 * scale }]}>Privacy Policy</Text></Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <GlowButton scale={scale} label="Next" accessibilityLabel="Next onboarding screen" onPress={goNext} />
              <Pressable accessibilityRole="button" disabled={transitioning} onPress={skipToPrivacy} style={styles.skipButton}>
                <Text style={[styles.skipText, { fontSize: 12 * scale, paddingVertical: 10 * scale }]}>Skip to privacy</Text>
              </Pressable>
              <View style={[styles.dots, { gap: 12 * scale, marginTop: 13 * scale }]} accessibilityLabel={`Page ${step} of 3`}>
                {[0, 1, 2].map((index) => <View key={index} style={[styles.dot, { width: 10 * scale, height: 10 * scale, borderRadius: 6 * scale, backgroundColor: index === step - 1 ? '#FF729F' : '#363A44' }]} />)}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
      <Modal visible={!!legalInfo} transparent animationType="fade" onRequestClose={() => setLegalInfo(null)}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>SKINSNAP</Text>
            <Text style={styles.modalTitle}>{legalInfo}</Text>
            <Text style={styles.modalCopy}>{legalInfo === 'Privacy Policy'
              ? 'With your consent, SkinSnap sends your photo to its secure service and Groq for cosmetic observations. Groq then receives text observations and any optional preferences to prepare a routine. Structured results are saved to your account. Provider retention follows its terms and account settings.'
              : 'Terms of Service are a review draft and are not yet effective. Subscription terms and legal notices require review before publication.'}</Text>
            {legalInfo === 'Privacy Policy' && (
              <Pressable accessibilityRole="link" onPress={() => { setLegalInfo(null); router.push('/privacy'); }}>
                <Text style={styles.legalLink}>Read privacy information</Text>
              </Pressable>
            )}
              {legalInfo === 'Terms of Service' && <Pressable accessibilityRole="link" onPress={() => { setLegalInfo(null); router.push('/terms'); }}><Text style={styles.legalLink}>Read service information</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => setLegalInfo(null)} style={styles.modalButton}><Text style={styles.modalButtonText}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FeatureCard({ icon, title, detail, scale }: { icon: 'scan' | 'leaf' | 'chart'; title: string; detail: string; scale: number }) {
  return (
    <View style={[styles.featureCard, { minHeight: 54 * scale, borderRadius: 14 * scale, paddingHorizontal: 14 * scale, gap: 14 * scale }]}>
      <LinearGradient colors={['rgba(105,38,62,0.68)', 'rgba(45,21,31,0.8)']} style={[styles.featureIcon, { width: 44 * scale, height: 43 * scale, borderRadius: 12 * scale }]}>
        {icon === 'scan' ? <ConcernIcon icon="sparkles" size={26 * scale} /> : icon === 'leaf' ? <Svg width={27 * scale} height={27 * scale} viewBox="0 0 40 40" fill="none" stroke="#FF78A4" strokeWidth={2.8} strokeLinecap="round"><Path d="M20 36C9 36 4 29 4 19c9 0 14 5 16 15Zm0 0c11 0 16-7 16-17-9 0-14 5-16 15Zm-5-14c-4-7 0-13 5-19 5 6 9 12 5 19M20 36V23" /></Svg> : <ConcernIcon icon="waves" size={26 * scale} />}
      </LinearGradient>
      <View style={{ flex: 1, gap: 2 * scale }}>
        <Text style={[styles.cardTitle, { fontSize: 15 * scale, lineHeight: 18 * scale }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.cardDetail, { fontSize: 11.5 * scale, lineHeight: 14 * scale }]} numberOfLines={2}>{detail}</Text>
      </View>
      <Text style={{ color: '#D5D9E3', fontSize: 23 * scale }}>›</Text>
    </View>
  );
}

function PrivacyCard({ icon, title, detail, scale }: { icon: 'lock' | 'trash' | 'shield'; title: string; detail: string; scale: number }) {
  return (
    <View style={[styles.privacyCard, { width: 215 * scale, minHeight: 86 * scale, borderRadius: 17 * scale, padding: 11 * scale, gap: 12 * scale }]}>
      <LinearGradient colors={['rgba(106,35,62,0.82)', 'rgba(49,22,34,0.94)']} style={[styles.privacyIcon, { width: 50 * scale, height: 50 * scale, borderRadius: 13 * scale }]}>
        <Svg width={30 * scale} height={30 * scale} viewBox="0 0 40 40" fill="none" stroke="#FF78A4" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          {icon === 'lock' && <><Path d="M10 17v-5a10 10 0 0 1 20 0v5" /><Path d="M7 17h26v19H7z" fill="#FF78A4" /><Circle cx="20" cy="25" r="2" fill="#170B11" stroke="#170B11" /><Path d="M20 27v4" stroke="#170B11" /></>}
          {icon === 'trash' && <><Path d="M6 11h28M15 11V6h10v5M10 11l2 24h16l2-24M17 17v12m6-12v12" /></>}
          {icon === 'shield' && <><Path d="M20 3 34 9v11c0 9-6 14-14 18C12 34 6 29 6 20V9l14-6Z" /><Path d="m13 20 5 5 10-11" /></>}
        </Svg>
      </LinearGradient>
      <View style={{ flex: 1, justifyContent: 'center', gap: 4 * scale }}>
        <Text style={[styles.cardTitle, { fontSize: 11.5 * scale, lineHeight: 15 * scale }]}>{title}</Text>
        <Text style={[styles.cardDetail, { fontSize: 10.3 * scale, lineHeight: 14 * scale }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050609' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, overflow: 'hidden', backgroundColor: '#030305' },
  progress: { flexDirection: 'row', alignItems: 'center' },
  stepCount: { color: '#D7D9E2', fontFamily: 'InterRegular', marginLeft: 4 },
  heading: { color: '#F9F9FC', fontFamily: 'InterExtraBold' },
  accent: { color: '#FF6698' },
  subtitle: { color: '#C8CAD4', fontFamily: 'InterRegular' },
  center: { textAlign: 'center' },
  titleCenter: { alignItems: 'center' },
  photoStage: { width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  inclusivityBackdrop: { opacity: 0.22, transform: [{ scale: 1.12 }] },
  sidePhoto: { position: 'absolute', overflow: 'hidden', borderColor: '#FF5E8E', borderWidth: 1.1 },
  leftPhoto: { zIndex: 1 },
  rightPhoto: { zIndex: 1 },
  centerPhoto: { zIndex: 2, overflow: 'hidden', borderWidth: 1.2, borderColor: '#FF6C9B', boxShadow: '0px 0px 21px 1px rgba(255, 64, 129, 0.4)' },
  cardImage: { width: '100%', height: '100%' },
  fourPhotoStage: { width: '100%', position: 'relative', alignItems: 'center' },
  fourPhotoCard: { position: 'absolute', top: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#FC5888' },
  fourPhotoImage: { height: '100%', position: 'absolute', left: 0, top: 0 },
  featureCards: { gap: 8 },
  featureCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,17,22,0.86)', borderColor: 'rgba(83,84,100,0.38)', borderWidth: 1, overflow: 'hidden' },
  featureIcon: { justifyContent: 'center', alignItems: 'center', borderColor: '#AC385D', borderWidth: 0.8 },
  cardTitle: { color: '#F7F7FA', fontFamily: 'InterSemibold' },
  cardDetail: { color: '#BFC1CC', fontFamily: 'InterRegular' },
  concerns: { flexDirection: 'row', justifyContent: 'space-between', gap: 3 },
  concern: { flex: 1, alignItems: 'center', gap: 7 },
  roundIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(53,26,39,0.65)', borderColor: '#AC385D', borderWidth: 0.8 },
  concernText: { textAlign: 'center', color: '#E5E4EA', fontFamily: 'InterMedium' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  privacyContent: { flex: 1, position: 'relative' },
  privacyPortrait: { position: 'absolute', opacity: 0.86 },
  privacyPortraitShade: { position: 'absolute' },
  privacyCards: { alignItems: 'flex-start' },
  privacyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13,13,18,0.79)', borderColor: 'rgba(109,80,95,0.3)', borderWidth: 0.8 },
  privacyIcon: { justifyContent: 'center', alignItems: 'center', borderWidth: 0.8, borderColor: '#A42E54' },
  legal: { alignItems: 'center', paddingBottom: 7 },
  ageConfirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  ageCheckbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#9F778B', alignItems: 'center', justifyContent: 'center' },
  ageCheckboxSelected: { backgroundColor: '#FF8FB2', borderColor: '#FF8FB2' },
  ageCheckmark: { color: '#12070C', fontFamily: 'InterExtraBold', fontSize: 15, lineHeight: 19 },
  ageConfirmationText: { color: '#E7DCE4', fontFamily: 'InterRegular', flex: 1 },
  skipButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  skipText: { color: '#C7C4CE', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  legalIntro: { color: '#BFC1CC', fontFamily: 'InterRegular' },
  legalLinks: { flexDirection: 'row', alignItems: 'center' },
  legalLink: { color: '#FF73A0', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  dot: {},
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.8)' },
  modalCard: { width: '100%', maxWidth: 380, padding: 26, gap: 15, backgroundColor: '#181016', borderRadius: 24, borderWidth: 1, borderColor: '#773049' },
  modalEyebrow: { color: '#FF668B', fontFamily: 'InterSemibold', fontSize: 12, letterSpacing: 3 },
  modalTitle: { color: '#FFF', fontFamily: 'InterExtraBold', fontSize: 26 },
  modalCopy: { color: '#BDBBC5', fontFamily: 'InterRegular', fontSize: 15, lineHeight: 22 },
  modalButton: { backgroundColor: '#FF668B', borderRadius: 28, padding: 15, alignItems: 'center' },
  modalButtonText: { color: '#08090D', fontFamily: 'InterExtraBold', fontSize: 15 },
});
