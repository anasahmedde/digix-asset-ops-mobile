import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the session is kept.
 *
 * On a device this is the keychain, which is what `expo-secure-store` is.
 * Some phones (Samsung among them) refuse or lose keystore entries - the
 * write "succeeds" and the read comes back empty, or either throws - and the
 * app then signs itself out the moment it signs in. So every value is also
 * held in memory, and when the keychain fails the value is kept in the app's
 * private files instead: not keychain-grade, but private to the app, and a
 * session that survives.
 *
 * That module has no web implementation, and Expo's web target is how these
 * screens get reviewed without a build - so on web it falls back to
 * `localStorage`.
 */
const onWeb = Platform.OS === "web";
const memory = new Map<string, string>();
const FILE = `${FileSystem.documentDirectory ?? ""}session.json`;

async function readFile(): Promise<Record<string, string>> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(FILE));
  } catch {
    return {};
  }
}

async function writeFile(values: Record<string, string>) {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(values));
  } catch {
    /* no file store either: memory still holds it for this run */
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (onWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  if (memory.has(key)) return memory.get(key)!;
  let value: string | null = null;
  try {
    value = await SecureStore.getItemAsync(key);
  } catch {
    value = null;
  }
  if (value === null) value = (await readFile())[key] ?? null;
  if (value !== null) memory.set(key, value);
  return value;
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
  memory.set(key, value);
  let kept = false;
  try {
    await SecureStore.setItemAsync(key, value);
    kept = (await SecureStore.getItemAsync(key)) === value;
  } catch {
    kept = false;
  }
  if (!kept) await writeFile({ ...(await readFile()), [key]: value });
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
  memory.delete(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* nothing there */
  }
  const rest = await readFile();
  if (key in rest) {
    delete rest[key];
    await writeFile(rest);
  }
}
