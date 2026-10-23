import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { FeatureIcon, type IconName } from '../components/FeatureIcon';
import { GlowButton } from '../components/GlowButton';
import { LaunchSplash } from '../components/LaunchSplash';
import { theme } from '../theme';
import { hasCompletedOnboarding } from '../preferences';

const portrait = require('../../assets/images/welcome-portrait.png');
const avatars = [
  require('../../assets/images/portrait.jpg'),
  require('../../assets/images/avatar-0.jpg'),
  require('../../assets/images/avatar-1.jpg'),
  require('../../assets/images/avatar-2.jpg'),
];
const features: { icon: IconName; title: string; description: string }[] = [
  { icon: 'scan', title: 'Skin insight previews', description: 'AI analysis is not configured in this demo.' },
  { icon: 'leaf', title: 'Routine building', description: 'Build a routine from general skincare steps.' },
  { icon: 'chart', title: 'Track your progress', description: 'Keep a personal record of your routine.' },
  { icon: 'people', title: 'Designed for all skin tones', description: 'An inclusive design, with no accuracy claims.' },
];

export default function WelcomeScreen() {
  const [entryReady, setEntryReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const navigationStarted = useRef(false);
  useEffect(() => {
    let active = true;
    hasCompletedOnboarding().then((complete) => {
      if (!active) return;
      setOnboardingComplete(complete);
      setEntryReady(true);
    });
    return () => { active = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    navigationStarted.current = false;
  }, []));
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(width, 520);
  const scale = Math.max(1, Math.min(pageWidth / 393, 1.08));
  // Preserve the reference proportions, while allowing small screens and large text to scroll.
  const minimumHeight = Math.max(height, 698 * scale + Math.max(0, insets.bottom - 8));
  const textScale = Math.max(1, fontScale);
  const continueToApp = () => {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    router.push(onboardingComplete ? '/upload' : '/onboarding');
  };

  if (!entryReady) return <LaunchSplash />;

  return (
    <View style={styles.app}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.page, { width: pageWidth, minHeight: minimumHeight }]}>
          <Image source={portrait} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.77)', '#030305']} locations={[0, 0.39, 0.65, 1]} style={StyleSheet.absoluteFill} />
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 393 698" preserveAspectRatio="none">
            <Defs><RadialGradient id="pinkGlow"><Stop offset="0" stopColor="#FF3E80" stopOpacity={0.48} /><Stop offset="0.38" stopColor="#BD275B" stopOpacity={0.2} /><Stop offset="1" stopColor="#050306" stopOpacity={0} /></RadialGradient></Defs>
            <Ellipse cx={-24} cy={554} rx={135} ry={65} fill="url(#pinkGlow)" transform="rotate(-31 -24 554)" />
          </Svg>

          <View style={{ flex: 1, minHeight: Math.max(260 * scale, insets.top + 200 * scale) }} />
          <View style={[styles.content, { paddingHorizontal: theme.spacing.page * scale, paddingBottom: Math.max(10 * scale, insets.bottom) }]}>
            <View style={styles.brand} accessibilityRole="header" accessibilityLabel="SkinSnap">
              <Text maxFontSizeMultiplier={1.15} style={[styles.wordmark, { fontSize: theme.typography.brand * scale, lineHeight: 67 * scale, letterSpacing: -2 * scale }]}>Skin<Text style={styles.pink}>Snap</Text></Text>
              <Svg width={20 * scale} height={28 * scale} viewBox="0 0 20 28" style={{ marginLeft: -1 * scale, marginTop: 7 * scale }}><Path d="M10 0C9 10 7 12 0 14c7 2 9 4 10 14 1-10 3-12 10-14C13 12 11 10 10 0Z" fill="#FF6A9F" /></Svg>
            </View>
            <Text style={[styles.tagline, { fontSize: theme.typography.tagline * scale, lineHeight: 20 * scale * textScale, marginTop: 0 }]}>
              Your skincare, your pace.{ '\n' }Understand. Care. Glow.
            </Text>

            <View style={[styles.features, { marginTop: 19 * scale, gap: theme.spacing.rowGap * scale }]}>
              {features.map(feature => (
                <View key={feature.icon} style={[styles.feature, { gap: theme.spacing.featureGap * scale }]}>
                  <LinearGradient colors={['rgba(104,38,60,0.52)', 'rgba(43,20,29,0.72)']} style={[styles.iconTile, { width: 47 * scale, height: 45 * scale, borderRadius: 11 * scale }]}>
                    <FeatureIcon name={feature.icon} size={33 * scale} />
                  </LinearGradient>
                  <View style={styles.featureCopy}>
              <Text style={[styles.featureTitle, { fontSize: theme.typography.title * scale, lineHeight: 18 * scale * textScale }]}>{feature.title}</Text>
                    <Text style={[styles.description, { fontSize: theme.typography.body * scale, lineHeight: 16 * scale * textScale, marginTop: 1 * scale }]}>{feature.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 10 * scale }}><GlowButton scale={scale} label={onboardingComplete ? 'Continue' : 'Get Started'} accessibilityLabel={onboardingComplete ? 'Continue to photo selection' : 'Start onboarding'} onPress={continueToApp} /></View>
            {onboardingComplete && (
              <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding')} style={styles.replayButton}>
                <Text style={[styles.replayLabel, { fontSize: 12 * scale, paddingVertical: 9 * scale }]}>Replay the introduction</Text>
              </Pressable>
            )}
            <View style={[styles.community, { marginTop: 9 * scale, minHeight: 22 * scale, gap: 9 * scale }]}>
              <View style={styles.avatars} {...Platform.select({ web: { 'aria-hidden': true as const }, default: { accessibilityElementsHidden: true } })}>
                {avatars.map((source, item) => <Image key={item} source={source} style={{ width: 22 * scale, height: 22 * scale, borderRadius: 11 * scale, borderColor: '#F6E8EF', borderWidth: 0.8, marginLeft: item ? -6 * scale : 0 }} />)}
              </View>
              <Text style={[styles.communityText, { fontSize: 10 * scale }]}>A fresh start for your skincare routine</Text>
            </View>
          </View>
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { overflow: 'hidden', backgroundColor: '#020203', flexGrow: 1 },
  content: { width: '100%' },
  brand: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  wordmark: { color: '#FFFFFF', fontFamily: 'InterBlack' },
  pink: { color: '#FF5F98' },
  tagline: { color: theme.colors.muted, textAlign: 'center', fontFamily: 'InterMedium', letterSpacing: 0.05 },
  features: { alignSelf: 'center', width: '76%' },
  feature: { flexDirection: 'row', alignItems: 'center' },
  iconTile: { borderWidth: 0.55, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  featureCopy: { flex: 1 },
  featureTitle: { color: '#FFFFFF', fontFamily: 'InterSemibold', letterSpacing: -0.25 },
  description: { color: theme.colors.muted, fontFamily: 'InterRegular', letterSpacing: -0.12 },
  community: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  replayButton: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  replayLabel: { color: '#E5B9C8', fontFamily: 'InterMedium', textDecorationLine: 'underline' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  communityText: { color: '#B9B6C0', fontFamily: 'InterRegular' },
});
