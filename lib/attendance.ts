import api from "./api";
import { getCurrentLocation, requestForegroundLocationPermission } from "./location";

/** Where the technician is clocked in, as the server has it. */
export interface Presence {
  checked_in: boolean;
  site: string | null;
  site_name: string | null;
  since: string | null;
}

export async function getPresence(): Promise<Presence> {
  const { data } = await api.get("/attendance/records/status/");
  const last = data.last;
  return {
    checked_in: !!data.checked_in,
    site: data.checked_in ? last?.site ?? null : null,
    site_name: data.checked_in ? last?.site_name ?? null : null,
    since: data.checked_in ? last?.created_at ?? null : null,
  };
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

/** Clock in at a site. The job's buttons open only once this has happened there. */
export async function checkIn(site: string, note = ""): Promise<Presence> {
  const where = await whereami();
  const { data } = await api.post("/attendance/records/", { check_type: "check_in", site, note, ...where });
  // The record just saved already says where the person is. If reading it
  // back fails, the check-in still happened: report it as done rather than
  // as an error, which had people tapping again and checking in twice.
  try {
    return await getPresence();
  } catch {
    return { checked_in: true, site, site_name: data?.site_name ?? null, since: data?.created_at ?? null };
  }
}

export async function checkOut(site: string | null, note = ""): Promise<Presence> {
  const where = await whereami();
  await api.post("/attendance/records/", { check_type: "check_out", site, note, ...where });
  try {
    return await getPresence();
  } catch {
    return { checked_in: false, site: null, site_name: null, since: null };
  }
}

/** True when the person is clocked in at this very site. */
export function onSite(p: Presence | null, site: string | null | undefined): boolean {
  return !!p && p.checked_in && !!site && p.site === site;
}
