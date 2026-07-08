import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

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

  async function markAllRead() {
    try { await api.post("/notifications/notifications/mark_all_read/"); load(); } catch { /* ignore */ }
  }

  async function open(n: AppNotification) {
    if (!n.is_read) api.post(`/notifications/notifications/${n.id}/mark_read/`).catch(() => {});
    const ticketId = n.ticket || (n.data?.ticket_id as string | undefined);
    if (ticketId) router.push(`/ticket/${ticketId}`);
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
                  {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.is_read && <View style={styles.dot} />}
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
  message: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  time: { fontSize: font.xs, color: colors.textLight, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
});
