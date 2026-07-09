# DIGIX Field — Native Android App Plan (web parity, role-based)

**Goal:** every web dashboard capability available natively on Android, shown per the
logged-in user's role — *exactly* like the web — so the team never needs the browser.

**Architecture decision (locked):**
- **UI is native** (React Native screens using the app's teal design system) — NOT the web look.
- **Backend/API/auth/data are SHARED** with web (`ops.wizioners.com/api`). No second backend.
- Built in **waves**, role-gated. The embedded WebView dashboard stays ONLY as a temporary
  fallback for sections not yet native, and is removed once parity is reached.

**Design system to reuse:** `constants/theme.ts` (teal `#12b48f`), `components/ui.tsx`
(`Card, Button, Pill, StatTile, EmptyState, Loading, SectionHeader, Chip, Avatar`),
`lib/format.ts`, `lib/toast.ts`, `lib/api.ts`.

**Role gates (mirror web `sidebar.tsx`):**
| Section | Roles |
|---|---|
| Dashboard | all |
| Assets | super_admin, ops_manager, technician |
| Installation Tracker | super_admin, ops_manager, technician |
| Maintenance | super_admin, ops_manager, technician |
| Sites | super_admin, ops_manager, technician |
| Tickets | super_admin, ops_manager, supervisor, technician |
| Attendance | super_admin, ops_manager, supervisor |
| Chat / Settings | all |
| Warranties, Projects, Work Orders, Inventory, Alerts, Documents, Vendors, Setup | super_admin, ops_manager (+finance for Procurement/Reports) |
| Clients | super_admin, ops_manager, client_viewer |
| Teams | super_admin |

**Testing note:** `anas` is a **technician** — can't see manager-only sections in a role-based
menu (Clients, Work Orders, Inventory, etc.). Reads via API often still work for testing, but to
verify manager/admin screens end-to-end we need an **admin/ops_manager test login** (pending from client).

---

## Endpoints (verified)
- Dashboard KPIs: `GET /assets/devices/dashboard_stats/` → `{total, working, installed, out_of_order, under_maintenance, in_stock, by_status, by_city}`
- Assets: `GET /assets/devices/` (search, `status`, `current_site`, `assigned_client` filters) · detail by `?search=<code>` · `POST /assets/devices/`
- Clients: `GET /clients/`, `POST /clients/`, `PATCH/DELETE /clients/{id}/` — fields: name, code, contact_person, contact_email, contact_phone, address, is_active
- Work Orders: `GET /work-orders/`, `GET /work-orders/{id}/`, `POST`, `PATCH`, `POST /work-orders/{id}/transition/`, `GET /work-orders/{id}/print/`
- Suppliers: `GET /suppliers/` · Inventory: `/inventory/...` · Procurement: `/procurement/...` · Maintenance: `/maintenance/schedules/` · Alerts: `/analytics/alerts/` · Teams: `/accounts/users/`

---

## WAVES

### Wave 0 — Field/Ops (DONE, native)
- [x] Login (redesigned), Home, Tickets (list/detail/actions), Assets scan+detail, Sites list+detail,
      Installations (steps/photos), Attendance, Chat, Notifications, Profile

### Wave 1 — Admin core  ✅ DONE (2026-07-09, tested on emulator)
- [x] **Native Dashboard hub** (`app/(tabs)/dashboard.tsx`) — KPI cards + role-gated module grid;
      web-only modules show a dot and open the WebView fallback
- [x] **Assets registry** (`app/admin/assets.tsx`) — search + status chips + list → asset detail
- [x] **Clients** (`app/admin/clients.tsx`) — list + search + create/edit sheet + FAB
- [x] **Work Orders** (`app/admin/work-orders.tsx` + `work-order/[id].tsx`) — list + filter + detail + status transitions
- [x] WebView fallback kept (`app/web-view.tsx`, param `path`/`title`)
- [x] Build APK + tested on emulator + merged
- NOTE: create/edit (clients) + work-order data need an **admin/ops_manager login** to fully verify (anas=technician: reads OK, writes 403).

### Wave 2 — Supply chain  ✅ DONE (2026-07-09, tested w/ real data)
- [x] Inventory (`app/admin/inventory.tsx`) — list + search + All/Low-stock chips
- [x] Procurement (`app/admin/procurement.tsx` + `purchase-order/[id].tsx`) — list + status filter + PO detail (items/amounts) — verified 7 POs
- [x] Suppliers/Vendors (`app/admin/suppliers.tsx`) — list + search + create/edit sheet + FAB
- [x] Maintenance (`app/admin/maintenance.tsx`) — list + search + detail sheet (instructions) — verified 8 schedules
- [x] Wired native in the hub (maintenance/inventory/procurement/vendors no longer web)
- NOTE: expired-session UX — when tokens fully expire the app shows a fallback half-state
  ("Field Staff", empty data) instead of redirecting to login. Pre-existing; worth a small fix
  (redirect to /login on refresh failure in `lib/api.ts`).

### Wave 3 — Management & oversight
- [ ] Teams (users/roles) · Projects · Warranties · Reports/Analytics/Finance (charts)

### Wave 4 — Remaining
- [ ] Alerts · Documents · Setup · Settings (native)

### Wave 5 — Finish
- [ ] Remove WebView fallback once 100% native · polish · role-based tab/nav restructure ·
      (optional) offline caching for field data

---

## Working process
- Branch `fix/mobile-polish` → commit per screen → merge to `main` (`anasahmedde/digix-asset-ops-mobile`).
- Build locally: `EXPO_PUBLIC_API_URL=https://ops.wizioners.com/api` + prebuild + gradle assembleRelease.
- Test on Android emulator (adb), screenshot-verify each screen.
- Update the checkboxes in this file as each item lands.
