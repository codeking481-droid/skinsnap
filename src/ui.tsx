import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { colors } from './theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Label({ children, style, ...props }: TextProps) {
  return <Text {...props} style={[styles.label, style]}>{children}</Text>;
}

export function Button({
  title,
  secondary,
  onPress,
  disabled,
  style,
}: {
  title: string;
  secondary?: boolean;
  onPress: PressableProps['onPress'];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 22, paddingTop: 22 },
  label: { color: colors.text, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonText: { color: '#17141D', fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line },
  secondaryButtonText: { color: colors.text },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 24, padding: 18 },
});
