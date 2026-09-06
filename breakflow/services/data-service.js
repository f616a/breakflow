/**
 * services/data-service.js
 * ---------------------------------------------------------------------
 * UI code (js/app.js, js/admin.js, js/amal.js, js/booking.js) NEVER
 * calls Supabase or localStorage directly. It calls `dataService.xxx()`.
 *
 * Now backed by SupabaseDataService — a real shared database, so every
 * employee's device sees the same bookings/attendance/config live.
 * (Previously this pointed at LocalStorageDataService, kept in the repo
 * as a reference/offline fallback — see services/local-storage-service.js.)
 * ---------------------------------------------------------------------
 */

const dataService = SupabaseDataService;
