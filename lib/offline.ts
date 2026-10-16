import * as FileSystem from "expo-file-system";
import { AppState, Platform } from "react-native";

import api from "./api";

/**
 * Working without signal.
 *
 * Every act in the field - check in, scan, photos, start, steps, work done,
 * purchases, check out - goes through `submit`. It is written to an outbox
 * on the phone first, with the phone's time, then sent. With signal it goes
 * at once; without, it waits and is sent, in order, the moment there is
 * signal again (app start, back to the front, every 30 seconds, after any
 * act). Photos are copied into the app's own files so nothing clears them.
 *
 * The server is told when each act really happened (X-Recorded-At) and
 * gets a once-only key (X-Idempotency-Key), so a resend after a lost reply
 * is never done twice. Screens keep the last data they loaded (`cached`) so
 * a job opened with signal still opens without it, and show what is waiting
 * on top of it (`pendingFor`).
 */

const onWeb = Platform.OS === "web";
const DIR = `${FileSystem.documentDirectory ?? ""}offline/`;
const FILES = `${DIR}files/`;

export interface FilePart { field: string; uri: string; name: string; type: string }

export interface Op {
  /** The once-only key the server remembers. */
  id: string;
  /** When it happened, by the phone's clock. */
  at: string;
  method: "post" | "patch" | "delete";
  url: string;
  json?: Record<string, unknown>;
  form?: { fields: Record<string, string>; files: FilePart[] };
  /** What it is, for the screens: "checkin", "photo", "start"... */
  kind: string;
  /** Whose it is: "job:<id>", "inst:<id>" or "attendance". */
  scope: string;
  /** What the person sees in the outbox: "Check in", "Before photo". */
  label: string;
  /** What the screen needs to show it before it is sent. */
  meta?: Record<string, unknown>;
  status: "pending" | "failed";
  error?: string;
}

export type OpInput = Omit<Op, "id" | "at" | "status" | "error">;

// ------------------------------------------------------------ storage

