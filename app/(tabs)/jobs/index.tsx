import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Wash } from "@/components/field";
import { Text } from "@/components/text";
import { Card, Chip, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { InstallationJob, MaintenanceJob, isOpenInstallation, isOpenMaintenance, myInstallations, myMaintenance } from "@/lib/jobs";
import { getCurrentUser } from "@/lib/user";

type Tab = "installations" | "maintenance" | "done";

/** Every job assigned to this person: installations, maintenance, and what is done. */
export default function JobsScreen() {
  const [tab, setTab] = useState<Tab>("installations");
  const [installs, setInstalls] = useState<InstallationJob[]>([]);
  const [jobs, setJobs] = useState<MaintenanceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      const [i, m] = await Promise.allSettled([myInstallations(me.id), myMaintenance(me.id)]);
      if (i.status === "fulfilled") setInstalls(i.value);
      if (m.status === "fulfilled") setJobs(m.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openI = installs.filter(isOpenInstallation);
  const openM = jobs.filter(isOpenMaintenance);
  const doneI = installs.filter((j) => !isOpenInstallation(j));
  const doneM = jobs.filter((j) => !isOpenMaintenance(j));

  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Jobs</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          <Chip label={`Installations ${openI.length}`} active={tab === "installations"} onPress={() => setTab("installations")} />
          <Chip label={`Maintenance ${openM.length}`} active={tab === "maintenance"} onPress={() => setTab("maintenance")} />
          <Chip label={`Done ${doneI.length + doneM.length}`} active={tab === "done"} onPress={() => setTab("done")} />
        </ScrollView>
        {loading ? <Loading /> : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {tab === "installations" && (openI.length ? openI.map((j) => <InstallCard key={j.id} j={j} />) : <EmptyState icon="layers-outline" title="No installations" subtitle="Assets assigned to you for installation appear here." />)}
            {tab === "maintenance" && (openM.length ? openM.map((j) => <JobCard key={j.id} j={j} />) : <EmptyState icon="construct-outline" title="No maintenance jobs" subtitle="Corrective and preventive jobs assigned to you appear here." />)}
            {tab === "done" && (doneI.length + doneM.length ? (
              <>
                {doneI.map((j) => <InstallCard key={j.id} j={j} />)}
                {doneM.map((j) => <JobCard key={j.id} j={j} />)}
              </>
            ) : <EmptyState icon="checkmark-done-outline" title="Nothing finished yet" />)}
          </ScrollView>
        )}
      </SafeAreaView>
    </Wash>
  );
}

function InstallCard({ j }: { j: InstallationJob }) {
  const today = new Date().toISOString().slice(0, 10);
  const late = !j.completed_at && !!j.due_date && j.due_date < today;
  return (
    <Card style={styles.card} onPress={() => router.push(`/installation/${j.id}`)}>
      <View style={styles.row}>
        <View style={styles.icon}><Ionicons name="layers-outline" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{j.device_code}</Text>
          <Text style={styles.name} numberOfLines={1}>{j.device_name}</Text>
        </View>
        {j.completed_at ? <Pill label="Done" fg="#047857" bg={colors.successSoft} /> : <Pill label={`${j.progress ?? 0}%`} fg={colors.primary} bg={colors.primarySoft} />}
      </View>
      <View style={styles.meta}>
        <Ionicons name="location-outline" size={13} color={colors.textLight} />
        <Text style={styles.metaText} numberOfLines={1}>{j.helping ? "Helping · " : ""}{j.site_name}{j.position_label ? ` · ${j.position_label}` : ""}</Text>
        {j.due_date ? <Text style={[styles.metaText, late && { color: colors.danger, fontWeight: "700" }]}>· due {j.due_date}</Text> : null}
      </View>
    </Card>
  );
}

function JobCard({ j }: { j: MaintenanceJob }) {
  const fault = j.maintenance_type === "corrective";
  return (
    <Card style={styles.card} onPress={() => router.push(`/job/${j.id}`)}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: fault ? colors.dangerSoft : colors.warningSoft }]}>
          <Ionicons name={fault ? "flash-outline" : "refresh-outline"} size={18} color={fault ? colors.danger : "#b45309"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{j.ticket_number ?? j.device_code ?? "Preventive"}</Text>
          <Text style={styles.name} numberOfLines={1}>{j.title}</Text>
        </View>
        <Pill label={j.status_display} fg={j.status === "in_process" ? "#b45309" : colors.textMuted} bg={j.status === "in_process" ? colors.warningSoft : colors.secondary} />
      </View>
      <View style={styles.meta}>
        <Ionicons name="location-outline" size={13} color={colors.textLight} />
        <Text style={styles.metaText} numberOfLines={1}>{j.helping ? "Helping · " : ""}{j.site_name ?? "No site"}{j.device_code ? ` · ${j.device_code}` : ""}</Text>
        {j.next_due ? <Text style={styles.metaText}>· due {j.next_due}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  card: { marginBottom: spacing.sm, padding: spacing.md, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  code: { fontSize: font.xs, fontWeight: "700", color: colors.primary },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaText: { fontSize: font.xs, color: colors.textMuted },
});
