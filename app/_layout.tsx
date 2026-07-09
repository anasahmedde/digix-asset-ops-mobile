import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { colors } from "@/constants/theme";

const headerStyle = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "700" as const, fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

export default function RootLayout() {
  // Preload the icon font so Ionicons glyphs render in the release APK.
  // IMPORTANT: proceed even if the font errors — otherwise the whole app
  // would hang on a blank screen. Icons still lazy-load via the library.
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font });
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ticket/[id]" options={{ ...headerStyle, title: "Ticket" }} />
        <Stack.Screen name="chat/[id]" options={{ ...headerStyle, title: "Chat" }} />
        <Stack.Screen name="asset/[code]" options={{ ...headerStyle, title: "Asset" }} />
        <Stack.Screen name="notifications" options={{ ...headerStyle, title: "Notifications" }} />
        <Stack.Screen name="new-chat" options={{ ...headerStyle, title: "New Message", presentation: "modal" }} />
        <Stack.Screen name="attendance" options={{ ...headerStyle, title: "Attendance" }} />
        <Stack.Screen name="visits" options={{ ...headerStyle, title: "Site Visits" }} />
        <Stack.Screen name="site/[id]" options={{ ...headerStyle, title: "Site" }} />
        <Stack.Screen name="installation/[id]" options={{ ...headerStyle, title: "Installation" }} />
        <Stack.Screen name="web-view" options={{ ...headerStyle, title: "DIGIX" }} />
        <Stack.Screen name="admin/assets" options={{ ...headerStyle, title: "Assets" }} />
        <Stack.Screen name="admin/clients" options={{ ...headerStyle, title: "Clients" }} />
        <Stack.Screen name="admin/work-orders" options={{ ...headerStyle, title: "Work Orders" }} />
        <Stack.Screen name="admin/work-order/[id]" options={{ ...headerStyle, title: "Work Order" }} />
      </Stack>
    </>
  );
}
