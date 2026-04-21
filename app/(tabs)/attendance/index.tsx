import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function AttendanceScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.hint}>
        Tap below to check in with GPS verification.
      </Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Check In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "bold", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, marginBottom: 32, textAlign: "center" },
  button: {
    backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 16,
    paddingHorizontal: 48, elevation: 2,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
