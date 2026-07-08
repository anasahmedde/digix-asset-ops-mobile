import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, Button, Card, Loading, Row } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { logout } from "@/lib/auth";
import { ROLE_LABELS, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

type IconName = keyof typeof Ionicons.glyphMap;
const MENU: { label: string; icon: IconName; href: string; tint: string }[] = [
  { label: "Attendance", icon: "time-outline", href: "/attendance", tint: colors.success },
  { label: "Site Visits", icon: "map-outline", href: "/visits", tint: colors.violet },
  { label: "Notifications", icon: "notifications-outline", href: "/notifications", tint: colors.warning },
  { label: "Messages", icon: "chatbubbles-outline", href: "/(tabs)/messages", tint: colors.primary },
];

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getCurrentUser().then(setUser).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={user?.full_name || user?.username} size={84} />
          <Text style={styles.name}>{user?.full_name || user?.username || "—"}</Text>
          {user?.role ? <View style={styles.roleBadge}><Text style={styles.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text></View> : null}
        </View>

        <Card style={{ marginTop: spacing.xl }}>
          <Row label="Username" value={user?.username || "—"} />
          <Row label="Email" value={user?.email || "—"} />
          <Row label="Phone" value={user?.phone || "—"} />
          <Row label="Field staff" value={user?.is_field_staff ? "Yes" : "No"} />
        </Card>

        <Text style={styles.section}>Shortcuts</Text>
        <View style={styles.menu}>
          {MENU.map((m, i) => (
            <Pressable key={m.label} style={[styles.menuRow, i < MENU.length - 1 && styles.menuBorder]} onPress={() => router.push(m.href as never)}>
              <View style={[styles.menuIcon, { backgroundColor: m.tint + "1a" }]}><Ionicons name={m.icon} size={18} color={m.tint} /></View>
              <Text style={styles.menuLabel}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </Pressable>
          ))}
        </View>

        <Button title="Sign Out" icon="log-out-outline" variant="danger" onPress={logout} style={{ marginTop: spacing.xl }} />
        <Text style={styles.version}>DIGIX Field · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  head: { alignItems: "center", marginTop: spacing.lg },
  name: { fontSize: font.h2, fontWeight: "800", color: colors.text, marginTop: spacing.md },
  roleBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5, marginTop: spacing.sm },
  roleText: { color: colors.primary, fontSize: font.sm, fontWeight: "700" },
  section: { fontSize: font.sm, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: 4 },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: font.body, fontWeight: "600", color: colors.text },
  version: { textAlign: "center", fontSize: font.xs, color: colors.textLight, marginTop: spacing.xl },
});
