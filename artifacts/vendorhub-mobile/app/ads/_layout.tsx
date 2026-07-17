import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function AdsLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontFamily: 'Inter_700Bold',
          fontSize: 17,
          color: colors.foreground,
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: 'Campaign Details' }} />
    </Stack>
  );
}
