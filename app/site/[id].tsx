import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";
import { toast } from "@/lib/toast";
import { Device } from "@/lib/types";

interface SiteContact {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  is_primary?: boolean;
}
interface SiteDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  state_province?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  access_instructions?: string;
  operating_hours?: string;
  client_name?: string | null;
  is_active: boolean;
  contacts?: SiteContact[];
}

const TICKET_CATEGORIES = ["repair", "inspection", "installation", "relocation", "other"];
const labelize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [assets, setAssets] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [ticketForm, setTicketForm] = useState<{ title: string; category: string; priority: string; description: string } | null>(null);
  const [savingTicket, setSavingTicket] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.allSettled([
        api.get(`/sites/sites/${id}/`),
        api.get("/assets/devices/", { params: { current_site: id, page_size: 100 } }),
      ]);
      if (s.status === "fulfilled") setSite(s.value.data);
      if (a.status === "fulfilled") setAssets(a.value.data.results ?? a.value.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function navigateToSite() {
    if (!site) return;
    const label = encodeURIComponent(site.name);
    let url: string;
    if (site.latitude != null && site.longitude != null) {
      url = Platform.OS === "ios"
        ? `http://maps.apple.com/?ll=${site.latitude},${site.longitude}&q=${label}`
        : `geo:${site.latitude},${site.longitude}?q=${site.latitude},${site.longitude}(${label})`;
    } else {
      const q = encodeURIComponent([site.address, site.city].filter(Boolean).join(", "));
      url = `https://www.google.com/maps/search/?api=1&query=${q}`;
    }
    Linking.openURL(url).catch(() => toast.error("Could not open maps"));
  }

  async function checkInHere() {
    setCheckingIn(true);
    try {
      const granted = await requestForegroundLocationPermission();
      if (!granted) { toast.error("Location permission is required"); return; }
      const loc = await getCurrentLocation();
      await api.post("/attendance/records/", {
        check_type: "check_in",
        latitude: loc.latitude.toFixed(7),
        longitude: loc.longitude.toFixed(7),
        accuracy: loc.accuracy ? Math.round(loc.accuracy) : null,
        site: id,
      });
      toast.success(`Checked in at ${site?.name ?? "site"}`);
    } catch {
      toast.error("Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  }

  async function raiseTicket() {
    if (!ticketForm?.title.trim()) { toast.error("Title is required"); return; }
    setSavingTicket(true);
    try {
      const { data } = await api.post("/tickets/", {
        title: ticketForm.title,
        category: ticketForm.category,
        priority: ticketForm.priority,
        description: ticketForm.description,
        site: id,
      });
      setTicketForm(null);
      toast.success("Ticket created");
      router.push(`/ticket/${data.id}`);
    } catch {
      toast.error("Could not create ticket");
    } finally {
      setSavingTicket(false);
    }
  }

  if (loading) return <Loading />;
  if (!site) return (
    <SafeAreaView style={styles.safe}><Text style={styles.err}>Site not found.</Text></SafeAreaView>
  );

  const contacts = (site.contacts ?? []).filter((c) => c.phone || c.email);
  if (!contacts.length && (site.contact_phone || site.contact_email)) {
    contacts.push({ id: "primary", name: site.contact_person || "Site contact", phone: site.contact_phone, email: site.contact_email, is_primary: true });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Header */}
        <Text style={styles.name}>{site.name}</Text>
        <View style={styles.metaRow}>
          {site.client_name ? <Text style={styles.client}>{site.client_name}</Text> : null}
          <Pill label={site.is_active ? "Active" : "Inactive"} fg={site.is_active ? colors.success : colors.textMuted} bg={site.is_active ? colors.successSoft : colors.border} />
        </View>
        <View style={styles.addrLine}>
          <Ionicons name="location-outline" size={15} color={colors.textLight} />
          <Text style={styles.addr}>{[site.address, site.city, site.state_province].filter(Boolean).join(", ") || "No address"}</Text>
        </View>

        {/* Primary actions */}
        <View style={styles.actions}>
          <Button title="Navigate" icon="navigate" small onPress={navigateToSite} style={{ flex: 1 }} />
          <Button title={checkingIn ? "Checking in…" : "Check in"} icon="time" small variant="secondary" loading={checkingIn} onPress={checkInHere} style={{ flex: 1 }} />
        </View>
        <Button title="Raise a ticket for this site" icon="add-circle-outline" variant="secondary" onPress={() => setTicketForm({ title: "", category: "repair", priority: "medium", description: "" })} style={{ marginTop: spacing.sm }} />

        {/* Stat */}
        <Card style={{ marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={styles.statIcon}><Ionicons name="tv-outline" size={20} color={colors.primary} /></View>
          <View>
            <Text style={styles.statValue}>{assets.length}</Text>
            <Text style={styles.statLabel}>Assets at this site</Text>
          </View>
        </Card>

        {/* Access / hours */}
        {(site.operating_hours || site.access_instructions) ? (
          <Card style={{ marginTop: spacing.md, gap: 6 }}>
            {site.operating_hours ? <Text style={styles.info}><Text style={styles.infoLabel}>Hours: </Text>{site.operating_hours}</Text> : null}
            {site.access_instructions ? <Text style={styles.info}><Text style={styles.infoLabel}>Access: </Text>{site.access_instructions}</Text> : null}
          </Card>
        ) : null}

        {/* Contacts */}
        {contacts.length ? (
          <>
            <Text style={styles.section}>Contacts</Text>
            {contacts.map((c) => (
              <Card key={c.id} style={{ marginBottom: spacing.sm, gap: 6 }}>
                <Text style={styles.contactName}>{c.name}{c.role ? ` · ${c.role}` : ""}</Text>
                <View style={styles.contactActions}>
                  {c.phone ? (
                    <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                      <Ionicons name="call-outline" size={15} color={colors.primary} /><Text style={styles.contactBtnText}>{c.phone}</Text>
                    </Pressable>
                  ) : null}
                  {c.email ? (
                    <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                      <Ionicons name="mail-outline" size={15} color={colors.primary} /><Text style={styles.contactBtnText}>{c.email}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {/* Assets */}
        <Text style={styles.section}>Assets</Text>
        {assets.length === 0 ? (
          <Card><Text style={styles.empty}>No assets recorded at this site.</Text></Card>
        ) : (
          assets.map((d) => (
            <Card key={d.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/asset/${d.asset_code}`)}>
              <View style={styles.assetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assetCode}>{d.asset_code}</Text>
                  <Text style={styles.assetName} numberOfLines={1}>{d.display_name || d.device_model_name || d.asset_type_name || "Device"}</Text>
                </View>
                <Pill label={labelize(d.status.replace(/_/g, " "))} fg={colors.primary} bg={colors.primarySoft} />
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Raise-ticket modal */}
      <Modal visible={!!ticketForm} animationType="slide" transparent onRequestClose={() => setTicketForm(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New ticket · {site.name}</Text>
              <Pressable onPress={() => setTicketForm(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor={colors.textLight} value={ticketForm?.title} onChangeText={(t) => setTicketForm((f) => f && { ...f, title: t })} />
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.pillWrap}>
              {TICKET_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setTicketForm((f) => f && { ...f, category: c })} style={[styles.selPill, ticketForm?.category === c && styles.selPillActive]}>
                  <Text style={[styles.selPillText, ticketForm?.category === c && styles.selPillTextActive]}>{labelize(c)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.pillWrap}>
              {["low", "medium", "high", "urgent"].map((p) => (
                <Pressable key={p} onPress={() => setTicketForm((f) => f && { ...f, priority: p })} style={[styles.selPill, ticketForm?.priority === p && styles.selPillActive]}>
                  <Text style={[styles.selPillText, ticketForm?.priority === p && styles.selPillTextActive]}>{labelize(p)}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[styles.input, { height: 90, textAlignVertical: "top", marginTop: spacing.sm }]} placeholder="Describe the issue…" placeholderTextColor={colors.textLight} multiline value={ticketForm?.description} onChangeText={(t) => setTicketForm((f) => f && { ...f, description: t })} />
            <Button title="Create Ticket" icon="checkmark" loading={savingTicket} onPress={raiseTicket} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  name: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  client: { fontSize: font.sm, color: colors.primary, fontWeight: "700" },
  addrLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  addr: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  statIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  info: { fontSize: font.sm, color: colors.text },
  infoLabel: { fontWeight: "700", color: colors.textMuted },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  contactName: { fontSize: font.body, fontWeight: "700", color: colors.text },
  contactActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  contactBtnText: { fontSize: font.sm, color: colors.primary, fontWeight: "600" },
  assetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  assetCode: { fontSize: font.body, fontWeight: "700", color: colors.text },
  assetName: { fontSize: font.sm, color: colors.textMuted },
  empty: { fontSize: font.sm, color: colors.textMuted },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text, flex: 1 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: font.body, color: colors.text },
  fieldLabel: { fontSize: font.sm, fontWeight: "700", color: colors.textMuted, marginTop: spacing.md, marginBottom: 6 },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  selPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selPillText: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  selPillTextActive: { color: "#fff" },
});
