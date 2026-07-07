import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { isAuthenticated } from "@/lib/auth";

export default function Index() {
  useEffect(() => {
    (async () => {
      const authed = await isAuthenticated();
      router.replace(authed ? "/(tabs)/tickets" : "/(auth)/login");
    })();
  }, []);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" },
});
