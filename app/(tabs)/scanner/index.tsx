import { View, Text, StyleSheet } from "react-native";

export default function ScannerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Asset Scanner</Text>
      <Text style={styles.hint}>
        Scan QR codes or barcodes on device labels to view asset details.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "bold", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, textAlign: "center" },
});
