import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors, font, spacing } from "@/constants/theme";
import { timeAgo } from "@/lib/format";
import { Ticket, labelize } from "@/lib/types";
import { Card, PriorityBadge, StatusPill } from "./ui";

export function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>{ticket.title}</Text>
        <StatusPill status={ticket.status} />
      </View>

      <View style={styles.metaRow}>
        <PriorityBadge priority={ticket.priority} />
        <Text style={styles.category}>{labelize(ticket.category)}</Text>
      </View>

      {(ticket.site_name || ticket.device_code) && (
        <View style={styles.sub}>
          {ticket.site_name ? (
            <View style={styles.subItem}>
              <Ionicons name="location-outline" size={13} color={colors.textLight} />
              <Text style={styles.subText} numberOfLines={1}>{ticket.site_name}</Text>
            </View>
          ) : null}
          {ticket.device_code ? (
            <View style={styles.subItem}>
              <Ionicons name="hardware-chip-outline" size={13} color={colors.textLight} />
              <Text style={styles.subText}>{ticket.device_code}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.time}>{timeAgo(ticket.created_at)}</Text>
        <View style={styles.counts}>
          {ticket.comment_count ? (
            <View style={styles.count}><Ionicons name="chatbubble-outline" size={12} color={colors.textLight} /><Text style={styles.countText}>{ticket.comment_count}</Text></View>
          ) : null}
          {ticket.attachment_count ? (
            <View style={styles.count}><Ionicons name="image-outline" size={12} color={colors.textLight} /><Text style={styles.countText}>{ticket.attachment_count}</Text></View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.sm },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  category: { fontSize: font.sm, color: colors.textMuted, fontWeight: "500" },
  sub: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  subItem: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "60%" },
  subText: { fontSize: font.sm, color: colors.textMuted },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  time: { fontSize: font.xs, color: colors.textLight },
  counts: { flexDirection: "row", gap: spacing.md },
  count: { flexDirection: "row", alignItems: "center", gap: 3 },
  countText: { fontSize: font.xs, color: colors.textLight, fontWeight: "600" },
});
