import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Wash } from "@/components/field";
import { OutboxBanner } from "@/components/outbox-banner";
import { Text } from "@/components/text";
import { Avatar, Button, Card, IconButton, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Duty, Presence, checkOut, getDuty, getPresence, timeInOut } from "@/lib/attendance";
import { dayLabel, greeting, timeAgo, timeOnly } from "@/lib/format";
import { InstallationJob, MaintenanceJob, isOpenInstallation, isOpenMaintenance, myInstallations, myMaintenance } from "@/lib/jobs";
import { QUEUED_NOTE } from "@/lib/offline";
import { toast } from "@/lib/toast";
import { User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

/** Today: Time in / Time out, where you are clocked in, what is waiting, and the notices. */
export default function TodayScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [installs, setInstalls] = useState<InstallationJob[]>([]);
  const [jobs, setJobs] = useState<MaintenanceJob[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duty, setDuty] = useState<Duty | null>(null);
  const [dutyBusy, setDutyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      setUser(me);
      const [p, i, m, n, d] = await Promise.allSettled([
        getPresence(), myInstallations(me.id), myMaintenance(me.id),
        api.get("/notifications/notifications/unread_count/"),
        me.is_field_staff ? getDuty() : Promise.resolve(null),
      ]);
      if (d.status === "fulfilled") setDuty(d.value);
      if (p.status === "fulfilled") setPresence(p.value);
      if (i.status === "fulfilled") setInstalls(i.value.filter(isOpenInstallation));
      if (m.status === "fulfilled") setJobs(m.value.filter(isOpenMaintenance));
      if (n.status === "fulfilled") setUnread(n.value.data.count ?? 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function leaveSite() {
    setBusy(true);
    try {
      const p = await checkOut(presence?.site ?? null);
      setPresence(p);
      toast.success(p.queued ? `Checked out. ${QUEUED_NOTE}` : "Checked out");
    } catch {
      toast.error("Could not check out");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDuty() {
    const kind = duty?.on_duty ? "time_out" : "time_in";
    setDutyBusy(true);
    try {
      const d = await timeInOut(kind);
      setDuty(d);
      const said = kind === "time_in" ? "Timed in" : "Timed out";
      toast.success(d.queued ? `${said}. ${QUEUED_NOTE}` : said);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(msg ?? (kind === "time_in" ? "Could not time in" : "Could not time out"));
    } finally {
      setDutyBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = installs.filter((j) => j.due_date && j.due_date <= today).length
    + jobs.filter((j) => j.next_due && j.next_due <= today).length;
  const awaiting = jobs.filter((j) => j.status === "in_process").length;

  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>{greeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>{user?.full_name || user?.username || "…"}</Text>
          </View>
          <IconButton name="notifications-outline" badge={unread} onPress={() => router.push("/notifications")} />
          <Pressable onPress={() => router.push("/(tabs)/profile")}>
            <Avatar name={user?.full_name || user?.username} size={38} />
          </Pressable>
        </View>

        {loading ? <Loading /> : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxxl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {/* What this phone did without signal and has not sent yet. */}
            <OutboxBanner />
            {/* Time in / Time out: the working day */}
            {user?.is_field_staff ? (
              <Card style={styles.duty}>
                <View style={[styles.dutyIcon, duty?.on_duty && { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="time-outline" size={20} color={duty?.on_duty ? colors.success : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.presLabel}>{duty?.on_duty ? "Timed in" : "Not timed in"}</Text>
                  <Text style={styles.dutyText}>
                    {duty?.on_duty && duty.since ? `since ${dayLabel(duty.since)}, ${timeOnly(duty.since)}` : "Time in when you start your working hours"}
                  </Text>
                </View>
                <Button title={duty?.on_duty ? "Time out" : "Time in"} small variant={duty?.on_duty ? "secondary" : "primary"}
                  loading={dutyBusy} onPress={toggleDuty} />
              </Card>
            ) : null}
            {/* Where you are */}
            <Card style={[styles.presence, presence?.checked_in && { backgroundColor: colors.primaryDark }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.presLabel, presence?.checked_in && { color: "#c9e6d8" }]}>
                  {presence?.checked_in ? "On site" : "Not checked in"}
                </Text>
                <Text style={[styles.presSite, presence?.checked_in && { color: "#fff" }]}>
                  {presence?.checked_in ? presence.site_name ?? "a site" : "Open a job and check in at its site"}
                </Text>
                {presence?.checked_in && presence.since ? (
                  <Text style={{ color: "#c9e6d8", fontSize: font.xs, marginTop: 2 }}>since {timeAgo(presence.since)}</Text>
                ) : null}
              </View>
              {presence?.checked_in ? <Button title="Check out" small variant="secondary" loading={busy} onPress={leaveSite} /> : null}
            </Card>

            {/* Counts */}
            <View style={styles.tiles}>
              <Tile n={installs.length} label="Installations" icon="layers-outline" />
              <Tile n={jobs.length} label="Maintenance" icon="construct-outline" />
              <Tile n={dueToday} label="Due today" icon="alarm-outline" tint={dueToday ? colors.danger : colors.textMuted} />
            </View>

            {/* Jobs */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>My jobs</Text>
              <Pressable onPress={() => router.push("/(tabs)/jobs")}><Text style={styles.link}>All jobs</Text></Pressable>
            </View>
            {installs.length === 0 && jobs.length === 0 ? (
              <Card><Text style={styles.empty}>Nothing assigned to you right now.</Text></Card>
            ) : null}
            {installs.slice(0, 4).map((j) => (
              <Card key={j.id} style={styles.job} onPress={() => router.push(`/installation/${j.id}`)}>
                <View style={styles.jobIcon}><Ionicons name="layers-outline" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{j.device_code} · {j.device_name}</Text>
                  <Text style={styles.jobSub} numberOfLines={1}>{j.helping ? "Helping · " : ""}Install at {j.site_name}{j.due_date ? ` · due ${j.due_date}` : ""}</Text>
                </View>
                <Pill label={`${j.progress ?? 0}%`} fg={colors.primary} bg={colors.primarySoft} />
              </Card>
            ))}
            {jobs.slice(0, 4).map((j) => (
              <Card key={j.id} style={styles.job} onPress={() => router.push(`/job/${j.id}`)}>
                <View style={[styles.jobIcon, { backgroundColor: colors.warningSoft }]}><Ionicons name="construct-outline" size={18} color="#b45309" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{j.device_code ? `${j.device_code} · ` : ""}{j.title}</Text>
                  <Text style={styles.jobSub} numberOfLines={1}>{j.helping ? "Helping · " : ""}{j.maintenance_type === "corrective" ? "Corrective" : "Preventive"} · {j.site_name ?? "No site"}{j.next_due ? ` · due ${j.next_due}` : ""}</Text>
                </View>
                <Pill label={j.status_display} fg={j.status === "in_process" ? "#b45309" : colors.textMuted} bg={j.status === "in_process" ? colors.warningSoft : colors.secondary} />
              </Card>
            ))}
            {awaiting ? <Text style={styles.hint}>{awaiting} job{awaiting === 1 ? "" : "s"} in progress.</Text> : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </Wash>
  );
}

function Tile({ n, label, icon, tint = colors.primary }: { n: number; label: string; icon: keyof typeof Ionicons.glyphMap; tint?: string }) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[styles.tileN, { color: tint }]}>{n}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  greet: { fontSize: font.sm, color: colors.textMuted },
  name: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  presence: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: "rgba(255,255,255,0.75)" },
  duty: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: "rgba(255,255,255,0.75)", marginBottom: spacing.md },
  dutyIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondary },
  dutyText: { fontSize: font.body, fontWeight: "700", color: colors.text, marginTop: 2 },
  presLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  presSite: { fontSize: font.body, fontWeight: "700", color: colors.text, marginTop: 2 },
  tiles: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  tile: { flex: 1, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  tileN: { fontSize: 22, fontWeight: "800" },
  tileLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  link: { fontSize: font.sm, fontWeight: "700", color: colors.primary },
  job: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm, padding: spacing.md },
  jobIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  jobTitle: { fontSize: font.body, fontWeight: "700", color: colors.text },
  jobSub: { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
  empty: { fontSize: font.sm, color: colors.textMuted },
  hint: { fontSize: font.xs, color: colors.textMuted, marginTop: spacing.sm },
});
