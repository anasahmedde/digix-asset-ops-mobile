import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { logout } from "@/lib/auth";

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.hint}>Manage your account settings.</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "bold", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, marginBottom: 32 },
  logoutButton: {
    borderWidth: 1, borderColor: "#dc2626", borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  logoutText: { color: "#dc2626", fontSize: 16, fontWeight: "600" },
});
