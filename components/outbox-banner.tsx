import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { colors, font, radius, spacing } from "@/constants/theme";
import { Op, discard, flush, retry, snapshot, subscribe } from "@/lib/offline";
import { toast } from "@/lib/toast";

/**
 * What this phone has done without signal and not sent yet - and anything
 * the server refused once it got there. Shown on Today and on each job, so
 * nobody leaves a site thinking work was recorded when it is still waiting.
 */
export function OutboxBanner({ scope }: { scope?: string }) {
  const [ops, setOps] = useState<Op[]>(snapshot());
  const [sending, setSending] = useState(false);
  useEffect(() => subscribe(() => setOps(snapshot())), []);

  const mine = scope ? ops.filter((o) => o.scope === scope || o.scope === "attendance") : ops;
  const waiting = mine.filter((o) => o.status === "pending");
  const refused = mine.filter((o) => o.status === "failed");
  if (waiting.length === 0 && refused.length === 0) return null;

  async function sendNow() {
    setSending(true);
    try {
      await flush();
      const left = snapshot().filter((o) => o.status === "pending" && (!scope || o.scope === scope || o.scope === "attendance"));
      if (left.length) toast.info("Still no signal - it will keep trying.");
      else toast.success("Uploaded");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {waiting.length > 0 ? (
        <View style={styles.row}>
          <Ionicons name="cloud-upload-outline" size={20} color="#b45309" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {waiting.length === 1 ? "1 action" : `${waiting.length} actions`} saved on this phone, waiting to upload
            </Text>
            <Text style={styles.hint}>{waiting.map((o) => o.label).join(" · ")}</Text>
            <Text style={styles.hint}>They send by themselves when there is signal, with the time they happened.</Text>
          </View>
          <Pressable onPress={sendNow} disabled={sending} hitSlop={8}>
            <Text style={styles.link}>{sending ? "Sending…" : "Send now"}</Text>
          </Pressable>
        </View>
      ) : null}
      {refused.map((o) => (
        <View key={o.id} style={[styles.row, styles.refused]}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.danger }]}>Could not upload: {o.label}</Text>
            <Text style={styles.hint}>{o.error}</Text>
          </View>
          <View style={{ gap: 8, alignItems: "flex-end" }}>
            <Pressable onPress={() => retry(o.id)} hitSlop={8}><Text style={styles.link}>Retry</Text></Pressable>
            <Pressable onPress={() => discard(o.id)} hitSlop={8}><Text style={[styles.link, { color: colors.danger }]}>Discard</Text></Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.warningSoft,
  },
  refused: { backgroundColor: colors.dangerSoft },
  title: { fontSize: font.sm, fontWeight: "700", color: "#92400e" },
  hint: { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: font.sm, fontWeight: "700", color: colors.primary },
});
