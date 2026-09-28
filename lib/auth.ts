import * as SecureStore from "@/lib/secure-store";
import { router } from "expo-router";

import api from "./api";

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/token/", { username, password });
  await SecureStore.setItem("access_token", data.access);
  await SecureStore.setItem("refresh_token", data.refresh);
  return data;
}

export async function logout() {
  await SecureStore.deleteItem("access_token");
  await SecureStore.deleteItem("refresh_token");
  router.replace("/(auth)/login");
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await SecureStore.getItem("access_token");
  return !!token;
}
