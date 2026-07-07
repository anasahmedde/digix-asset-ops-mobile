import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { logout } from "@/lib/auth";
import { ROLE_LABELS, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const initials =
    user?.full_name?.trim()?.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() ||
    user?.username?.slice(0, 2).toUpperCase() ||
    "?";

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.name}>{user?.full_name || user?.username || "—"}</Text>
      {user?.role ? (
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Row label="Username" value={user?.username ?? "—"} />
        <Row label="Email" value={user?.email || "—"} />
        <Row label="Phone" value={user?.phone || "—"} />
        <Row label="Field staff" value={user?.is_field_staff ? "Yes" : "No"} />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, alignItems: "center", padding: 24, backgroundColor: "#f5f5f5" },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: "#2563eb",
    justifyContent: "center", alignItems: "center", marginTop: 24,
  },
  avatarText: { color: "#fff", fontSize: 30, fontWeight: "bold" },
  name: { fontSize: 20, fontWeight: "bold", color: "#111", marginTop: 14 },
  roleBadge: { backgroundColor: "#2563eb22", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, marginTop: 8 },
  roleText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  card: {
    width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 8, marginTop: 28,
    borderWidth: 1, borderColor: "#eee",
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#888" },
  rowValue: { fontSize: 14, color: "#111", fontWeight: "600" },
  logoutButton: {
    borderWidth: 1, borderColor: "#dc2626", borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 40, marginTop: "auto", marginBottom: 12,
  },
  logoutText: { color: "#dc2626", fontSize: 16, fontWeight: "600" },
});
