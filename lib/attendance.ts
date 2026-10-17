import api from "./api";
import { getCurrentLocation, requestForegroundLocationPermission } from "./location";
import { cached, pendingFor, submit } from "./offline";

/** Where the technician is clocked in, as the server has it - plus anything
 *  done on this phone without signal that has not reached it yet. */
export interface Presence {
  checked_in: boolean;
  site: string | null;
  site_name: string | null;
  since: string | null;
  /** True when the last check-in or check-out is still waiting to upload. */
  pending?: boolean;
}

const NOWHERE: Presence = { checked_in: false, site: null, site_name: null, since: null };

export async function getPresence(): Promise<Presence> {
  let base: Presence;
  try {
    ({ data: base } = await cached("presence", async () => {
      const { data } = await api.get("/attendance/records/status/");
      const last = data.last;
      return {
        checked_in: !!data.checked_in,
        site: data.checked_in ? last?.site ?? null : null,
        site_name: data.checked_in ? last?.site_name ?? null : null,
        since: data.checked_in ? last?.created_at ?? null : null,
      } as Presence;
    }));
  } catch {
    base = NOWHERE;
  }
  // What this phone did since, and has not sent yet, is where the person is.
  for (const op of await pendingFor("attendance")) {
    base = op.kind === "checkin"
      ? { checked_in: true, site: String(op.meta?.site ?? ""), site_name: (op.meta?.site_name as string) ?? null, since: op.at, pending: true }
      : { ...NOWHERE, pending: true };
  }
  return base;
}

async function whereami() {
  try {
    if (!(await requestForegroundLocationPermission())) return {};
    const loc = await getCurrentLocation();
    return { latitude: loc.latitude.toFixed(7), longitude: loc.longitude.toFixed(7), accuracy: loc.accuracy };
  } catch {
    // A basement with no signal is still a place work gets done.
    return {};
  }
}

/** Clock in at a site - with or without signal. The job's buttons open once
 *  this has happened there; without signal it uploads later, dated now. */
export async function checkIn(site: string, note = "", siteName: string | null = null): Promise<Presence & { queued?: boolean }> {
  const where = await whereami();
  const r = await submit({
    kind: "checkin", scope: "attendance", label: siteName ? `Check in at ${siteName}` : "Check in",
    method: "post", url: "/attendance/records/", json: { check_type: "check_in", site, note, ...where },
    meta: { site, site_name: siteName },
  });
  return { ...(await getPresence()), queued: r.queued };
}

export async function checkOut(site: string | null, note = ""): Promise<Presence & { queued?: boolean }> {
  const where = await whereami();
  const r = await submit({
    kind: "checkout", scope: "attendance", label: "Check out",
    method: "post", url: "/attendance/records/", json: { check_type: "check_out", site, note, ...where },
  });
  return { ...(await getPresence()), queued: r.queued };
}

/** True when the person is clocked in at this very site. */
export function onSite(p: Presence | null, site: string | null | undefined): boolean {
  return !!p && p.checked_in && !!site && p.site === site;
}

/** Time in / Time out: whether the person is on duty, and since when. Where
 *  they were is sent with it and read by their supervisor, not shown here. */
export interface Duty { on_duty: boolean; since: string | null; pending?: boolean }

export async function getDuty(): Promise<Duty> {
  let base: Duty;
  try {
    ({ data: base } = await cached("duty", async () => (await api.get("/attendance/duty/status/")).data as Duty));
  } catch {
    base = { on_duty: false, since: null };
  }
  for (const op of await pendingFor("duty")) {
    base = op.kind === "time_in" ? { on_duty: true, since: op.at, pending: true } : { on_duty: false, since: null, pending: true };
  }
  // A check-in at a job times you in if you had not: the server does it
  // when the check-in arrives, so a waiting one counts already.
  if (!base.on_duty) {
    const checkin = (await pendingFor("attendance")).find((o) => o.kind === "checkin");
    if (checkin) base = { on_duty: true, since: checkin.at, pending: true };
  }
  return base;
}

/** Time in or out - with or without signal; the place travels with it. */
export async function timeInOut(kind: "time_in" | "time_out"): Promise<Duty & { queued?: boolean }> {
  const where = await whereami();
  const r = await submit({
    kind, scope: "duty", label: kind === "time_in" ? "Time in" : "Time out",
    method: "post", url: "/attendance/duty/", json: { kind, ...where },
  });
  return { ...(await getDuty()), queued: r.queued };
}
