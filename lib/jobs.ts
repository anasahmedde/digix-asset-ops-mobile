import api from "./api";

/** An installation on the tracker, as the list serializer sends it. */
export interface InstallationJob {
  id: string;
  device: string;
  device_code: string;
  device_name: string;
  site: string;
  site_name: string;
  position_label: string;
  due_date: string | null;
  completed_at: string | null;
  installed_by: string | null;
  progress: number;
  steps_done?: number;
  steps_total?: number;
  handover?: unknown;
}

/** A maintenance job (schedule), corrective or preventive. */
export interface MaintenanceJob {
  id: string;
  title: string;
  maintenance_type: "preventive" | "corrective";
  status: string;
  status_display: string;
  priority: string;
  device: string | null;
  device_code: string | null;
  device_name: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  ticket: string | null;
  ticket_number: string | null;
  next_due?: string | null;
  frequency?: string;
}

const OPEN_JOB = new Set(["active", "pending", "in_process", "on_hold", "overdue"]);

export async function myInstallations(me: string): Promise<InstallationJob[]> {
  const { data } = await api.get("/sites/installations/", { params: { installed_by: me, page_size: 100, ordering: "due_date" } });
  return (data.results ?? data) as InstallationJob[];
}

export async function myMaintenance(me: string): Promise<MaintenanceJob[]> {
  // The jobs this person is on now: their open visit, or a job in their
  // name with none open. By the job's name alone, a job whose visit had gone
  // to somebody else stayed in this list with nothing to do.
  const { data } = await api.get("/maintenance/schedules/", { params: { technician: me, page_size: 100, ordering: "next_due" } });
  return (data.results ?? data) as MaintenanceJob[];
}

export const isOpenInstallation = (j: InstallationJob) => !j.completed_at;
export const isOpenMaintenance = (j: MaintenanceJob) => OPEN_JOB.has(j.status);
