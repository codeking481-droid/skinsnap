import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function LaunchSplash() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1B0D18', '#100B13', '#09090E']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.content}>
        <Text style={styles.wordmark}>Skin<Text style={styles.accent}>Snap</Text></Text>
        <Text style={styles.tagline}>Your skincare, your pace.</Text>
        <ActivityIndicator color="#FF79A6" size="small" style={styles.indicator} />
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
    backgroundColor: 'rgba(255, 74, 139, 0.09)',
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
    color: '#FF6B9D',
  },
  tagline: {
    marginTop: 5,
    color: '#C7B8C3',
    fontFamily: 'InterMedium',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  indicator: {
    marginTop: 28,
  },
});
