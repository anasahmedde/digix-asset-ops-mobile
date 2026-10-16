import axios from "axios";
import { router } from "expo-router";
import * as SecureStore from "@/lib/secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api";

/** Origin without the trailing /api — used to resolve media (image) URLs. */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh: the app fires several requests in parallel, so when the
// access token expires they all 401 at once. The backend rotates + blacklists
// refresh tokens, so if each 401 refreshed independently the first would blacklist
// the token and the rest would fail (wiping the session). We dedupe to ONE refresh
// and have every queued request await it.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await SecureStore.getItem("refresh_token");
  if (!refreshToken) throw new Error("No refresh token");
  const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, { refresh: refreshToken });
  await SecureStore.setItem("access_token", data.access);
  if (data.refresh) {
    await SecureStore.setItem("refresh_token", data.refresh);
  }
  return data.access as string;
}

async function forceLogout(reason: string) {
  await SecureStore.deleteItem("access_token");
  await SecureStore.deleteItem("refresh_token");
  try {
    router.replace({ pathname: "/(auth)/login", params: { reason } });
  } catch {
    /* navigation may not be ready */
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // A 401 from signing in is the answer to the sign-in ("Incorrect
    // password."), not an expired session: it goes back to the login form as
    // it is. Treating it as an expiry replaced that answer with "Signed out:
    // /auth/token/ answered 401", and nobody could tell what was wrong.
    const url: string = originalRequest?.url ?? "";
    if (url.includes("/auth/token")) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccess = await refreshPromise;
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        // No answer is not a refusal. Signal dropping during the refresh -
        // a basement, a lift - must not sign the technician out; the session
        // is tried again when there is signal. Only a refused refresh ends it.
        const refused = (refreshError as { response?: unknown })?.response
          || (refreshError as Error)?.message === "No refresh token";
        if (!refused) return Promise.reject(refreshError);
        await forceLogout("Your session has ended. Sign in again.");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
