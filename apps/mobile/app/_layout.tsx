import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoProvider } from '../src/demo';
import { LiveAuthProvider } from '../src/live/auth';
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LiveAuthProvider>
        <DemoProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#F7F8F2' },
              headerTintColor: '#243F37',
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="live-audio" options={{ title: 'Blind audio interview' }} />
            <Stack.Screen name="live-interviews" options={{ title: 'Interview scheduling' }} />
            <Stack.Screen name="account" options={{ title: 'Connected account' }} />
            <Stack.Screen name="live-profile" options={{ title: 'Live blind profile' }} />
            <Stack.Screen name="live" options={{ title: 'Candidate workspace' }} />
            <Stack.Screen name="onboarding" options={{ title: 'Profile setup' }} />
            <Stack.Screen name="jobs/[jobId]" options={{ title: 'Job details' }} />
            <Stack.Screen name="applications/[id]" options={{ title: 'Your application' }} />
          </Stack>
        </DemoProvider>
      </LiveAuthProvider>
    </SafeAreaProvider>
  );
}
