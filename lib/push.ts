import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { AppState, Platform } from "react-native";

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
  // The web's job link opens the job here.
  const job = typeof data.link === "string" ? data.link.match(/schedule=([0-9a-f-]{36})/) : null;
  if (job) {
    router.push(`/job/${job[1]}` as never);
  } else if (type === "chat_message" && data.room_id) {
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

type Notice = {
  id: string; title: string; message: string; created_at: string; is_read: boolean;
  link?: string; notification_type?: string; data?: Record<string, unknown>;
};
const listeners = new Set<() => void>();
let newest: string | null = null;

/** Screens that should reload when a new notice lands. Returns an unsubscribe. */
export function onNotice(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function checkNotices() {
  try {
    const { data } = await api.get("/notifications/notifications/", { params: { ordering: "-created_at", page_size: 10 } });
    const rows = (data.results ?? data) as Notice[];
    if (rows.length === 0) return;
    // First look after opening: what is already there is not news.
    if (newest === null) { newest = rows[0].created_at; return; }
    const fresh = rows.filter((r) => r.created_at > (newest as string));
    if (fresh.length === 0) return;
    newest = fresh[0].created_at;
    listeners.forEach((fn) => fn());
    for (const r of [...fresh].reverse()) {
      if (r.is_read) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: r.title, body: r.message || undefined,
          data: { ...(r.data ?? {}), link: r.link, notification_type: r.notification_type },
        },
        trigger: null,
      }).catch(() => {});
    }
  } catch {
    // Offline: the next look catches up.
  }
}

/** Until Firebase is set up for the app, the server's pushes never reach the
 *  phone. While the app is open it asks for new notices itself, shows each
 *  as a notification and tells any open screen to reload.
 *  ponytail: polls every 20 s while open; with push working, drop this (or
 *  it shows each notice twice). */
export function watchNotices(): () => void {
  checkNotices();
  const timer = setInterval(() => { if (AppState.currentState === "active") checkNotices(); }, 20000);
  const sub = AppState.addEventListener("change", (s) => { if (s === "active") checkNotices(); });
  return () => { clearInterval(timer); sub.remove(); };
}
