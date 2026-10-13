import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/text";
import { Button } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";

/**
 * A full-screen scanner that hands back the first code it reads. The job
 * screens use it to prove the technician is standing at the right asset
 * before any of their buttons open.
 */
export function ScanSheet({ open, expect, onScan, onClose }: {
  open: boolean; expect: string; onScan: (code: string) => void; onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);

  useEffect(() => {
    if (open) lock.current = false;
  }, [open]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.black}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39"] }}
            onBarcodeScanned={({ data }) => {
              if (lock.current) return;
              lock.current = true;
              onScan(data.trim());
            }}
          />
        ) : (
          <SafeAreaView style={styles.perm}>
            <Ionicons name="camera-outline" size={34} color="#fff" />
            <Text style={styles.permText}>Allow the camera to scan the asset's label.</Text>
            <Button title="Enable camera" icon="camera" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
          </SafeAreaView>
        )}
        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.close} hitSlop={10}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.top}>
            <Text style={styles.hint}>Scan the label on the asset</Text>
            <Text style={styles.expect}>{expect}</Text>
          </View>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const C = "#fff";
const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  close: { position: "absolute", top: 54, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", top: 110, alignItems: "center", gap: 4 },
  hint: { color: C, fontSize: font.body, fontWeight: "600" },
  expect: { color: "#8fe0bd", fontSize: font.h2, fontWeight: "800", letterSpacing: 1 },
  frame: { width: 250, height: 250 },
  corner: { position: "absolute", width: 34, height: 34, borderColor: C },
  tl: { top: 0, left: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 12 },
  perm: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  permText: { color: C, fontSize: font.sm, textAlign: "center", marginTop: 8, lineHeight: 20 },
});
