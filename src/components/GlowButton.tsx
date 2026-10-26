import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../theme';

export function GlowButton({ onPress, scale = 1, label = 'Get Started', accessibilityLabel = 'Get started' }: { onPress: () => void; scale?: number; label?: string; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.button, { borderRadius: 29 * scale, transform: [{ scale: pressed ? 0.975 : 1 }], opacity: pressed ? 0.9 : 1 }]}>
      <LinearGradient colors={['#E8C9A0', '#D4B896']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, { minHeight: 51 * scale, gap: 12 * scale }]}>
        <Text style={[styles.label, { fontSize: 21 * scale }]}>{label}</Text>
        <Svg width={25 * scale} height={25 * scale} viewBox="0 0 24 24" fill="none" stroke="#09090D" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 12h15m-6-6 6 6-6 6" /></Svg>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { overflow: 'hidden', borderWidth: 0.7, borderColor: '#E8C9A0', backgroundColor: theme.colors.accent, boxShadow: '0px 0px 20px 1px rgba(212, 184, 150, 0.22)' },
  fill: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9 },
  label: { color: '#08090D', fontFamily: 'InterExtraBold', letterSpacing: -0.5 },
});
