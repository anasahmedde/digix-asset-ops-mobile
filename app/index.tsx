import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { isAuthenticated } from "@/lib/auth";
import { colors } from "@/constants/theme";

export default function Index() {
  useEffect(() => {
    (async () => {
      const authed = await isAuthenticated();
      router.replace(authed ? "/(tabs)" : "/(auth)/login");
    })();
  }, []);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
});
