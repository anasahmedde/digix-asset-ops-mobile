import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View,
} from "react-native";

import { Button, Card } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { timeOnly } from "@/lib/format";
import { toast } from "@/lib/toast";
import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";
import { AttendanceRecord } from "@/lib/types";

interface SiteOpt { id: string; name: string }

export default function AttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [last, setLast] = useState<AttendanceRecord | null>(null);
  const [today, setToday] = useState<AttendanceRecord[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [site, setSite] = useState<SiteOpt | null>(null);
  const [pickSite, setPickSite] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, td] = await Promise.allSettled([
        api.get("/attendance/records/status/"),
        api.get("/attendance/records/today/"),
      ]);
      if (st.status === "fulfilled") { setCheckedIn(st.value.data.checked_in); setLast(st.value.data.last); }
      if (td.status === "fulfilled") setToday(td.value.data.records ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api.get("/sites/sites/", { params: { is_active: true, page_size: 200 } })
      .then((r) => setSites((r.data.results ?? r.data).map((s: SiteOpt) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, [load]);

  async function punch() {
    setBusy(true);
    try {
      const granted = await requestForegroundLocationPermission();
      if (!granted) { toast.error("Location permission is required"); return; }
      const loc = await getCurrentLocation();
      await api.post("/attendance/records/", {
        check_type: checkedIn ? "check_out" : "check_in",
        latitude: loc.latitude.toFixed(7),
        longitude: loc.longitude.toFixed(7),
        accuracy: loc.accuracy,
        site: site?.id ?? null,
      });
      toast.success(checkedIn ? "Checked out" : "Checked in");
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not record attendance");
    } finally { setBusy(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={[styles.ring, checkedIn && { borderColor: colors.success, backgroundColor: colors.successSoft }]}>
          <Ionicons name={checkedIn ? "checkmark-done" : "finger-print"} size={42} color={checkedIn ? colors.success : colors.primary} />
        </View>
        <Text style={styles.status}>{checkedIn ? "You're Checked In" : "Not Checked In"}</Text>
        {last ? <Text style={styles.sub}>Last: {last.check_type_display} at {timeOnly(last.created_at)}{last.site_name ? ` · ${last.site_name}` : ""}</Text> : <Text style={styles.sub}>Tap below to check in with GPS.</Text>}
      </View>

      <Pressable style={styles.siteRow} onPress={() => setPickSite(true)}>
        <Ionicons name="location-outline" size={18} color={colors.textMuted} />
        <Text style={styles.siteText}>{site ? site.name : "Select site (optional)"}</Text>
        {site ? <Ionicons name="close-circle" size={18} color={colors.textLight} onPress={() => setSite(null)} /> : <Ionicons name="chevron-forward" size={18} color={colors.textLight} />}
      </Pressable>

      <Button
        title={busy ? "Recording…" : checkedIn ? "Check Out" : "Check In"}
        icon={checkedIn ? "log-out-outline" : "finger-print"}
        variant={checkedIn ? "danger" : "primary"}
        loading={busy}
        onPress={punch}
      />

      <Text style={styles.todayTitle}>Today</Text>
      <FlatList
        data={today}
        keyExtractor={(r) => r.id}
        contentContainerStyle={today.length === 0 ? undefined : { gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.empty}>No check-ins yet today.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.rec}>
            <View style={[styles.dot, { backgroundColor: item.check_type === "check_in" ? colors.success : colors.textMuted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.recType}>{item.check_type_display}{item.site_name ? ` · ${item.site_name}` : ""}</Text>
              {item.latitude ? <Text style={styles.recGeo}>{Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}</Text> : null}
            </View>
            <Text style={styles.recTime}>{timeOnly(item.created_at)}</Text>
          </Card>
        )}
      />

      <Modal visible={pickSite} animationType="slide" transparent onRequestClose={() => setPickSite(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Select Site</Text>
              <Pressable onPress={() => setPickSite(false)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <FlatList
              data={sites}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable style={styles.siteOpt} onPress={() => { setSite(item); setPickSite(false); }}>
                  <Text style={styles.siteOptText}>{item.name}</Text>
                  {site?.id === item.id ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  wrap: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  hero: { alignItems: "center", marginTop: spacing.md, marginBottom: spacing.lg },
  ring: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  status: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", marginTop: 6 },
  siteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 48, marginBottom: spacing.md },
  siteText: { flex: 1, fontSize: font.sm, color: colors.text },
  todayTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { fontSize: font.sm, color: colors.textLight, paddingVertical: spacing.md },
  rec: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  recType: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  recGeo: { fontSize: font.xs, color: colors.textLight, marginTop: 2 },
  recTime: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  siteOpt: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  siteOptText: { fontSize: font.body, color: colors.text },
});
