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

### Wave 1 — Admin core  ← CURRENT
- [ ] **Native Dashboard hub** — KPI cards (from `dashboard_stats`) + role-gated module grid;
      becomes the Dashboard tab (WebView demoted to fallback for un-built modules)
- [ ] **Assets registry** — native list (search + status filter, paginated) → asset detail (exists)
- [ ] **Clients** — list + detail + create/edit
- [ ] **Work Orders** — list + detail (+ status transition)
- [ ] Keep WebView fallback for everything else
- [ ] Build APK + test on emulator + merge

### Wave 2 — Supply chain
- [ ] Inventory (stock/items) · Procurement (POs) · Suppliers/Vendors · Maintenance schedules

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
