import { Tabs } from 'expo-router';
import { Text } from 'react-native';
const icons: Record<string, string> = { index: '◈', saved: '♡', applications: '▤', profile: '◎' };
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#295C46',
        tabBarInactiveTintColor: '#748075',
        tabBarStyle: { backgroundColor: '#F7F8F2', borderTopColor: '#DDE3D7' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>{icons[route.name]}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Discover' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
