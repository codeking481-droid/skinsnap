import { useCallback, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backOrReplace } from '../navigation';

export function RetentionPage({ title, children, onBack, locked = false }: { title: string; children: ReactNode; onBack?: () => void; locked?: boolean }) {
  const insets = useSafeAreaInsets();
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!locked) (onBack ?? (() => backOrReplace('/progress')))();
      return true;
    });
    return () => subscription.remove();
  }, [locked, onBack]));
  return <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      <Action label="‹ Back" disabled={locked} onPress={onBack ?? (() => backOrReplace('/progress'))} secondary />
      <Text accessibilityRole="header" style={ui.title}>{title}</Text><View pointerEvents={locked ? 'none' : 'auto'}>{children}</View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Copy({ children }: { children: ReactNode }) { return <Text style={ui.copy}>{children}</Text>; }
export function Status({ children }: { children: ReactNode }) { return children ? <Text accessibilityLiveRegion="polite" style={ui.status}>{children}</Text> : null; }
export function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.button, secondary && ui.secondary, disabled && { opacity: 0.45 }]}><Text style={[ui.buttonText, secondary && { color: '#FFD0DF' }]}>{label}</Text></Pressable>;
}
export function Field({ label, value, onChangeText, maxLength = 400, multiline = false, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; maxLength?: number; multiline?: boolean; placeholder?: string }) {
  return <View style={{ marginTop: 12 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} maxLength={maxLength} multiline={multiline} placeholder={placeholder} placeholderTextColor="#A798A8" style={[ui.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]} /></View>;
}
export function Toggle({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={ui.toggle}><Text style={ui.copy}>{checked ? '☑' : '☐'} {label}</Text></Pressable>;
}
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#08060C' }, title: { color: '#FF8FB5', fontFamily: 'InterExtraBold', fontSize: 27, marginVertical: 16 },
  card: { backgroundColor: '#181019', borderColor: '#533247', borderWidth: 1, borderRadius: 18, padding: 16, marginVertical: 8, gap: 7 },
  copy: { color: '#DCD1DF', fontFamily: 'InterRegular', fontSize: 13, lineHeight: 20 },
  status: { color: '#FFB9D0', fontFamily: 'InterMedium', fontSize: 13, lineHeight: 20, marginVertical: 12 },
  label: { color: '#FFE0EB', fontFamily: 'InterSemibold', fontSize: 13, marginBottom: 7 },
  input: { color: '#FFF', fontFamily: 'InterRegular', fontSize: 14, borderColor: '#6D4058', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 48, backgroundColor: '#0F0A12' },
  button: { minHeight: 48, borderRadius: 24, backgroundColor: '#FF80AC', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginVertical: 5 },
  secondary: { backgroundColor: '#291827', borderWidth: 1, borderColor: '#79506A' }, buttonText: { color: '#140A12', fontFamily: 'InterSemibold', fontSize: 14, textAlign: 'center' },
  toggle: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
});
