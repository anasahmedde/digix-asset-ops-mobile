import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";

interface CheckIn { latitude: number; longitude: number; accuracy: number | null; at: Date }

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [error, setError] = useState("");

  async function handleCheckIn() {
    setError("");
    setLoading(true);
    try {
      const granted = await requestForegroundLocationPermission();
      if (!granted) { setError("Location permission is required to check in."); return; }
      const loc = await getCurrentLocation();
      setCheckIn({ latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, at: new Date() });
    } catch { setError("Could not read your location. Try again outdoors."); }
    finally { setLoading(false); }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={[styles.ring, checkIn && { borderColor: colors.success, backgroundColor: colors.successSoft }]}>
          <Ionicons name={checkIn ? "checkmark" : "time-outline"} size={44} color={checkIn ? colors.success : colors.primary} />
        </View>
        <Text style={styles.status}>{checkIn ? "Checked In" : "Not Checked In"}</Text>
        <Text style={styles.sub}>{checkIn ? "Your GPS location was captured." : "Tap below to check in with GPS verification."}</Text>
      </View>

      {checkIn && (
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.line}><Ionicons name="time-outline" size={16} color={colors.textMuted} /><Text style={styles.lineText}>{checkIn.at.toLocaleString()}</Text></View>
          <View style={styles.line}><Ionicons name="location-outline" size={16} color={colors.textMuted} /><Text style={styles.lineText}>{checkIn.latitude.toFixed(6)}, {checkIn.longitude.toFixed(6)}</Text></View>
          {checkIn.accuracy != null && <View style={styles.line}><Ionicons name="navigate-outline" size={16} color={colors.textMuted} /><Text style={styles.lineText}>±{Math.round(checkIn.accuracy)} m accuracy</Text></View>}
        </Card>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title={checkIn ? "Check In Again" : "Check In Now"} icon="finger-print" loading={loading} onPress={handleCheckIn} variant={checkIn ? "secondary" : "primary"} />
      <Text style={styles.note}>Location is captured on-device. Server sync arrives with the attendance module.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: spacing.xl },
  ring: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  status: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", marginTop: 6, lineHeight: 20 },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 7 },
  lineText: { fontSize: font.sm, color: colors.text, fontWeight: "500" },
  error: { color: colors.danger, fontSize: font.sm, textAlign: "center", marginBottom: spacing.md },
  note: { fontSize: font.xs, color: colors.textLight, textAlign: "center", marginTop: spacing.lg, lineHeight: 16 },
});
