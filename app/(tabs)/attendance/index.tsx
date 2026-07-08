import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";

interface CheckIn {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  at: Date;
}

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [error, setError] = useState("");

  async function handleCheckIn() {
    setError("");
    setLoading(true);
    try {
      const granted = await requestForegroundLocationPermission();
      if (!granted) {
        setError("Location permission is required to check in.");
        return;
      }
      const loc = await getCurrentLocation();
      setCheckIn({ latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, at: new Date() });
    } catch {
      setError("Could not read your location. Try again outdoors.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.hint}>Capture your GPS check-in for the current site visit.</Text>

      {checkIn && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Checked in</Text>
          <Text style={styles.time}>{checkIn.at.toLocaleString()}</Text>
          <Text style={styles.coords}>
            {checkIn.latitude.toFixed(6)}, {checkIn.longitude.toFixed(6)}
          </Text>
          {checkIn.accuracy != null && (
            <Text style={styles.accuracy}>±{Math.round(checkIn.accuracy)} m accuracy</Text>
          )}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleCheckIn} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{checkIn ? "Check In Again" : "Check In"}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>Location is captured on-device; server sync arrives with the attendance module.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "bold", color: "#111" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, marginBottom: 24, textAlign: "center" },
  card: {
    width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: "#eee", alignItems: "center",
  },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#10b981", textTransform: "uppercase" },
  time: { fontSize: 16, fontWeight: "600", color: "#111", marginTop: 6 },
  coords: { fontSize: 15, color: "#333", marginTop: 8, fontVariant: ["tabular-nums"] },
  accuracy: { fontSize: 12, color: "#888", marginTop: 4 },
  error: { color: "#dc2626", fontSize: 13, marginBottom: 12, textAlign: "center" },
  button: {
    backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 48,
    alignItems: "center", minWidth: 200,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  note: { fontSize: 11, color: "#aaa", marginTop: 20, textAlign: "center" },
});
