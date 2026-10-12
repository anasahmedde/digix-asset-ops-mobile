import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";

import { EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { AppNotification } from "@/lib/types";

type IconName = keyof typeof Ionicons.glyphMap;
const TYPE_META: Record<string, { icon: IconName; tint: string }> = {
  ticket_assigned: { icon: "person-add", tint: colors.primary },
  ticket_update: { icon: "sync", tint: colors.info },
  ticket_review: { icon: "eye", tint: colors.violet },
  ticket_escalated: { icon: "trending-up", tint: colors.danger },
  installation_assigned: { icon: "hammer", tint: colors.primary },
  installation_escalated: { icon: "warning", tint: colors.danger },
  alert: { icon: "warning", tint: colors.warning },
  chat_message: { icon: "chatbubble", tint: colors.success },
  maintenance_reminder: { icon: "construct", tint: colors.warning },
  system: { icon: "notifications", tint: colors.textMuted },
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/notifications/", { params: { ordering: "-created_at", page_size: 100 } });
      setItems(data.results ?? data);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The desktop's link, turned into this app's screen.
  function routeFor(link?: string): string | null {
    if (!link) return null;
    const q = (k: string) => new URLSearchParams(link.split("?")[1] ?? "").get(k);
    if (link.startsWith("/tickets") && q("open")) return `/ticket/${q("open")}`;
    if (link.startsWith("/installation-tracker") && q("installation")) return `/installation/${q("installation")}`;
    if (link.startsWith("/maintenance")) return q("schedule") ? `/job/${q("schedule")}` : "/(tabs)/jobs";
    return null;
  }

  async function markAllRead() {
    try { await api.post("/notifications/notifications/mark_all_read/"); load(); } catch { /* ignore */ }
  }

  // A notice that waits on an action stays until the job moves or it is
  // acknowledged; opening it only takes you there.
  async function acknowledge(n: AppNotification) {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    api.post(`/notifications/notifications/${n.id}/mark_read/`).catch(() => {});
  }

  async function open(n: AppNotification) {
    if (!n.is_read && !n.is_actionable) acknowledge(n);
    const linked = routeFor(n.link);
    if (linked) { router.push(linked as never); return; }
    const ticketId = n.ticket || (n.data?.ticket_id as string | undefined);
    const installationId =
      (n as { installation?: string }).installation || (n.data?.installation_id as string | undefined);
    if (ticketId) router.push(`/ticket/${ticketId}`);
    else if (installationId) router.push(`/installation/${installationId}`);
    else if (n.notification_type === "installation_escalated" || n.notification_type === "maintenance_reminder") router.push("/(tabs)/jobs");
    else load();
  }

  return (
    <>
      <Stack.Screen options={{ headerRight: () => items.some((i) => !i.is_read) ? (
        <Pressable onPress={markAllRead} hitSlop={8}><Text style={styles.markAll}>Mark all read</Text></Pressable>
      ) : null }} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : { paddingVertical: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<EmptyState icon="notifications-outline" title="No notifications" subtitle="You're all caught up." />}
          renderItem={({ item }) => {
            const m = TYPE_META[item.notification_type] || TYPE_META.system;
            return (
              <Pressable onPress={() => open(item)} style={[styles.row, !item.is_read && styles.rowUnread]}>
                <View style={[styles.icon, { backgroundColor: m.tint + "1a" }]}><Ionicons name={m.icon} size={18} color={m.tint} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  {/* Which kind it is: something to do, or something to know. */}
                  {(() => {
                    const pinned = !!item.is_actionable && !item.resolved_at;
                    const label = pinned ? "Action required" : item.is_actionable ? "Done" : "For info";
                    const fg = pinned ? "#b45309" : item.is_actionable ? colors.success : colors.textMuted;
                    const bg = pinned ? colors.warningSoft : item.is_actionable ? colors.successSoft : colors.secondary;
                    return <Text style={[styles.kind, { color: fg, backgroundColor: bg }]}>{label}</Text>;
                  })()}
                  {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.is_read && (
                  <Pressable onPress={() => acknowledge(item)} hitSlop={8} accessibilityLabel="Acknowledge" style={styles.ack}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  markAll: { color: colors.primary, fontWeight: "700", fontSize: font.sm },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowUnread: { backgroundColor: "#f5f8ff" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  kind: { alignSelf: "flex-start", marginTop: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: font.xs, fontWeight: "700", overflow: "hidden" },
  message: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  time: { fontSize: font.xs, color: colors.textLight, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  ack: { padding: 4, marginTop: 2 },
});
