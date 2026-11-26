import { Stack } from 'expo-router';

export default function ChatgptOAuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="consent" />
      <Stack.Screen name="success" />
      <Stack.Screen name="error" />
    </Stack>
  );
}
