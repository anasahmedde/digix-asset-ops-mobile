import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(true);
  const lock = useRef(false);

  // Re-arm the scanner whenever the tab regains focus.
  useFocusEffect(useCallback(() => {
    setActive(true);
    lock.current = false;
    return () => setActive(false);
  }, []));

  function onScan(data: string) {
    if (lock.current) return;
    lock.current = true;
    setActive(false);
    router.push(`/asset/${encodeURIComponent(data.trim())}`);
  }

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <View style={styles.permIcon}><Ionicons name="camera-outline" size={34} color={colors.primary} /></View>
        <Text style={styles.permTitle}>Camera access</Text>
        <Text style={styles.permText}>Allow camera access to scan asset QR codes and barcodes.</Text>
        <Button title="Enable Camera" icon="camera" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.black}>
      {active && (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "ean13", "code39", "code93", "upc_a"] }}
          onBarcodeScanned={({ data }) => onScan(data)}
        />
      )}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>Scan asset QR / barcode</Text>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        {!active && (
          <Pressable style={styles.rescan} onPress={() => { lock.current = false; setActive(true); }}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.rescanText}>Scan again</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const C = "#fff";
const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: { position: "absolute", top: 70, color: "#fff", fontSize: font.body, fontWeight: "600" },
  frame: { width: 250, height: 250 },
  corner: { position: "absolute", width: 34, height: 34, borderColor: C },
  tl: { top: 0, left: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 12 },
  rescan: { position: "absolute", bottom: 80, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill },
  rescanText: { color: "#fff", fontWeight: "700", fontSize: font.body },
  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.bg },
  permIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  permTitle: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  permText: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 20 },
});
