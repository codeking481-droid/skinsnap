import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { PhotoProvider } from '../PhotoContext';
import { loadPreferences } from '../preferences';
import { LaunchSplash } from '../components/LaunchSplash';

export default function RootLayout() {
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [, setOnboardingComplete] = useState(false);
  const [loaded, error] = useFonts({
    InterRegular: require('../../assets/fonts/Inter-400Regular.ttf'),
    InterMedium: require('../../assets/fonts/Inter-500Medium.ttf'),
    InterSemibold: require('../../assets/fonts/Inter-600SemiBold.ttf'),
    InterExtraBold: require('../../assets/fonts/Inter-800ExtraBold.ttf'),
    InterBlack: require('../../assets/fonts/Inter-900Black.ttf'),
  });
  useEffect(() => {
    let active = true;
    loadPreferences().then((preferences) => {
      if (!active) return;
      setOnboardingComplete(preferences.onboardingComplete);
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, []);
  const ready = (loaded || !!error) && preferencesReady;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {ready ? (
        <PhotoProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#100B13' },
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
