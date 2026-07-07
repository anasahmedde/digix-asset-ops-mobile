export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone: string;
  is_field_staff: boolean;
}

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  site_name?: string | null;
  device_code?: string | null;
  due_date?: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  asset_code: string;
  serial_number: string;
  display_name?: string;
  asset_type_name?: string | null;
  device_model_name?: string;
  status: string;
  site_name?: string | null;
  client_name?: string | null;
  warranty_status?: string;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  city: string;
  client_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  device_count?: number;
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  ops_manager: "Operations Manager",
  supervisor: "Supervisor",
  technician: "Technician",
  finance: "Finance",
  warehouse: "Warehouse Staff",
  client_viewer: "Client Viewer",
};

export const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#f59e0b",
  on_hold: "#6b7280",
  blocked: "#ef4444",
  pending_review: "#8b5cf6",
  approved: "#10b981",
  rejected: "#ef4444",
  closed: "#6b7280",
  active: "#10b981",
  installed: "#10b981",
  under_maintenance: "#f59e0b",
  in_stock: "#3b82f6",
  decommissioned: "#6b7280",
  lost_stolen: "#ef4444",
};

export function labelize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
