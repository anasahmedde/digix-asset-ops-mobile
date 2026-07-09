import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Loading } from "@/components/ui";
import { colors, font, radius, shadow, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { User } from "@/lib/types";

type IconName = keyof typeof Ionicons.glyphMap;
type Target = { native: string } | { web: string; title: string };

interface Module {
  key: string;
  label: string;
  icon: IconName;
  tint: string;
  roles?: string[]; // undefined = everyone
  target: Target;
}

// Mirrors the web sidebar (role gates + sections). Native targets use in-app screens;
// `web` targets open the embedded dashboard fallback until they're rebuilt natively.
const MODULES: Module[] = [
  { key: "assets", label: "Assets", icon: "hardware-chip-outline", tint: colors.primary, roles: ["super_admin", "ops_manager", "technician"], target: { native: "/admin/assets" } },
  { key: "tickets", label: "Tickets", icon: "reader-outline", tint: "#f59e0b", roles: ["super_admin", "ops_manager", "supervisor", "technician"], target: { native: "/(tabs)/tickets" } },
  { key: "sites", label: "Sites", icon: "location-outline", tint: colors.violet, roles: ["super_admin", "ops_manager", "technician"], target: { native: "/visits" } },
  { key: "clients", label: "Clients", icon: "business-outline", tint: "#0ea5e9", roles: ["super_admin", "ops_manager", "client_viewer"], target: { native: "/admin/clients" } },
  { key: "work-orders", label: "Work Orders", icon: "document-text-outline", tint: "#8b5cf6", roles: ["super_admin", "ops_manager"], target: { native: "/admin/work-orders" } },
  { key: "installations", label: "Installations", icon: "layers-outline", tint: "#14b8a6", roles: ["super_admin", "ops_manager", "technician"], target: { web: "/installation-tracker", title: "Installation Tracker" } },
  { key: "maintenance", label: "Maintenance", icon: "construct-outline", tint: "#f97316", roles: ["super_admin", "ops_manager", "technician"], target: { native: "/admin/maintenance" } },
  { key: "inventory", label: "Inventory", icon: "cube-outline", tint: "#22c55e", roles: ["super_admin", "ops_manager", "warehouse"], target: { native: "/admin/inventory" } },
  { key: "procurement", label: "Procurement", icon: "cart-outline", tint: "#ef4444", roles: ["super_admin", "ops_manager", "finance"], target: { native: "/admin/procurement" } },
  { key: "warranties", label: "Warranties", icon: "shield-checkmark-outline", tint: "#10b981", roles: ["super_admin", "ops_manager"], target: { web: "/warranties", title: "Warranties" } },
  { key: "projects", label: "Projects", icon: "clipboard-outline", tint: "#6366f1", roles: ["super_admin", "ops_manager"], target: { web: "/projects", title: "Projects" } },
  { key: "vendors", label: "Vendors", icon: "car-outline", tint: "#64748b", roles: ["super_admin", "ops_manager"], target: { native: "/admin/suppliers" } },
  { key: "reports", label: "Reports", icon: "bar-chart-outline", tint: "#0891b2", roles: ["super_admin", "ops_manager", "finance"], target: { web: "/reports", title: "Reports" } },
  { key: "alerts", label: "Alerts", icon: "alert-circle-outline", tint: "#dc2626", roles: ["super_admin", "ops_manager"], target: { web: "/alerts", title: "Alerts" } },
  { key: "attendance", label: "Attendance", icon: "finger-print-outline", tint: "#059669", roles: ["super_admin", "ops_manager", "supervisor"], target: { native: "/attendance" } },
  { key: "documents", label: "Documents", icon: "folder-outline", tint: "#a855f7", roles: ["super_admin", "ops_manager"], target: { web: "/documents", title: "Documents" } },
  { key: "teams", label: "Teams", icon: "people-outline", tint: "#3b82f6", roles: ["super_admin"], target: { web: "/teams", title: "Teams" } },
  { key: "setup", label: "Setup", icon: "options-outline", tint: "#64748b", roles: ["super_admin", "ops_manager"], target: { web: "/setup", title: "Setup" } },
  { key: "settings", label: "Settings", icon: "settings-outline", tint: "#64748b", target: { web: "/settings", title: "Settings" } },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", ops_manager: "Ops Manager", supervisor: "Supervisor",
  technician: "Technician", warehouse: "Warehouse", finance: "Finance", client_viewer: "Client",
};

export default function DashboardHub() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{ total: number; working: number; installed: number; out_of_order: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, s] = await Promise.allSettled([getCurrentUser(), api.get("/assets/devices/dashboard_stats/")]);
      if (u.status === "fulfilled") setUser(u.value);
      if (s.status === "fulfilled") setStats(s.value.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function open(m: Module) {
    if ("native" in m.target) router.push(m.target.native as never);
    else router.push({ pathname: "/web-view", params: { path: m.target.web, title: m.target.title } } as never);
  }

  if (loading) return <Loading />;

  const role = user?.role ?? "";
  const modules = MODULES.filter((m) => !m.roles || m.roles.includes(role));

  const kpis = [
    { label: "Total Screens", value: stats?.total ?? 0, icon: "tv-outline" as IconName, tint: colors.primary },
    { label: "Working", value: stats?.working ?? 0, icon: "checkmark-circle-outline" as IconName, tint: colors.success },
    { label: "Installed", value: stats?.installed ?? 0, icon: "cube-outline" as IconName, tint: colors.info },
    { label: "Out of Order", value: stats?.out_of_order ?? 0, icon: "alert-circle-outline" as IconName, tint: colors.danger },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>{user?.full_name || user?.username}{role ? ` · ${ROLE_LABELS[role] || role}` : ""}</Text>
          </View>
          <Pressable style={styles.bell} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <View style={[styles.kpiIcon, { backgroundColor: k.tint + "1a" }]}>
                <Ionicons name={k.icon} size={18} color={k.tint} />
              </View>
              <Text style={styles.kpiValue}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Modules */}
        <Text style={styles.section}>Modules</Text>
        <View style={styles.modGrid}>
          {modules.map((m) => (
            <Pressable key={m.key} style={styles.modCard} onPress={() => open(m)}>
              <View style={[styles.modIcon, { backgroundColor: m.tint + "1a" }]}>
                <Ionicons name={m.icon} size={24} color={m.tint} />
              </View>
              <Text style={styles.modLabel} numberOfLines={1}>{m.label}</Text>
              {"web" in m.target && <View style={styles.webDot} />}
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Modules with a dot open the web view for now — being rebuilt natively.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const GAP = spacing.md;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  title: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  bell: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", ...shadow.card },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginBottom: spacing.lg },
  kpiCard: { width: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiValue: { fontSize: 24, fontWeight: "800", color: colors.text },
  kpiLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
  modGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  modCard: { width: "30%", flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", gap: 8, ...shadow.card },
  modIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modLabel: { fontSize: font.xs, fontWeight: "700", color: colors.text, textAlign: "center" },
  webDot: { position: "absolute", top: 10, right: 10, width: 7, height: 7, borderRadius: 999, backgroundColor: colors.textLight },
  hint: { fontSize: font.xs, color: colors.textLight, marginTop: spacing.md, textAlign: "center" },
});
