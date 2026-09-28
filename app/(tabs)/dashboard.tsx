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
  /** Shown to anyone holding this capability. Undefined = everyone. */
  capability?: string;
  target: Target;
}

// Mirrors the web sidebar. Each module names the capability that earns it,
// so changing what a role may do on the web changes this app too, without a
// release. Native targets use in-app screens; `web` targets open the
// embedded dashboard fallback until they are rebuilt natively.
const MODULES: Module[] = [
  { key: "assets", label: "Assets", icon: "hardware-chip-outline", tint: colors.primary, capability: "view_assets", target: { native: "/admin/assets" } },
  { key: "tickets", label: "Tickets", icon: "reader-outline", tint: "#f59e0b", capability: "view_tickets", target: { native: "/(tabs)/tickets" } },
  { key: "sites", label: "Sites", icon: "location-outline", tint: colors.violet, capability: "view_projects", target: { native: "/visits" } },
  { key: "clients", label: "Clients", icon: "business-outline", tint: "#0ea5e9", capability: "view_clients", target: { native: "/admin/clients" } },
  { key: "work-orders", label: "Work Orders", icon: "document-text-outline", tint: "#8b5cf6", capability: "view_projects", target: { native: "/admin/work-orders" } },
  { key: "installations", label: "Installations", icon: "layers-outline", tint: "#14b8a6", capability: "edit_installation", target: { native: "/installations" } },
  { key: "maintenance", label: "Maintenance", icon: "construct-outline", tint: "#f97316", capability: "manage_maintenance", target: { native: "/admin/maintenance" } },
  { key: "inventory", label: "Inventory", icon: "cube-outline", tint: "#22c55e", capability: "view_stock", target: { native: "/admin/inventory" } },
  { key: "procurement", label: "Procurement", icon: "cart-outline", tint: "#ef4444", capability: "raise_po", target: { native: "/admin/procurement" } },
  { key: "warranties", label: "Warranties", icon: "shield-checkmark-outline", tint: "#10b981", capability: "view_warranties", target: { native: "/admin/warranties" } },
  { key: "projects", label: "Projects", icon: "clipboard-outline", tint: "#6366f1", capability: "view_projects", target: { native: "/admin/projects" } },
  { key: "vendors", label: "Vendors", icon: "car-outline", tint: "#64748b", capability: "manage_suppliers", target: { native: "/admin/suppliers" } },
  { key: "reports", label: "Reports", icon: "bar-chart-outline", tint: "#0891b2", capability: "view_reports", target: { native: "/admin/reports" } },
  { key: "alerts", label: "Alerts", icon: "alert-circle-outline", tint: "#dc2626", capability: "view_reports", target: { native: "/admin/alerts" } },
  { key: "attendance", label: "Attendance", icon: "finger-print-outline", tint: "#059669", capability: "view_attendance", target: { native: "/attendance" } },
  { key: "documents", label: "Documents", icon: "folder-outline", tint: "#a855f7", capability: "view_reports", target: { native: "/admin/documents" } },
  { key: "teams", label: "Teams", icon: "people-outline", tint: "#3b82f6", capability: "view_team", target: { native: "/admin/teams" } },
  { key: "setup", label: "Setup", icon: "options-outline", tint: "#64748b", capability: "manage_setup", target: { web: "/setup", title: "Setup" } },
  { key: "settings", label: "Settings", icon: "settings-outline", tint: "#64748b", target: { native: "/admin/settings" } },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", group_head: "Group Head", ops_manager: "Operations Head",
  marketing_head: "Marketing Head", supervisor: "Supervisor", technician: "Technician",
  marketing: "Marketing", warehouse: "Warehouse Staff", finance: "Finance",
  client_viewer: "Client Viewer", vendor: "Vendor",
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
  const can = user?.capabilities ?? [];
  const modules = MODULES.filter((m) => !m.capability || can.includes(m.capability));
  // Company-wide asset figures are oversight, so they follow the same
  // capability the desktop uses for reporting — a technician sees their own
  // work, not the whole estate's numbers.
  const isManager = can.includes("view_reports");

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
            <Text style={styles.title}>Workspace</Text>
            <Text style={styles.subtitle}>{user?.full_name || user?.username}{role ? ` · ${ROLE_LABELS[role] || role}` : ""}</Text>
          </View>
          <Pressable style={styles.bell} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Company KPIs — oversight roles only */}
        {isManager && (
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
        )}

        {/* Modules */}
        <Text style={[styles.section, !isManager && { marginTop: 0 }]}>Modules</Text>
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
        {/* Only worth saying when this person can actually see one. */}
        {modules.some((m) => "web" in m.target) && (
          <Text style={styles.hint}>Modules with a dot open the web view for now — being rebuilt natively.</Text>
        )}
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
