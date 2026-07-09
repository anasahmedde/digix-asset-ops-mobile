import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";
import api from "@/lib/api";

export default function SettingsScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ old_password: "", new_password: "" });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        setUserId(u.id);
        setProfile({ first_name: u.first_name ?? "", last_name: u.last_name ?? "", email: u.email ?? "", phone: u.phone ?? "" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile() {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await api.patch(`/accounts/users/${userId}/`, profile);
      toast.success("Profile updated");
    } catch {
      toast.error("Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (!pw.old_password || !pw.new_password) { toast.error("Fill both password fields"); return; }
    if (pw.new_password.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    setSavingPw(true);
    try {
      await api.post("/accounts/users/change-password/", pw);
      toast.success("Password changed");
      setPw({ old_password: "", new_password: "" });
    } catch {
      toast.error("Could not change password (check current password)");
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) return <Loading />;

  const F = (label: string, key: keyof typeof profile, opts?: { keyboard?: "email-address" | "phone-pad" }) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={profile[key]}
        onChangeText={(t) => setProfile((p) => ({ ...p, [key]: t }))}
        autoCapitalize={key === "email" ? "none" : "words"}
        keyboardType={opts?.keyboard}
        placeholderTextColor={colors.textLight}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
          <View style={styles.sectionHead}><Ionicons name="person-outline" size={18} color={colors.primary} /><Text style={styles.sectionTitle}>Profile</Text></View>
          <Card>
            {F("First name", "first_name")}
            {F("Last name", "last_name")}
            {F("Email", "email", { keyboard: "email-address" })}
            {F("Phone", "phone", { keyboard: "phone-pad" })}
            <Button title="Save profile" icon="checkmark" loading={savingProfile} onPress={saveProfile} style={{ marginTop: spacing.sm }} />
          </Card>

          <View style={[styles.sectionHead, { marginTop: spacing.xl }]}><Ionicons name="lock-closed-outline" size={18} color={colors.primary} /><Text style={styles.sectionTitle}>Change password</Text></View>
          <Card>
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={styles.label}>Current password</Text>
              <TextInput style={styles.input} secureTextEntry value={pw.old_password} onChangeText={(t) => setPw((p) => ({ ...p, old_password: t }))} placeholderTextColor={colors.textLight} />
            </View>
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={styles.label}>New password</Text>
              <TextInput style={styles.input} secureTextEntry value={pw.new_password} onChangeText={(t) => setPw((p) => ({ ...p, new_password: t }))} placeholderTextColor={colors.textLight} />
            </View>
            <Button title="Change password" icon="key" variant="secondary" loading={savingPw} onPress={changePassword} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  label: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: font.body, color: colors.text },
});
