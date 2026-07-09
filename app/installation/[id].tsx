import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";

interface Step {
  id: string;
  step_type: string;
  step_type_display: string;
  step_number: number;
  status: string;
  status_display: string;
  started_at: string | null;
  completed_at: string | null;
}
interface Photo { id: string; photo_type: string; image: string; caption: string }
interface Installation {
  id: string;
  device_code: string;
  device_name: string;
  site_name: string;
  position_label: string;
  progress: number;
  installed_at: string;
  steps: Step[];
  photos: Photo[];
}

const STATUS_TONE: Record<string, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_started: { fg: colors.textMuted, bg: colors.border, icon: "ellipse-outline" },
  in_progress: { fg: "#b45309", bg: "#fef3c7", icon: "time" },
  completed: { fg: "#047857", bg: colors.successSoft, icon: "checkmark-circle" },
  skipped: { fg: colors.textLight, bg: colors.border, icon: "remove-circle-outline" },
};
// Tapping a step cycles it forward through the pipeline.
const NEXT_STATUS: Record<string, string> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "not_started",
  skipped: "not_started",
};

export default function InstallationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inst, setInst] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/sites/installations/${id}/`);
      setInst(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function advanceStep(step: Step) {
    if (busy) return;
    setBusy(step.id);
    const next = NEXT_STATUS[step.status] ?? "in_progress";
    try {
      await api.patch(`/sites/installation-steps/${step.id}/`, { status: next });
      await load();
    } catch {
      toast.error("Could not update step");
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const result = perm.granted
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      const fd = new FormData();
      fd.append("installation", String(id));
      fd.append("photo_type", "post_install");
      fd.append("image", { uri: result.assets[0].uri, name: "install.jpg", type: "image/jpeg" } as never);
      await api.post("/sites/installation-photos/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Photo added");
      await load();
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <Loading />;
  if (!inst) return <SafeAreaView style={styles.safe}><Text style={styles.err}>Installation not found.</Text></SafeAreaView>;

  const done = inst.steps.filter((s) => s.status === "completed").length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Header */}
        <Text style={styles.code}>{inst.device_code}</Text>
        <Text style={styles.sub}>{inst.device_name}</Text>
        <View style={styles.siteLine}>
          <Ionicons name="location-outline" size={14} color={colors.textLight} />
          <Text style={styles.site}>{inst.site_name}{inst.position_label ? ` · ${inst.position_label}` : ""}</Text>
        </View>

        {/* Progress */}
        <Card style={{ marginTop: spacing.lg, gap: 8 }}>
          <View style={styles.progHead}>
            <Text style={styles.progLabel}>Installation progress</Text>
            <Text style={styles.progPct}>{inst.progress}%</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${inst.progress}%` }]} /></View>
          <Text style={styles.progSub}>{done} of {inst.steps.length} steps completed</Text>
        </Card>

        {/* Steps */}
        <Text style={styles.section}>Steps</Text>
        <Text style={styles.hint}>Tap a step to advance it (Not started → In progress → Completed).</Text>
        {inst.steps.map((s) => {
          const tone = STATUS_TONE[s.status] ?? STATUS_TONE.not_started;
          return (
            <Card key={s.id} style={{ marginBottom: spacing.sm }} onPress={() => advanceStep(s)}>
              <View style={styles.stepRow}>
                <View style={[styles.stepNum, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.stepNumText, { color: tone.fg }]}>{s.step_number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepName}>{s.step_type_display}</Text>
                  <View style={styles.statusRow}>
                    <Ionicons name={tone.icon} size={14} color={tone.fg} />
                    <Text style={[styles.statusText, { color: tone.fg }]}>{busy === s.id ? "Updating…" : s.status_display}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
            </Card>
          );
        })}

        {/* Photos */}
        <View style={styles.photoHead}>
          <Text style={styles.section}>Photos</Text>
          <Button title={uploading ? "Uploading…" : "Add photo"} icon="camera" small loading={uploading} onPress={addPhoto} />
        </View>
        {inst.photos.length === 0 ? (
          <Card><Text style={styles.empty}>No photos yet. Capture the install for the record.</Text></Card>
        ) : (
          <View style={styles.photoGrid}>
            {inst.photos.map((p) => (
              <Image key={p.id} source={{ uri: p.image }} style={styles.photo} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  code: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  siteLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  site: { fontSize: font.sm, color: colors.textMuted },
  progHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progLabel: { fontSize: font.body, fontWeight: "700", color: colors.text },
  progPct: { fontSize: font.h3, fontWeight: "800", color: colors.primary },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  progSub: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: 4 },
  hint: { fontSize: font.xs, color: colors.textLight, marginBottom: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepNum: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: font.body, fontWeight: "800" },
  stepName: { fontSize: font.body, fontWeight: "700", color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusText: { fontSize: font.sm, fontWeight: "600" },
  photoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  empty: { fontSize: font.sm, color: colors.textMuted },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.border },
});
