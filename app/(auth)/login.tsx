import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, font, radius, spacing } from "@/constants/theme";
import { login } from "@/lib/auth";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);

  async function handleLogin() {
    if (!username || !password) {
      setError("Please enter your username and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      router.replace("/(tabs)");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#0e9e7d", "#12b48f", "#0b8f79"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* soft decorative blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Brand */}
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Ionicons name="cube" size={38} color="#12b48f" />
              </View>
              <Text style={styles.brandName}>DIGIX Field</Text>
              <Text style={styles.brandTag}>Asset Operations · Field App</Text>
            </View>

            {/* Card */}
            <View style={styles.card}>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.welcomeSub}>Sign in to continue to your workspace</Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Username */}
              <Text style={styles.label}>Username</Text>
              <View style={[styles.inputWrap, focused === "user" && styles.inputWrapFocused]}>
                <Ionicons name="person-outline" size={18} color={focused === "user" ? colors.primary : colors.textLight} />
                <TextInput
                  style={styles.input}
                  placeholder="Your username"
                  placeholderTextColor={colors.textLight}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocused("user")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="next"
                />
              </View>

              {/* Password */}
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrap, focused === "pass" && styles.inputWrapFocused]}>
                <Ionicons name="lock-closed-outline" size={18} color={focused === "pass" ? colors.primary : colors.textLight} />
                <TextInput
                  style={styles.input}
                  placeholder="Your password"
                  placeholderTextColor={colors.textLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocused("pass")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textLight} />
                </Pressable>
              </View>

              {/* Sign in */}
              <Pressable onPress={handleLogin} disabled={loading} style={({ pressed }) => [styles.button, pressed && !loading && styles.buttonPressed]}>
                <LinearGradient colors={["#12b48f", "#0e9e7d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonBg}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Sign In</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            <Text style={styles.footer}>DIGIX Asset Operations</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e9e7d" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  blobTop: { position: "absolute", top: -120, right: -80, width: 280, height: 280, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)" },
  blobBottom: { position: "absolute", bottom: -100, left: -90, width: 240, height: 240, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  brand: { alignItems: "center", marginBottom: spacing.xxl },
  logo: {
    width: 78, height: 78, borderRadius: 24, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  brandName: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  brandTag: { fontSize: font.sm, color: "rgba(255,255,255,0.85)", marginTop: 4, fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 28, padding: spacing.xl,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  welcome: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  welcomeSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 3, marginBottom: spacing.lg },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md },
  errorText: { flex: 1, color: colors.danger, fontSize: font.sm, fontWeight: "600" },
  label: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm, textTransform: "uppercase", letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "#f6f8fa", borderWidth: 1.5, borderColor: "#eceff3",
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52,
  },
  inputWrapFocused: { borderColor: colors.primary, backgroundColor: "#fff" },
  input: { flex: 1, fontSize: font.body, color: colors.text, height: "100%" },
  button: { marginTop: spacing.xl, borderRadius: radius.md, overflow: "hidden", shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  buttonPressed: { opacity: 0.9 },
  buttonBg: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54 },
  buttonText: { color: "#fff", fontSize: font.body, fontWeight: "800", letterSpacing: 0.3 },
  footer: { textAlign: "center", color: "rgba(255,255,255,0.8)", fontSize: font.xs, marginTop: spacing.xxl, fontWeight: "600" },
});
