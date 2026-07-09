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
  ticket_number?: string;
  occurrence?: number;
  issue_type?: string | null;
  issue_type_name?: string | null;
  assigned_vendor_name?: string | null;
  parts_used?: string;
  response_due_at?: string | null;
  escalated?: boolean;
  is_response_overdue?: boolean;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  site?: string | null;
  site_name?: string | null;
  device?: string | null;
  device_code?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  reported_by?: string | null;
  reported_by_name?: string | null;
  due_date?: string | null;
  completion_notes?: string;
  blocked_reason?: string;
  hold_reason?: string;
  review_comments?: string;
  attachment_count?: number;
  comment_count?: number;
  attachments?: TicketAttachment[];
  comments?: TicketComment[];
  created_at: string;
  updated_at?: string;
}

export interface TicketComment {
  id: string;
  ticket: string;
  author: string | null;
  author_name: string | null;
  content: string;
  comment_type: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
}

export interface TicketAttachment {
  id: string;
  ticket: string;
  uploaded_by_name: string | null;
  file: string;
  caption: string;
  attachment_type: string;
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
  contact_person?: string;
  contact_phone?: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  display_name?: string;
  room_type: "direct" | "group";
  participants: string[];
  participant_names: string[];
  last_message: ChatMessage | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  sender: string;
  sender_name: string;
  content: string;
  message_type: string;
  file_url?: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  ticket?: string | null;
  data?: Record<string, unknown>;
  is_read: boolean;
  is_actionable?: boolean;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user: string;
  user_name: string;
  check_type: "check_in" | "check_out";
  check_type_display: string;
  latitude: string | null;
  longitude: string | null;
  accuracy: number | null;
  site: string | null;
  site_name: string | null;
  note: string;
  created_at: string;
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

export function labelize(value?: string | null): string {
  if (!value) return "—";
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
