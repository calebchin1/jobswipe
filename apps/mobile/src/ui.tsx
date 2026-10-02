import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemo } from './demo';
export const colors = {
  ink: '#243F37',
  muted: '#69796E',
  paper: '#F7F8F2',
  green: '#295C46',
  line: '#DDE3D7',
  pale: '#E6EDDF',
};
export function Screen({ children }: { children: React.ReactNode }) {
  const { notice } = useDemo();
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <View style={s.brandRow}>
          <Text style={s.brand}>
            first.<Text style={{ color: '#799768' }}>↗</Text>
          </Text>
          <Text style={s.demo}>FICTIONAL DEMO</Text>
        </View>
        {children}
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
        <Text style={s.footer}>
          A local prototype. No real applications, accounts, calls, or identity sharing. Changes
          reset on reload.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.heading}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.tag}>
      <Text style={s.tagText}>{children}</Text>
    </View>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <View style={s.panel}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.body}>{description}</Text>
    </View>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  screen: { padding: 22, gap: 18, maxWidth: 620, width: '100%', alignSelf: 'center' },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  brand: { fontSize: 27, fontWeight: '800', letterSpacing: -1, color: colors.ink },
  demo: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.muted },
  heading: { gap: 8, marginTop: 10 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: colors.green },
  title: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.4,
    color: colors.ink,
  },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.muted },
  panel: {
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secondary: { backgroundColor: colors.pale },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  tag: { backgroundColor: colors.pale, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  tagText: { fontSize: 12, color: colors.ink, fontWeight: '500' },
  notice: { fontSize: 13, lineHeight: 19, color: colors.green, minHeight: 19 },
  footer: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
    paddingBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
  },
  divider: { height: 1, backgroundColor: colors.line },
  link: { fontSize: 14, color: colors.green, fontWeight: '700', paddingVertical: 8 },
});
