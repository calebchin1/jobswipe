import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { s } from '../ui';
export function LiveScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <View style={s.brandRow}>
          <Text style={s.brand}>first.↗</Text>
          <Text style={s.demo}>CONNECTED ACCOUNT</Text>
        </View>
        {children}
        <Link href="/" style={s.link}>
          Back to fictional demo
        </Link>
        <Text style={s.footer}>
          This area uses your connected server. Nothing here comes from demo fixtures. Calls,
          messages and identity sharing are not available yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Status({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <Text
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[s.body, error && { color: '#A13E30' }]}
    >
      {message}
    </Text>
  );
}
