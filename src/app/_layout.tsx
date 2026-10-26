import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhotoProvider } from '../PhotoContext';
import { loadPreferences, subscribePreferences, type Preferences } from '../preferences';
import { getAppFlowRedirect } from '../flowLogic';
import { LaunchSplash } from '../components/LaunchSplash';

export default function RootLayout() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [preferencesLoadFailed, setPreferencesLoadFailed] = useState(false);
  const segments = useSegments();
  const route = segments[0] ?? 'index';
  useFonts({
    InterRegular: require('../../assets/fonts/Inter-400Regular.ttf'),
    InterMedium: require('../../assets/fonts/Inter-500Medium.ttf'),
    InterSemibold: require('../../assets/fonts/Inter-600SemiBold.ttf'),
    InterExtraBold: require('../../assets/fonts/Inter-800ExtraBold.ttf'),
    InterBlack: require('../../assets/fonts/Inter-900Black.ttf'),
  });
  useEffect(() => {
    const unsubscribe = subscribePreferences(setPreferences);
    void loadPreferences().then(setPreferences).catch(() => setPreferencesLoadFailed(true));
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!preferences) return;
    const redirect = getAppFlowRedirect(preferences, route);
    if (redirect) router.replace(redirect);
  }, [preferences, route]);
  if (preferencesLoadFailed) {
    return (
      <SafeAreaProvider>
        <View style={styles.storageError}>
          <Text style={styles.storageErrorTitle}>Saved settings are unavailable</Text>
          <Text style={styles.storageErrorText}>SkinSnap could not read your local preferences. They have not been replaced.</Text>
          <Pressable accessibilityRole="button" onPress={() => {
            setPreferencesLoadFailed(false);
            void loadPreferences().then(setPreferences).catch(() => setPreferencesLoadFailed(true));
          }} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {preferences ? (
        <PhotoProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0A0A0A' },
              animation: 'slide_from_right',
              animationDuration: 260,
              gestureEnabled: true,
            }}
          />
        </PhotoProvider>
      ) : <LaunchSplash />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  storageError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, backgroundColor: '#0A0A0A' },
  storageErrorTitle: { color: '#F8F5FC', fontSize: 21, fontFamily: 'InterExtraBold', textAlign: 'center' },
  storageErrorText: { color: '#B9B4B5', fontSize: 14, lineHeight: 21, fontFamily: 'InterRegular', textAlign: 'center' },
  retryButton: { minHeight: 48, minWidth: 140, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#E8C9A0' },
  retryButtonText: { color: '#181613', fontSize: 15, fontFamily: 'InterSemibold' },
});
