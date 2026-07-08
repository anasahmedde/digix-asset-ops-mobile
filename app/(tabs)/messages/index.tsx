import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, EmptyState, Fab, Loading } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { ChatRoom, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export default function MessagesScreen() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.allSettled([api.get("/chat/rooms/"), me ? Promise.resolve(me) : getCurrentUser()]);
      if (r.status === "fulfilled") setRooms(r.value.data.results ?? r.value.data);
      if (u.status === "fulfilled") setMe(u.value as User);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [me]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function roomName(room: ChatRoom): string {
    if (room.name) return room.name;
    const myFirst = me?.first_name;
    const others = (room.participant_names || []).filter((n) => n && n !== myFirst);
    return others.join(", ") || "Chat";
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          contentContainerStyle={rooms.length === 0 ? { flexGrow: 1 } : { paddingVertical: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No conversations" subtitle="Start a message with a teammate using the button below." />}
          renderItem={({ item }) => {
            const name = item.display_name || roomName(item);
            return (
              <Pressable style={styles.room} onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(name)}`)}>
                <Avatar name={name} size={48} color={item.room_type === "group" ? colors.violet : colors.primary} />
                <View style={styles.roomBody}>
                  <View style={styles.roomTop}>
                    <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
                    {item.last_message ? <Text style={styles.roomTime}>{timeAgo(item.last_message.created_at)}</Text> : null}
                  </View>
                  <View style={styles.roomBottom}>
                    <Text style={[styles.preview, item.unread_count > 0 && styles.previewUnread]} numberOfLines={1}>
                      {item.last_message ? item.last_message.content : "No messages yet"}
                    </Text>
                    {item.unread_count > 0 ? (
                      <View style={styles.unread}><Text style={styles.unreadText}>{item.unread_count > 9 ? "9+" : item.unread_count}</Text></View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <Fab icon="create-outline" onPress={() => router.push("/new-chat")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  room: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  roomBody: { flex: 1, gap: 3 },
  roomTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomName: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  roomTime: { fontSize: font.xs, color: colors.textLight },
  roomBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  preview: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  previewUnread: { color: colors.text, fontWeight: "600" },
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
