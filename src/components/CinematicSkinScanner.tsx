import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CinematicSkinScannerProps = {
  photoUri: string | null;
  developmentTestMode: boolean;
  onBack: () => void;
  onPhotoError: () => void;
};

const SPARK_POSITIONS = [
  { left: '18%', top: '22%' },
  { left: '76%', top: '18%' },
  { left: '88%', top: '68%' },
  { left: '24%', top: '83%' },
] as const;

function SparkParticle({
  size,
  delay,
  duration,
  position,
  paused,
}: {
  size: number;
  delay: number;
  duration: number;
  position: (typeof SPARK_POSITIONS)[number];
  paused: boolean;
}) {
  const opacity = useSharedValue(0.2);
  const drift = useSharedValue(0);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: drift.get() }, { scale: 0.72 + opacity.get() * 0.48 }],
  }));

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(drift);
    if (paused) {
      opacity.set(0.35);
      drift.set(0);
      return;
    }
    opacity.set(withDelay(
      delay,
      withRepeat(withSequence(
        withTiming(0.95, { duration: duration * 0.42, easing: Easing.out(Easing.quad) }),
        withTiming(0.12, { duration: duration * 0.58, easing: Easing.in(Easing.quad) }),
      ), -1, false),
    ));
    drift.set(withDelay(
      delay,
      withRepeat(withSequence(
        withTiming(-8, { duration: duration * 0.5, easing: Easing.inOut(Easing.sin) }),
        withTiming(2, { duration: duration * 0.5, easing: Easing.inOut(Easing.sin) }),
      ), -1, false),
    ));
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(drift);
    };
  }, [delay, duration, drift, opacity, paused]);

  return (
    <Animated.View pointerEvents="none" style={[styles.spark, position, pulseStyle, { width: size, height: size }]}>
      <View style={[styles.sparkCore, { width: size, height: size, borderRadius: size / 2 }]} />
      <View style={[styles.sparkTrail, { width: Math.max(2, size * 0.58), height: size * 2.8, borderRadius: size, left: size / 2 - Math.max(2, size * 0.58) / 2, top: size * 0.45 }]} />
    </Animated.View>
  );
}

function StageIcon({ stage }: { stage: number }) {
  const common = { fill: 'none' as const, stroke: '#C76B8C', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (stage === 0) {
    return <Svg width={22} height={22} viewBox="0 0 24 24"><Path {...common} d="M4 8h3l1.5-2h7L17 8h3v10H4z" /><Circle {...common} cx="12" cy="13" r="3.2" /></Svg>;
  }
  if (stage === 1) {
    return <Svg width={22} height={22} viewBox="0 0 24 24"><Circle {...common} cx="10.5" cy="10.5" r="6.5" /><Path {...common} d="m15.5 15.5 5 5" /></Svg>;
  }
  if (stage === 2) {
    return <Svg width={22} height={22} viewBox="0 0 24 24"><Path {...common} d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></Svg>;
  }
  return <Svg width={22} height={22} viewBox="0 0 24 24"><Path {...common} d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7" /></Svg>;
}

function ProgressTrack({ paused }: { paused: boolean }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * trackWidth * 1.38 - trackWidth * 0.38 }],
  }));

  useEffect(() => {
    cancelAnimation(progress);
    if (paused) {
      progress.set(0.25);
      return;
    }
    progress.set(withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    ));
    return () => cancelAnimation(progress);
  }, [paused, progress]);

  const measureTrack = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);
  return (
    <View onLayout={measureTrack} style={styles.progressTrack}>
      <Animated.View style={[styles.progressGlow, animatedStyle]} />
    </View>
  );
}

