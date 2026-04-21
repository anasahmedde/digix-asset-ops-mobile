import { View, Text, StyleSheet } from "react-native";

export default function TicketsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.empty}>No assigned tickets</Text>
      <Text style={styles.hint}>
        Tickets assigned to you will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  empty: { fontSize: 18, fontWeight: "600", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, textAlign: "center" },
});
