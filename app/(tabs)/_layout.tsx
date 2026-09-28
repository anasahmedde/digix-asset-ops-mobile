import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import api from "@/lib/api";
import { registerForPush, setupNotificationTapHandler } from "@/lib/push";

export default function TabLayout() {
  const [unread, setUnread] = useState(0);
  // A fixed bar height puts the labels under the home indicator on phones
  // that have one, and clips them on those that do not. The bar is as tall
  // as its content plus whatever the device reserves at the bottom.
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

  // Register this device for push + route notification taps (once, when signed in).
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ title: "Workspace", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="tickets/index"
        options={{ title: "Tickets", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "reader" : "reader-outline"} size={size} color={color} /> }}
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
