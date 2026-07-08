import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from "react-native";

import { Avatar, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { timeOnly } from "@/lib/format";
import { ChatMessage, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export default function ChatThreadScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await api.get(`/chat/rooms/${id}/messages/`, { params: { page_size: 200 } });
      const list: ChatMessage[] = data.results ?? data;
      setMessages((prev) => (prev.length !== list.length ? list : prev));
    } catch { /* ignore */ }
  }, [id]);

  const markRead = useCallback(() => { api.post(`/chat/rooms/${id}/mark_read/`).catch(() => {}); }, [id]);

  useEffect(() => {
    (async () => {
      try { setMe(await getCurrentUser()); } catch { /* ignore */ }
      await fetchMessages();
      markRead();
      setLoading(false);
    })();
    const poll = setInterval(() => { fetchMessages(); }, 3500);
    return () => clearInterval(poll);
  }, [fetchMessages, markRead]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      const { data } = await api.post("/chat/messages/", { room: id, content: body, message_type: "text" });
      setMessages((prev) => [...prev, data]);
      markRead();
    } catch {
      setText(body);
    } finally { setSending(false); }
  }

  if (loading) return <><Stack.Screen options={{ title: name || "Chat" }} /><Loading /></>;

  return (
    <>
      <Stack.Screen options={{ title: name || "Chat" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No messages yet. Say hello!</Text></View>}
          renderItem={({ item }) => {
            const mine = item.sender === me?.id;
            return (
              <View style={[styles.msgRow, mine ? styles.rowMine : styles.rowTheirs]}>
                {!mine && <Avatar name={item.sender_name} size={30} />}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.sender}>{item.sender_name}</Text>}
                  <Text style={[styles.msgText, mine && { color: "#fff" }]}>{item.content}</Text>
                  <Text style={[styles.msgTime, mine && { color: "#dbe6ff" }]}>{timeOnly(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textLight}
            style={styles.input}
            multiline
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyText: { color: colors.textLight, fontSize: font.sm },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, maxWidth: "85%" },
  rowMine: { alignSelf: "flex-end" },
  rowTheirs: { alignSelf: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sender: { fontSize: font.xs, fontWeight: "700", color: colors.primary, marginBottom: 2 },
  msgText: { fontSize: font.body, color: colors.text, lineHeight: 20 },
  msgTime: { fontSize: 10, color: colors.textLight, alignSelf: "flex-end", marginTop: 3 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 42, maxHeight: 110, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