function fileName(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function readJSON<T>(name: string, fallback: T): Promise<T> {
  try {
    if (onWeb) {
      const v = globalThis.localStorage?.getItem(`offline:${name}`);
      return v ? (JSON.parse(v) as T) : fallback;
    }
    const path = `${DIR}${fileName(name)}.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(name: string, value: unknown) {
  try {
    if (onWeb) {
      globalThis.localStorage?.setItem(`offline:${name}`, JSON.stringify(value));
      return;
    }
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    await FileSystem.writeAsStringAsync(`${DIR}${fileName(name)}.json`, JSON.stringify(value));
  } catch {
    /* a full disk loses the cache, not the work in hand */
  }
}

/** A photo or document the outbox will send later, kept where nothing clears it. */
export async function keepFile(uri: string, name: string): Promise<string> {
  if (onWeb || !uri || uri.startsWith(FILES)) return uri;
  try {
    await FileSystem.makeDirectoryAsync(FILES, { intermediates: true }).catch(() => {});
    const to = `${FILES}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${fileName(name)}`;
    await FileSystem.copyAsync({ from: uri, to });
    return to;
  } catch {
    return uri;
  }
}

async function dropFiles(op: Op) {
  if (onWeb) return;
  for (const f of op.form?.files ?? []) {
    if (f.uri.startsWith(FILES)) await FileSystem.deleteAsync(f.uri, { idempotent: true }).catch(() => {});
  }
}

// ------------------------------------------------------------ errors

/** No answer at all: no signal, or it dropped. Anything the server said is not this. */
export function isNetworkError(e: unknown): boolean {
  const err = e as { response?: unknown; code?: string; message?: string; request?: unknown } | null;
  if (!err || err.response) return false;
  return !!err.request || err.code === "ERR_NETWORK" || err.code === "ECONNABORTED" || err.message === "Network Error";
}

function serverMessage(e: unknown): string {
  const d = (e as { response?: { data?: Record<string, unknown> } }).response?.data;
  if (!d) return "The server refused it.";
  if (typeof d.detail === "string") return d.detail;
  const first = Object.values(d).flat().find((v) => typeof v === "string");
  return typeof first === "string" ? first : "The server refused it.";
}

// ------------------------------------------------------------ the outbox

let ops: Op[] | null = null;
const listeners = new Set<() => void>();
const results = new Map<string, { ok: true; data: unknown } | { ok: false; error: unknown }>();

async function loaded(): Promise<Op[]> {
  if (ops === null) ops = await readJSON<Op[]>("outbox", []);
  return ops;
}

async function save() {
  await writeJSON("outbox", ops ?? []);
  listeners.forEach((fn) => fn());
}

/** Everything waiting, oldest first. */
export function snapshot(): Op[] {
  return [...(ops ?? [])];
}

/** Hear about the outbox changing. Called once at once with what is there. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  loaded().then(() => fn());
  return () => { listeners.delete(fn); };
}

/** What is still to be sent for this job (or for attendance), oldest first. */
export async function pendingFor(scope: string): Promise<Op[]> {
  return (await loaded()).filter((o) => o.status === "pending" && o.scope === scope);
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function send(op: Op) {
  const headers: Record<string, string> = { "X-Idempotency-Key": op.id };
  // Sent a minute or more after it happened: the server is told when.
  if (Date.now() - Date.parse(op.at) > 60_000) headers["X-Recorded-At"] = op.at;
  if (op.form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(op.form.fields)) fd.append(k, v);
    for (const f of op.form.files) fd.append(f.field, { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
    return api.request({
      method: op.method, url: op.url, data: fd, timeout: 120_000,
      headers: { ...headers, "Content-Type": "multipart/form-data" },
    });
  }
  return api.request({ method: op.method, url: op.url, data: op.json ?? {}, headers, timeout: 45_000 });
}

let flushing: Promise<void> | null = null;

/** Send what is waiting, in order. Stops at the first sign there is no signal. */
export function flush(): Promise<void> {
  if (!flushing) {
    flushing = (async () => {
      const list = await loaded();
      // A refused act holds back the acts after it on the same job: they
      // were done on top of it.
      const blocked = new Set<string>();
      for (const op of [...list]) {
        if (op.status === "failed") { blocked.add(op.scope); continue; }
        if (blocked.has(op.scope)) continue;
        try {
          const res = await send(op);
          results.set(op.id, { ok: true, data: res.data });
          ops = (ops ?? []).filter((o) => o.id !== op.id);
          await dropFiles(op);
          await save();
        } catch (e) {
          if (isNetworkError(e)) break;
          const status = (e as { response?: { status?: number } }).response?.status ?? 0;
          if (status >= 500 || status === 429 || status === 401) break;
          results.set(op.id, { ok: false, error: e });
          op.status = "failed";
          op.error = serverMessage(e);
          blocked.add(op.scope);
          await save();
        }
      }
    })().finally(() => { flushing = null; });
  }
  return flushing;
}

/**
 * Do one act. With signal it is sent now and answers `{ queued: false, data }`;
 * without, it waits in the outbox and answers `{ queued: true }`. If the
 * server refuses it there and then, it is not kept and the error is thrown,
 * as an ordinary request would. `whenQueued` may veto keeping it offline
 * (a label that does not match, say) by returning the reason.
 */
export async function submit(
  input: OpInput,
  opts: { whenQueued?: () => string | null } = {},
): Promise<{ queued: boolean; data?: unknown }> {
  const op: Op = { ...input, id: newId(), at: new Date().toISOString(), status: "pending" };
  for (const f of op.form?.files ?? []) f.uri = await keepFile(f.uri, f.name);
  (await loaded()).push(op);
  await save();
  await flush();
  if (!results.has(op.id) && (ops ?? []).some((o) => o.id === op.id && o.status === "pending")) await flush();
  const r = results.get(op.id);
  results.delete(op.id);
  if (r?.ok) return { queued: false, data: r.data };
  if (r && !r.ok) {
    await discard(op.id);
    throw r.error;
  }
  const veto = opts.whenQueued?.();
  if (veto) {
    await discard(op.id);
    throw new Error(veto);
  }
  return { queued: true };
}

/** Throw away a waiting or refused act, and its files. */
export async function discard(id: string) {
  const list = await loaded();
  const op = list.find((o) => o.id === id);
  ops = list.filter((o) => o.id !== id);
  if (op) await dropFiles(op);
  await save();
}

/** Try again from the top: a refused act is put back in the queue. */
export async function retry(id: string) {
  const op = (await loaded()).find((o) => o.id === id);
  if (op) { op.status = "pending"; op.error = undefined; await save(); }
  await flush();
}

let started = false;

/** Keep the outbox moving: now, whenever the app comes back, and every 30 s. */
export function startOutbox() {
  if (started) return;
  started = true;
  flush().catch(() => {});
  AppState.addEventListener("change", (s) => { if (s === "active") flush().catch(() => {}); });
  setInterval(() => {
    if ((ops ?? []).some((o) => o.status === "pending")) flush().catch(() => {});
  }, 30_000);
}

// ------------------------------------------------------------ the last data seen

/** Fetch, and keep a copy; without signal, answer the copy. */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; fresh: boolean }> {
  try {
    const data = await fetcher();
    writeJSON(`cache-${key}`, { at: Date.now(), data });
    return { data, fresh: true };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const hit = await readJSON<{ at: number; data: T } | null>(`cache-${key}`, null);
    if (hit) return { data: hit.data, fresh: false };
    throw e;
  }
}

/** The copy alone, if there is one. */
export async function cachedOnly<T>(key: string): Promise<T | null> {
  const hit = await readJSON<{ at: number; data: T } | null>(`cache-${key}`, null);
  return hit ? hit.data : null;
}

export async function remember(key: string, data: unknown) {
  await writeJSON(`cache-${key}`, { at: Date.now(), data });
}

/** "Saved on this phone - it uploads when there is signal." */
export const QUEUED_NOTE = "Saved on this phone. It uploads by itself when there is signal.";
