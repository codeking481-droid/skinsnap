import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PARTICLES = Array.from({ length: 116 }, (_, index) => {
  return {
    x: 12 + ((index * 73) % 336),
    y: 75 + ((index * 97) % 345),
    radius: index % 11 === 0 ? 2.5 : index % 4 === 0 ? 1.8 : 1.1,
    opacity: 0.4 + ((index * 19) % 60) / 100,
    color: index % 3 === 0 ? '#D4B896' : '#A77BEB',
  };
});

function ElapsedTime({ scale }: { scale: number }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = elapsedSeconds < 60
    ? `${elapsedSeconds}s`
    : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  return <Text accessibilityLiveRegion="polite" style={[styles.elapsed, { fontSize: 13 * scale }]}>Elapsed: {elapsed}</Text>;
}

export function CinematicSkinScanner({ onBack }: { onBack: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [scanPosition] = useState(() => new Animated.Value(0.12));
  const [shimmer] = useState(() => new Animated.Value(0.55));
  const paused = reducedMotion || !appActive;
  const scale = Math.max(0.84, Math.min(1, width / 393, height / 844));
  const contentWidth = Math.min(width, 520);
  const artWidth = Math.min(contentWidth - 22 * scale, 390 * scale);
  const artHeight = Math.min(
    artWidth * 1.29,
    Math.max(280 * scale, height - insets.top - insets.bottom - 500 * scale),
  );

  const scanLineStyle = {
    transform: [{
      translateY: scanPosition.interpolate({
        inputRange: [0, 1],
        outputRange: [0, artHeight],
      }),
    }],
  };
  const shimmerStyle = { opacity: shimmer };

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let scanAnimation: Animated.CompositeAnimation | null = null;
    let shimmerAnimation: Animated.CompositeAnimation | null = null;
    if (paused) {
      scanPosition.setValue(0.47);
      shimmer.setValue(0.75);
    } else {
      scanAnimation = Animated.loop(Animated.sequence([
        Animated.timing(scanPosition, { toValue: 0.88, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(scanPosition, { toValue: 0.12, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]));
      shimmerAnimation = Animated.loop(Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]));
      scanAnimation.start();
      shimmerAnimation.start();
    }
    return () => {
      scanAnimation?.stop();
      shimmerAnimation?.stop();
    };
  }, [paused, scanPosition, shimmer]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#100D18', '#0D0C14', '#0A0A0F']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            minHeight: height,
            paddingTop: Math.max(insets.top, 12 * scale),
            paddingBottom: Math.max(insets.bottom, 16 * scale),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.page, { width: contentWidth, paddingHorizontal: 28 * scale }]}>
          <View style={styles.brandBlock}>
            <Text accessibilityRole="header" style={[styles.brand, { fontSize: 22 * scale }]}>SkinSnap</Text>
            <Text style={[styles.brandSubtitle, { fontSize: 12 * scale, marginTop: 7 * scale }]}>Face Scan Processing</Text>
          </View>

          <View style={[styles.artStage, { width: artWidth, height: artHeight, marginTop: 8 * scale }]}>
            <Svg width="100%" height="100%" viewBox="0 0 360 465" style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="skinsnap-face-outline" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#9870D8" />
                  <Stop offset="0.53" stopColor="#B6A4D5" />
                  <Stop offset="1" stopColor="#E5C99B" />
                </SvgLinearGradient>
              </Defs>
              <Ellipse cx="180" cy="257" rx="167" ry="166" fill="#8B6FD6" opacity="0.06" />
              <G>
                {PARTICLES.map((particle, index) => (
                  <G key={index}>
                    {index % 13 === 0 && <Circle cx={particle.x} cy={particle.y} r={particle.radius * 3.5} fill={particle.color} opacity={particle.opacity * 0.18} />}
                    <Circle cx={particle.x} cy={particle.y} r={particle.radius} fill={particle.color} opacity={particle.opacity} />
                  </G>
                ))}
              </G>
              <Path
                d="M180 18C95 18 45 66 45 147c0 91 15 179 49 243 23 42 54 67 86 72 32-5 63-30 86-72 34-64 49-152 49-243 0-81-50-129-135-129Z"
                fill="none"
                stroke="url(#skinsnap-face-outline)"
                strokeWidth="1.7"
              />
              <Path d="M47 206c-18-13-26 4-23 27 2 22 10 38 25 39m208-66c18-13 26 4 23 27-2 22-10 38-25 39" fill="none" stroke="url(#skinsnap-face-outline)" strokeWidth="1.45" />
              <Path d="M103 193c18-8 37-8 54 0m46 0c17-8 36-8 54 0" fill="none" stroke="url(#skinsnap-face-outline)" strokeOpacity="0.55" strokeWidth="1.15" strokeLinecap="round" />
              <Path d="M178 202c-3 20-10 42-11 56-1 8 7 12 13 12m2-68c3 20 10 42 11 56 1 8-7 12-13 12" fill="none" stroke="url(#skinsnap-face-outline)" strokeOpacity="0.78" strokeWidth="1.2" strokeLinecap="round" />
              <Path d="M167 270c4-4 9-4 13 0s9 4 13 0" fill="none" stroke="url(#skinsnap-face-outline)" strokeWidth="1.2" strokeLinecap="round" />
              <Path d="M124 321c19-2 32-13 56-13s37 11 56 13m-112 0c19 4 32 12 56 12s37-8 56-12" fill="none" stroke="url(#skinsnap-face-outline)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M112 345c19 9 42 14 68 14s49-5 68-14" fill="none" stroke="url(#skinsnap-face-outline)" strokeOpacity="0.62" strokeWidth="1" />
            </Svg>
            <Animated.View testID="scan-beam" pointerEvents="none" style={[styles.scanBeam, { top: artHeight * 0.08, width: artWidth * 1.04 }, scanLineStyle]}>
              <Animated.View style={[styles.scanGlow, shimmerStyle]}>
                <LinearGradient
                  colors={['rgba(139,126,200,0)', 'rgba(139,126,200,0.2)', 'rgba(199,174,232,0.42)', 'rgba(139,126,200,0.2)', 'rgba(139,126,200,0)']}
                  locations={[0, 0.24, 0.5, 0.76, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <LinearGradient
                colors={['rgba(153,103,235,0)', '#B995F4', '#EBD4B0', '#B18AEB', 'rgba(153,103,235,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.scanCore}
              />
            </Animated.View>
          </View>

          <View style={[styles.copyBlock, { marginTop: 3 * scale }]}>
            <Text style={[styles.title, { fontSize: 26 * scale, lineHeight: 32 * scale }]}>Analyzing your glow</Text>
            <Text style={[styles.subtitle, { fontSize: 13 * scale, marginTop: 7 * scale }]}>Waiting for your real photo analysis.</Text>
          </View>

          <View style={[styles.progressSection, { marginTop: 17 * scale }]}>
            <ElapsedTime scale={scale} />
            <Text style={[styles.waitNotice, { fontSize: 10 * scale, marginTop: 9 * scale }]}>
              The image model must return its observations before SkinSnap can build your result. Analysis may take up to about two minutes; no score or observation is invented while you wait.
            </Text>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Cancel scan and return to photo" onPress={onBack} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { fontSize: 11 * scale }]}>Cancel scan</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start' },
  brandBlock: { alignItems: 'center', marginTop: 5 },
  brand: { color: '#D2B7E7', fontFamily: 'InterSemibold', letterSpacing: -0.5 },
  brandSubtitle: { color: '#A59AAE', fontFamily: 'InterRegular' },
  artStage: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  scanBeam: { position: 'absolute', left: '-2%', height: 3, justifyContent: 'center' },
  scanGlow: { position: 'absolute', left: 0, right: 0, height: 30, shadowColor: '#A76AF0', shadowOpacity: 0.85, shadowRadius: 18, elevation: 10 },
  scanCore: { height: 2, borderRadius: 2, shadowColor: '#E8D4FF', shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
  copyBlock: { alignItems: 'center' },
  title: { color: '#FFFFFF', fontFamily: 'InterSemibold', textAlign: 'center', letterSpacing: -0.7 },
  subtitle: { color: '#C4BACB', fontFamily: 'InterRegular', textAlign: 'center' },
  progressSection: { width: '100%', maxWidth: 360 },
  elapsed: { color: '#D9C9DC', fontFamily: 'InterSemibold', textAlign: 'center' },
  waitNotice: { color: '#B7AEBE', fontFamily: 'InterRegular', textAlign: 'center', lineHeight: 16 },
  cancelButton: { marginTop: 7, paddingHorizontal: 14, paddingVertical: 8 },
  cancelText: { color: '#93889F', fontFamily: 'InterMedium' },
});
