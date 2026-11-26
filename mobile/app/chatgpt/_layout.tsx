import { Stack } from 'expo-router';

export default function ChatgptLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="oauth" />
    </Stack>
  );
}
