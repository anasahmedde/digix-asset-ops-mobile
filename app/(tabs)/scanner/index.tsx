import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import api from "@/lib/api";
import { Device, STATUS_COLORS, labelize } from "@/lib/types";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function handleScan(code: string) {
    if (scannedCode) return; // ignore rapid duplicate frames
    setScannedCode(code);
    setLoading(true);
    setNotFound(false);
    setDevice(null);
    try {
      const { data } = await api.get(`/assets/devices/?search=${encodeURIComponent(code)}`);
      const results = data.results ?? data;
      if (results.length > 0) setDevice(results[0]);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setScannedCode(null);
    setDevice(null);
    setNotFound(false);
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.hint}>Grant camera permission to scan asset QR / barcodes.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (scannedCode) {
    return (
      <View style={styles.resultWrap}>
        {loading ? (
          <ActivityIndicator color="#2563eb" size="large" />
        ) : device ? (
          <View style={styles.card}>
            <Text style={styles.assetCode}>{device.asset_code}</Text>
            {device.display_name ? <Text style={styles.assetName}>{device.display_name}</Text> : null}
            <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[device.status] ?? "#6b7280") + "22" }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLORS[device.status] ?? "#6b7280" }]}>
                {labelize(device.status)}
              </Text>
            </View>
            <Row label="Type" value={device.asset_type_name ?? device.device_model_name ?? "—"} />
            <Row label="Serial" value={device.serial_number} />
            <Row label="Site" value={device.site_name ?? "—"} />
            <Row label="Client" value={device.client_name ?? "—"} />
            <Row label="Warranty" value={device.warranty_status ? labelize(device.warranty_status) : "—"} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>No asset found</Text>
            <Text style={styles.hint}>Code scanned: {scannedCode}</Text>
            {notFound ? <Text style={styles.hint}>No device matches this code.</Text> : null}
          </View>
        )}
        <TouchableOpacity style={styles.button} onPress={reset}>
          <Text style={styles.buttonText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "ean13", "code39"] }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.overlayText}>Point at an asset label</Text>
      </View>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: "#fff", borderRadius: 16 },
  overlayText: { color: "#fff", marginTop: 16, fontSize: 14, fontWeight: "600" },
  resultWrap: { flex: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#eee" },
  assetCode: { fontSize: 22, fontWeight: "bold", color: "#111" },
  assetName: { fontSize: 15, color: "#555", marginTop: 2 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f2f2f2", marginTop: 8 },
  rowLabel: { fontSize: 13, color: "#888" },
  rowValue: { fontSize: 13, color: "#111", fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  title: { fontSize: 18, fontWeight: "600", color: "#111", textAlign: "center" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, textAlign: "center" },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
