import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";

import api from "./api";

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/token/", { username, password });
  await SecureStore.setItemAsync("access_token", data.access);
  await SecureStore.setItemAsync("refresh_token", data.refresh);
  return data;
}

export async function logout() {
  await SecureStore.deleteItemAsync("access_token");
  await SecureStore.deleteItemAsync("refresh_token");
  router.replace("/(auth)/login");
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await SecureStore.getItemAsync("access_token");
  return !!token;
}
