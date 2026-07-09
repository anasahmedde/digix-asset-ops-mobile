import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TicketCard } from "@/components/ticket-card";
import { Avatar, IconButton, Loading, SectionHeader, StatTile } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { greeting } from "@/lib/format";
import { Ticket, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

type IconName = keyof typeof Ionicons.glyphMap;
const ACTIONS: { label: string; icon: IconName; tint: string; href: string }[] = [
  { label: "Scan Asset", icon: "scan-outline", tint: colors.primary, href: "/(tabs)/scan" },
  { label: "Check In", icon: "time-outline", tint: colors.success, href: "/attendance" },
  { label: "Site Visits", icon: "map-outline", tint: colors.violet, href: "/visits" },
  { label: "Messages", icon: "chatbubbles-outline", tint: colors.warning, href: "/(tabs)/messages" },
];

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({ total: 0, overdue: 0, in_progress: 0 });
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, summary, notif] = await Promise.allSettled([
        getCurrentUser(),
        api.get("/notifications/notifications/assigned_tickets_summary/"),
        api.get("/notifications/notifications/unread_count/"),
      ]);
      if (me.status === "fulfilled") setUser(me.value);
      if (notif.status === "fulfilled") setUnread(notif.value.data.count ?? 0);
      if (summary.status === "fulfilled") {
        const d = summary.value.data;
        const list: Ticket[] = d.tickets ?? [];
        setTickets(list);
        setStats({
          total: d.total ?? list.length,
          overdue: d.overdue ?? 0,
          in_progress: list.filter((t) => t.status === "in_progress").length,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name} numberOfLines={1}>{user?.full_name || user?.username || "Field Staff"}</Text>
        </View>
        <IconButton name="notifications-outline" badge={unread} onPress={() => router.push("/notifications")} />
        <Pressable onPress={() => router.push("/(tabs)/profile")}>
          <Avatar name={user?.full_name || user?.username} size={40} />
        </Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Stats */}
          <View style={styles.statsRow}>
            <StatTile value={stats.total} label="Assigned" icon="briefcase-outline" tint={colors.primary} />
            <StatTile value={stats.in_progress} label="In Progress" icon="build-outline" tint={colors.warning} />
            <StatTile value={stats.overdue} label="Overdue" icon="alert-circle-outline" tint={colors.danger} />
          </View>

          {/* Quick actions */}
          <Text style={styles.quickTitle}>Quick Actions</Text>
          <View style={styles.actions}>
            {ACTIONS.map((a) => (
              <Pressable key={a.label} style={styles.action} onPress={() => router.push(a.href as never)}>
                <View style={[styles.actionIcon, { backgroundColor: a.tint + "1a" }]}>
                  <Ionicons name={a.icon} size={28} color={a.tint} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* My tickets */}
          <SectionHeader
            title="My Tickets"
            action={<Pressable onPress={() => router.push("/(tabs)/tickets")}><Text style={styles.link}>View all</Text></Pressable>}
          />
          {tickets.length === 0 ? (
            <View style={styles.emptyMini}>
              <Ionicons name="checkmark-done-circle-outline" size={26} color={colors.success} />
              <Text style={styles.emptyMiniText}>You&apos;re all caught up — no open tickets.</Text>
            </View>
          ) : (
            tickets.slice(0, 5).map((t) => (
              <TicketCard key={t.id} ticket={t} onPress={() => router.push(`/ticket/${t.id}`)} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  greeting: { fontSize: font.sm, color: colors.textMuted },
  name: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxxl },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl },
  quickTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  actions: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  action: { alignItems: "center", gap: 8, width: "23%" },
  actionIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  link: { fontSize: font.sm, color: colors.primary, fontWeight: "700" },
  emptyMini: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.lg },
  emptyMiniText: { flex: 1, fontSize: font.sm, color: "#047857", fontWeight: "500" },
});
