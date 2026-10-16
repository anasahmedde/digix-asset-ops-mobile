import { Ionicons } from "@expo/vector-icons";
import {
  Urbanist_400Regular, Urbanist_500Medium, Urbanist_600SemiBold, Urbanist_700Bold, Urbanist_800ExtraBold,
} from "@expo-google-fonts/urbanist";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { colors } from "@/constants/theme";
import { startOutbox } from "@/lib/offline";

const headerStyle = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: "Urbanist_700Bold", fontSize: 17 },
  headerBackTitleStyle: { fontFamily: "Urbanist_500Medium" },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export default function RootLayout() {
  // The desktop's typeface and the icon font. Proceed even if a font errors,
  // or the app would hang on a blank screen; text then falls back to system.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    Urbanist_400Regular, Urbanist_500Medium, Urbanist_600SemiBold, Urbanist_700Bold, Urbanist_800ExtraBold,
  });
  // Whatever was done without signal goes up as soon as there is some.
  useEffect(() => { startOutbox(); }, []);
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="installation/[id]" options={{ ...headerStyle, title: "Installation" }} />
        <Stack.Screen name="job/[id]" options={{ ...headerStyle, title: "Maintenance job" }} />
        <Stack.Screen name="ticket/[id]" options={{ ...headerStyle, title: "Ticket" }} />
        <Stack.Screen name="asset/[code]" options={{ ...headerStyle, title: "Asset" }} />
        <Stack.Screen name="site/[id]" options={{ ...headerStyle, title: "Site" }} />
        <Stack.Screen name="notifications" options={{ ...headerStyle, title: "Notifications" }} />
        <Stack.Screen name="chat/[id]" options={{ ...headerStyle, title: "Chat" }} />
        <Stack.Screen name="new-chat" options={{ ...headerStyle, title: "New message", presentation: "modal" }} />
      </Stack>
    </>
  );
}