export function CinematicSkinScanner({
  photoUri,
  developmentTestMode,
  onBack,
  onPhotoError,
}: CinematicSkinScannerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const systemReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(systemReducedMotion);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const rotation = useSharedValue(0);
  const reverseRotation = useSharedValue(0);
  const breathing = useSharedValue(0);
  const laser = useSharedValue(0);
  const paused = reducedMotion || !appActive;
  const scannerSize = Math.max(240, Math.min(width - 54, height * 0.36, 370));
  const faceSize = scannerSize * 0.66;
  const contentWidth = Math.min(width, 520);
  const scale = Math.min(1, width / 393);

  const rotationStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const reverseRotationStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${reverseRotation.get()}deg` }] }));
  const breathingStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + breathing.get() * 0.16,
    transform: [{ scale: 0.94 + breathing.get() * 0.08 }],
  }));
  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: laser.get() * faceSize }],
  }));

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(reverseRotation);
    cancelAnimation(breathing);
    cancelAnimation(laser);
    if (paused) {
      rotation.set(0);
      reverseRotation.set(0);
      breathing.set(0);
      laser.set(0.5);
      return;
    }
    rotation.set(withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false));
    reverseRotation.set(withRepeat(withTiming(-360, { duration: 31000, easing: Easing.linear }), -1, false));
    breathing.set(withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.sin) }), -1, true));
    laser.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(reverseRotation);
      cancelAnimation(breathing);
      cancelAnimation(laser);
    };
  }, [breathing, laser, paused, reverseRotation, rotation]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#080509', '#10070D', '#050509']} locations={[0, 0.44, 1]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { minHeight: height, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 20) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, { width: contentWidth, paddingHorizontal: 24 * scale }]}>
          <View style={styles.navigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to photo"
              hitSlop={12}
              onPress={onBack}
              style={styles.navButton}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
            <Text style={styles.navLabel}>SKINSNAP AI</Text>
            <View style={styles.navButton} />
          </View>

          <Text style={[styles.heading, { fontSize: 35 * scale, lineHeight: 39 * scale }]}>
            Analysing{'\n'}
            <Text style={styles.headingPink}>Your Skin</Text>
          </Text>
          <Text style={[styles.subtitle, { fontSize: 13.5 * scale, lineHeight: 20 * scale }]}>
            Your photo is being processed securely for cautious, non-diagnostic insights.
          </Text>

          <View style={[styles.scannerStage, { width: scannerSize, height: scannerSize, marginTop: 14 * scale }]}>
            <Animated.View
              pointerEvents="none"
              style={[styles.atmosphere, { width: scannerSize * 1.18, height: scannerSize * 1.18, borderRadius: scannerSize }, breathingStyle]}
            />
            <Svg width={scannerSize} height={scannerSize} viewBox="0 0 300 300" style={StyleSheet.absoluteFill}>
              <Circle cx="150" cy="150" r="139" fill="none" stroke="#64243D" strokeWidth="1" />
              <Circle cx="150" cy="150" r="124" fill="none" stroke="#4B1C30" strokeWidth="1" />
              <Circle cx="150" cy="150" r="111" fill="none" stroke="#9B3E60" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="1 6" />
              {Array.from({ length: 64 }, (_, index) => (
                <Path
                  key={index}
                  d={index % 4 === 0 ? 'M150 9v9' : 'M150 11v5'}
                  transform={`rotate(${index * 5.625} 150 150)`}
                  stroke={index % 4 === 0 ? '#FF8DB1' : '#A34768'}
                  strokeOpacity={index % 4 === 0 ? 0.8 : 0.42}
                  strokeWidth={index % 4 === 0 ? 1 : 0.7}
                />
              ))}
              <Path d="M24 150a126 126 0 0 1 30-80M246 230a126 126 0 0 1-24 26" fill="none" stroke="#FF729F" strokeOpacity="0.55" strokeWidth="1" />
            </Svg>

            <Animated.View pointerEvents="none" style={[styles.rotatingRing, { width: scannerSize, height: scannerSize }, rotationStyle]}>
              <Svg width="100%" height="100%" viewBox="0 0 300 300">
                <Circle cx="150" cy="150" r="132" fill="none" stroke="#FF548D" strokeOpacity="0.16" strokeWidth="8" strokeDasharray="210 620" strokeLinecap="round" />
                <Circle cx="150" cy="150" r="132" fill="none" stroke="#FF8FB3" strokeOpacity="0.96" strokeWidth="3" strokeDasharray="210 620" strokeLinecap="round" />
                <Circle cx="150" cy="150" r="132" fill="none" stroke="#FFD0DE" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="210 620" strokeLinecap="round" />
              </Svg>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.rotatingRing, { width: scannerSize * 0.94, height: scannerSize * 0.94 }, reverseRotationStyle]}>
              <Svg width="100%" height="100%" viewBox="0 0 300 300">
                <Circle cx="150" cy="150" r="139" fill="none" stroke="#FF4080" strokeOpacity="0.2" strokeWidth="7" strokeDasharray="116 758" strokeLinecap="round" />
                <Circle cx="150" cy="150" r="139" fill="none" stroke="#FF6F9D" strokeOpacity="0.95" strokeWidth="2.7" strokeDasharray="116 758" strokeLinecap="round" />
                <Circle cx="150" cy="150" r="139" fill="none" stroke="#F39AB7" strokeOpacity="0.8" strokeWidth="2.7" strokeDasharray="78 796" strokeDashoffset="-394" strokeLinecap="round" />
              </Svg>
            </Animated.View>

            <Animated.View pointerEvents="none" style={[styles.sparkOrbit, { width: scannerSize, height: scannerSize }, rotationStyle]}>
              {SPARK_POSITIONS.map((position, index) => (
                <SparkParticle
                  key={`spark-a-${index}`}
                  position={position}
                  size={index % 2 === 0 ? 4 : 3}
                  delay={index * 310}
                  duration={1450 + index * 190}
                  paused={paused}
                />
              ))}
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.sparkOrbit, { width: scannerSize * 0.9, height: scannerSize * 0.9 }, reverseRotationStyle]}>
              {SPARK_POSITIONS.slice(0, 3).map((position, index) => (
                <SparkParticle
                  key={`spark-b-${index}`}
                  position={position}
                  size={index === 1 ? 4 : 2.5}
                  delay={540 + index * 420}
                  duration={1950 + index * 170}
                  paused={paused}
                />
              ))}
            </Animated.View>

            <View style={[styles.faceFrame, { width: faceSize, height: faceSize, borderRadius: faceSize / 2 }]}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={styles.faceImage} resizeMode="cover" onError={onPhotoError} accessible accessibilityLabel="Your selected selfie being processed" />
                : <View style={[styles.faceImage, styles.noPhoto]}><Text style={styles.noPhotoText}>Photo unavailable</Text></View>}
              <Svg width="100%" height="100%" viewBox="0 0 200 200" style={StyleSheet.absoluteFill} pointerEvents="none">
                <Rect x="0" y="0" width="200" height="200" fill="transparent" />
                {Array.from({ length: 9 }, (_, index) => (
                  <Path key={`grid-v-${index}`} d={`M${20 + index * 20} 0v200`} stroke="#FFD6E3" strokeOpacity="0.08" strokeWidth="0.6" />
                ))}
                {Array.from({ length: 9 }, (_, index) => (
                  <Path key={`grid-h-${index}`} d={`M0 ${20 + index * 20}h200`} stroke="#FFD6E3" strokeOpacity="0.08" strokeWidth="0.6" />
                ))}
              </Svg>
              {!paused && <Animated.View pointerEvents="none" style={[styles.laser, { height: faceSize * 0.92 }, laserStyle]} />}
              <LinearGradient colors={['rgba(255,190,211,0.08)', 'transparent', 'rgba(9,4,9,0.18)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
            </View>
          </View>

          <View style={[styles.statusCard, { marginTop: 11 * scale, padding: 16 * scale }]}>
            <Text style={[styles.statusTitle, { fontSize: 19 * scale }]}>Securely processing your photo</Text>
            <Text style={[styles.statusDescription, { fontSize: 12 * scale, lineHeight: 18 * scale, marginTop: 4 * scale }]}>
              {developmentTestMode
                ? 'Restricted development analysis · no purchase is made'
                : 'Preparing your personalised skincare insights'}
            </Text>
            <ProgressTrack paused={paused} />
          </View>

          <View style={[styles.stages, { marginTop: 17 * scale }]}>
            {[
              ['Photo', 'uploaded'],
              ['Analysing', 'skin'],
              ['Generating', 'routine'],
              ['Finalising', 'results'],
            ].map((label, index) => (
              <View key={label.join('-')} style={styles.stageItem}>
                <View style={styles.stageRow}>
                  {index < 3 && <View style={styles.stageConnector} />}
                  <View style={styles.stageIcon}><StageIcon stage={index} /></View>
                </View>
                <Text style={styles.stageLabel}>{label[0]}</Text>
                <Text style={styles.stageLabel}>{label[1]}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.tipCard, { marginTop: 16 * scale, padding: 13 * scale }]}>
            <View style={styles.tipIcon}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4 12.7c.6.4 1 1 1 1.8h6c0-.8.4-1.4 1-1.8A7 7 0 0 0 12 2Z" fill="none" stroke="#FF8BAE" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M12 5v2m-4 1 1.2 1.2m5.6 0L16 8" fill="none" stroke="#FF8BAE" strokeWidth="1.4" strokeLinecap="round" />
              </Svg>
            </View>
            <View style={styles.tipCopy}>
              <Text style={styles.tipTitle}>A note about your scan</Text>
              <Text style={styles.tipDescription}>Lighting and camera quality can affect visible features. These insights are cosmetic guidance, not a medical diagnosis.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050509' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, alignItems: 'center', paddingBottom: 8 },
  navigation: { width: '100%', height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navLabel: { color: '#BDA8B3', fontFamily: 'InterSemibold', fontSize: 10, letterSpacing: 2 },
  heading: { marginTop: 6, color: '#FFF9FC', fontFamily: 'InterExtraBold', textAlign: 'center', letterSpacing: -1.1 },
  headingPink: { color: '#FF82A8' },
  subtitle: { maxWidth: 350, marginTop: 4, color: '#C7BFC7', fontFamily: 'InterRegular', textAlign: 'center' },
  scannerStage: { alignItems: 'center', justifyContent: 'center' },
  atmosphere: { position: 'absolute', backgroundColor: '#731A40', shadowColor: '#F7387A', shadowOpacity: 0.58, shadowRadius: 46, elevation: 12 },
  rotatingRing: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkOrbit: { position: 'absolute' },
  spark: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkCore: { position: 'absolute', backgroundColor: '#FFE4ED', shadowColor: '#FF4B88', shadowOpacity: 1, shadowRadius: 8, elevation: 5 },
  sparkTrail: { position: 'absolute', backgroundColor: 'rgba(255,91,143,0.3)' },
  faceFrame: { overflow: 'hidden', borderWidth: 2, borderColor: '#FFA0BB', backgroundColor: '#24131C', shadowColor: '#FF6097', shadowOpacity: 0.55, shadowRadius: 12, elevation: 8 },
  faceImage: { width: '100%', height: '100%' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: '#E1C5D0', fontFamily: 'InterMedium', fontSize: 12 },
  laser: { position: 'absolute', left: 0, top: '4%', width: 2, backgroundColor: '#FFE3EC', shadowColor: '#FF4F8B', shadowOpacity: 1, shadowRadius: 12, elevation: 8 },
  statusCard: { width: '100%', maxWidth: 440, overflow: 'hidden', borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,117,159,0.23)', backgroundColor: 'rgba(19,12,18,0.91)' },
  statusTitle: { color: '#FFF8FB', fontFamily: 'InterExtraBold', textAlign: 'center' },
  statusDescription: { color: '#C4B8C2', fontFamily: 'InterRegular', textAlign: 'center' },
  progressTrack: { width: '100%', height: 9, overflow: 'hidden', marginTop: 13, borderRadius: 8, backgroundColor: '#281B25' },
  progressGlow: { width: '38%', height: '100%', borderRadius: 8, backgroundColor: '#FF72A0', shadowColor: '#FF5D91', shadowOpacity: 0.9, shadowRadius: 8, elevation: 4 },
  stages: { width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stageItem: { flex: 1, alignItems: 'center' },
  stageRow: { width: '100%', height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stageIcon: { zIndex: 1, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.4, borderColor: 'rgba(211,139,165,0.42)', backgroundColor: 'rgba(25,17,23,0.92)' },
  stageConnector: { position: 'absolute', left: '73%', right: '-27%', height: 1, backgroundColor: 'rgba(193,104,139,0.35)' },
  stageLabel: { color: '#C7BAC3', fontFamily: 'InterRegular', fontSize: 10.5, lineHeight: 14, textAlign: 'center' },
  tipCard: { width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(172,86,119,0.35)', backgroundColor: 'rgba(18,12,17,0.86)' },
  tipIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,101,146,0.42)', backgroundColor: 'rgba(90,29,52,0.5)' },
  tipCopy: { flex: 1 },
  tipTitle: { color: '#FF8DAF', fontFamily: 'InterExtraBold', fontSize: 12 },
  tipDescription: { marginTop: 3, color: '#BEB2BC', fontFamily: 'InterRegular', fontSize: 10.5, lineHeight: 15 },
});
