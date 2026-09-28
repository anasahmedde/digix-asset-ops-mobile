import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the session is kept.
 *
 * On a device this is the keychain, which is what `expo-secure-store` is.
 * That module has no web implementation, and Expo's web target is how these
 * screens get reviewed without a build — so on web it falls back to
 * `localStorage`.
 *
 * The fallback is explicitly not secure storage. It exists so the app can be
 * opened in a browser for review; a shipped iOS or Android build never takes
 * this path.
 */
const onWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (onWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (onWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* a private window refuses; nothing to do about it */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (onWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* as above */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
