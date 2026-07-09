import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { colors, font, spacing } from "@/constants/theme";
import { API_ORIGIN } from "@/lib/api";

/**
 * Temporary fallback: renders a section of the web dashboard inside the app
 * (auto-signed-in) for modules not yet rebuilt natively. Removed once parity lands.
 */
export default function WebViewScreen() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const webRef = useRef<WebView>(null);
  const [tokens, setTokens] = useState<{ access: string; refresh: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [access, refresh] = await Promise.all([
        SecureStore.getItemAsync("access_token"),
        SecureStore.getItemAsync("refresh_token"),
      ]);
      if (access) setTokens({ access, refresh: refresh ?? "" });
      setReady(true);
    })();
  }, []);

  const injectAuth = tokens
    ? `(function(){try{localStorage.setItem('access_token',${JSON.stringify(tokens.access)});localStorage.setItem('refresh_token',${JSON.stringify(tokens.refresh)});}catch(e){}true;})();`
    : "true;";

  return (
    <>
      <Stack.Screen options={{ title: title || "DIGIX" }} />
      <SafeAreaView style={styles.flex} edges={["bottom"]}>
        {!ready ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : !tokens ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textLight} />
            <Text style={styles.msg}>Please sign in again.</Text>
          </View>
        ) : (
          <>
            <WebView
              ref={webRef}
              source={{ uri: `${API_ORIGIN}${path || "/"}` }}
              originWhitelist={["*"]}
              injectedJavaScriptBeforeContentLoaded={injectAuth}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
              )}
              pullToRefreshEnabled
              style={styles.flex}
            />
            <Pressable style={styles.reload} onPress={() => webRef.current?.reload()} hitSlop={8}>
              <Ionicons name="refresh" size={18} color="#fff" />
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.bg },
  msg: { fontSize: font.body, color: colors.textMuted },
  reload: { position: "absolute", right: spacing.lg, bottom: spacing.lg, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 6 },
});
