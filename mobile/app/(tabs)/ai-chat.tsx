import { Redirect } from 'expo-router';

export default function AiChatDisabled() {
	return <Redirect href="/(tabs)" />;
}
