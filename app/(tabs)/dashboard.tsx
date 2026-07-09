import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { colors, font, spacing } from "@/constants/theme";
import { API_ORIGIN } from "@/lib/api";

export default function DashboardScreen() {
  const webRef = useRef<WebView>(null);
  const [tokens, setTokens] = useState<{ access: string; refresh: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

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

  // Hardware back navigates the web history first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!tokens) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textLight} />
        <Text style={styles.msg}>Please sign in again to open the dashboard.</Text>
      </SafeAreaView>
    );
  }

  // Seed the web app's auth into localStorage *before* its scripts run, so it
  // boots already signed-in (same JWT the native app uses) — no second login.
  const injectAuth = `
    (function () {
      try {
        localStorage.setItem('access_token', ${JSON.stringify(tokens.access)});
        localStorage.setItem('refresh_token', ${JSON.stringify(tokens.refresh)});
      } catch (e) {}
      true;
    })();
  `;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <WebView
        ref={webRef}
        source={{ uri: API_ORIGIN }}
        originWhitelist={["*"]}
        injectedJavaScriptBeforeContentLoaded={injectAuth}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onNavigationStateChange={onNav}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        style={styles.flex}
      />
      <Pressable style={styles.reload} onPress={() => webRef.current?.reload()} hitSlop={8}>
        <Ionicons name="refresh" size={18} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.bg, padding: spacing.xl },
  msg: { fontSize: font.body, color: colors.textMuted, textAlign: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  reload: { position: "absolute", right: spacing.lg, bottom: spacing.lg, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
