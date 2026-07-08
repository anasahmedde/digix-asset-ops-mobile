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
      </Stack>
    </>
  );
}
