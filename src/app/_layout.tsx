import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { PhotoProvider } from '../PhotoContext';
import { loadPreferences } from '../preferences';
import { shouldRequireAgeConfirmation } from '../privacy';
import { LaunchSplash } from '../components/LaunchSplash';

export default function RootLayout() {
  const [preferencesReady, setPreferencesReady] = useState(false);
  const segments = useSegments();
  const route = segments[0] ?? 'index';
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
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    let active = true;
    loadPreferences().then((preferences) => {
      if (active && shouldRequireAgeConfirmation(preferences.ageConfirmed, route)) {
        router.replace('/onboarding');
      }
    });
    return () => { active = false; };
  }, [preferencesReady, route]);
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
