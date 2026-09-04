/**
 * services/data-service.js
 * ---------------------------------------------------------------------
 * UI code (js/app.js, js/admin.js, js/amal.js, js/booking.js) NEVER
 * calls localStorage directly and never imports
 * LocalStorageDataService by name. It calls `dataService.xxx()`.
 *
 * Today that delegates to LocalStorageDataService. Migrating to a real
 * shared backend later (Supabase, Firebase, a custom API) means:
 *   1. Write services/supabase-data-service.js implementing the exact
 *      same method names/signatures.
 *   2. Change the one line below from LocalStorageDataService to
 *      SupabaseDataService.
 * No other file in the project needs to change.
 * ---------------------------------------------------------------------
 */

const dataService = LocalStorageDataService;
