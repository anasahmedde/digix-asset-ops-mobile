import axios from "axios";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = await SecureStore.getItemAsync("refresh_token");

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          await SecureStore.setItemAsync("access_token", data.access);
          if (data.refresh) {
            await SecureStore.setItemAsync("refresh_token", data.refresh);
          }
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
          return api(originalRequest);
        } catch {
          await SecureStore.deleteItemAsync("access_token");
          await SecureStore.deleteItemAsync("refresh_token");
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
