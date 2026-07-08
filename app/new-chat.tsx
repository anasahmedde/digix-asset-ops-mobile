import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { ROLE_LABELS, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export default function NewChatScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, me] = await Promise.allSettled([
          api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } }),
          getCurrentUser(),
        ]);
        if (list.status === "fulfilled") setUsers(list.value.data.results ?? list.value.data);
        if (me.status === "fulfilled") setMeId(me.value.id);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (u.id === meId) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (u.full_name || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
    });
  }, [users, meId, search]);

  async function startChat(user: User) {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await api.post("/chat/rooms/", { participant_ids: [user.id] });
      router.replace(`/chat/${data.id}?name=${encodeURIComponent(user.full_name || user.username)}`);
    } catch (e: any) {
      const msg = e?.response?.data?.participant_ids?.[0] || "";
      const m = /room ([0-9a-f-]+)/i.exec(msg);
      if (m) router.replace(`/chat/${m[1]}?name=${encodeURIComponent(user.full_name || user.username)}`);
      else toast.error("Could not start chat");
    } finally { setCreating(false); }
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search teammates…"
          placeholderTextColor={colors.textLight}
          style={styles.search}
          autoFocus
        />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No teammates found" />}
          renderItem={({ item }) => (
            <Pressable style={styles.userRow} onPress={() => startChat(item)}>
              <Avatar name={item.full_name || item.username} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.full_name || item.username}</Text>
                <Text style={styles.userRole}>{ROLE_LABELS[item.role] ?? item.role}</Text>
              </View>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { padding: spacing.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  search: { height: 44, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.body, color: colors.text },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  userName: { fontSize: font.body, fontWeight: "700", color: colors.text },
  userRole: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
});
