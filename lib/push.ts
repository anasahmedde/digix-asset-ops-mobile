import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import api from "./api";

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ask for permission, obtain the Expo push token and register it with the
 * backend so this device receives ticket / chat push notifications.
 *
 * Best-effort: any failure (e.g. running on a device without FCM configured)
 * is swallowed so it never breaks the app.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#059669",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) return;

    await api.post("/notifications/push-tokens/", { token, platform: Platform.OS });
  } catch (err) {
    // FCM not configured / permission denied / offline — non-fatal.
    console.log("push registration skipped:", String(err));
  }
}

/** Route the user to the relevant screen when they tap a notification. */
function handleNotificationNavigation(data: Record<string, unknown> | undefined) {
  if (!data) return;
  const type = data.notification_type as string | undefined;
  if (type === "chat_message" && data.room_id) {
    router.push(`/chat/${data.room_id}` as never);
  } else if (data.ticket_id) {
    router.push(`/ticket/${data.ticket_id}` as never);
  } else {
    router.push("/notifications" as never);
  }
}

/** Wire tap-to-navigate. Returns an unsubscribe function. */
export function setupNotificationTapHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationNavigation(
      response.notification.request.content.data as Record<string, unknown>
    );
  });
  return () => sub.remove();
}
