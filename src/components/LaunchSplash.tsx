import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function LaunchSplash() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#191713', '#100F0D', '#09090E']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.content}>
        <Text style={styles.wordmark}>Skin<Text style={styles.accent}>Snap</Text></Text>
        <Text style={styles.tagline}>Your skincare, your pace.</Text>
        <View style={styles.brandMark}>
          <LinearGradient colors={['#E8C9A0', '#D4B896']} style={styles.brandMarkFill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#09090E',
  },
  glow: {
    position: 'absolute',
    top: '24%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(212, 184, 150, 0.08)',
    transform: [{ scaleX: 1.35 }],
  },
  content: {
    alignItems: 'center',
  },
  wordmark: {
    color: '#FFFFFF',
    fontFamily: 'InterBlack',
    fontSize: 42,
    letterSpacing: -1.8,
  },
  accent: {
    color: '#E8C9A0',
  },
  tagline: {
    marginTop: 5,
    color: '#B9B4B5',
    fontFamily: 'InterMedium',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  brandMark: { width: 26, height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 22, opacity: 0.9 },
  brandMarkFill: { width: '100%', height: 3, borderRadius: 2 },
});
