import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { formatDate, mediaUrl } from "@/lib/format";
import { toast } from "@/lib/toast";
import api from "@/lib/api";

interface Doc {
  id: string;
  title: string;
  doc_type?: string;
  file?: string | null;
  file_size?: number | null;
  description?: string;
  uploaded_by_name?: string | null;
  created_at: string;
}
const cap = (s?: string) => (s ? s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");
const humanSize = (b?: number | null) => (!b ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/infrastructure/documents/", { params: { page_size: 200, ordering: "-created_at" } });
      setDocs(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = q ? docs.filter((d) => [d.title, d.doc_type, d.uploaded_by_name].some((v) => (v || "").toLowerCase().includes(q))) : docs;

  function open(d: Doc) {
    const url = mediaUrl(d.file);
    if (!url) { toast.error("No file attached"); return; }
    Linking.openURL(url).catch(() => toast.error("Could not open file"));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search documents…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="folder-open-outline" title="No documents" subtitle="Uploaded documents will appear here." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }} onPress={() => open(item)}>
            <View style={styles.row}>
              <View style={styles.icon}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>{[cap(item.doc_type), humanSize(item.file_size), formatDate(item.created_at)].filter(Boolean).join(" · ")}</Text>
              </View>
              <Ionicons name="download-outline" size={18} color={colors.textLight} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
});
