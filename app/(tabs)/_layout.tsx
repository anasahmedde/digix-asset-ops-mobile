import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import api from "@/lib/api";
import { registerForPush, setupNotificationTapHandler } from "@/lib/push";

/**
 * Five tabs, all field work: what is on today, the jobs, the scanner, the
 * team's messages, and the person. The office's screens live on the desktop.
 */
export default function TabLayout() {
  const [unread, setUnread] = useState(0);
  const insets = useSafeAreaInsets();

  const loadUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/rooms/total_unread/");
      setUnread(data.total_unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 15000);
    return () => clearInterval(t);
  }, [loadUnread]);

  // This device hears the same notices the desktop shows, as push.
  useEffect(() => {
    registerForPush();
    const unsubscribe = setupNotificationTapHandler();
    return unsubscribe;
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Urbanist_600SemiBold" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "sunny" : "sunny-outline"} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="jobs/index"
        options={{ title: "Jobs", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "construct" : "construct-outline"} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="scan/index"
        options={{ title: "Scan", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "scan-circle" : "scan-circle-outline"} size={size + 6} color={color} /> }}
      />
      <Tabs.Screen
        name="messages/index"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{ title: "Profile", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} /> }}
      />
    </Tabs>
  );
}
