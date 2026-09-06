/**
 * services/supabase-data-service.js
 * ---------------------------------------------------------------------
 * REAL shared backend. Implements the exact same method names as
 * services/local-storage-service.js, so nothing else in the app had to
 * change to use this — see services/data-service.js for the one line
 * that switches between them.
 *
 * HOW IT WORKS (important to understand before touching this file):
 *   - All reads (getBookings, getEmployees, etc.) are SYNCHRONOUS — they
 *     return an in-memory cache, not a live network call. This is what
 *     lets every other file in the app (booking.js, app.js, admin.js,
 *     amal.js) stay exactly as written, with no async/await anywhere.
 *   - All writes (createBooking, cancelBooking, etc.) update that same
 *     cache IMMEDIATELY (optimistic update) and fire the real Supabase
 *     write in the background. The function returns synchronously, same
 *     as before.
 *   - On page load, `init()` fetches every table once into the cache,
 *     seeds default data if the tables are empty, and opens Realtime
 *     subscriptions. `dataService.ready` resolves once that's done —
 *     app.js/admin.js/amal.js each `await dataService.ready` once before
 *     their first render.
 *   - When ANY device changes bookings/swaps/attendance/employees/config,
 *     Realtime pushes that change to every open tab, which re-fetches
 *     that table and calls every registered onChange() callback — that's
 *     what makes two different phones see the same data live.
 *
 * KNOWN LIMITATION (documented honestly, not hidden): booking CREATION is
 * now fully race-proof — see create_booking_safe() in supabase-setup.sql,
 * which re-checks every rule and takes a per-day advisory lock inside a
 * single Postgres transaction, so two devices booking the same popular
 * slot at the same instant can never both win. Swap ACCEPTANCE still only
 * re-validates client-side (against the calling device's cache) before
 * committing — a much rarer race in practice (it needs two specific
 * people to both act on the same swap within the same instant), but it
 * is not yet hardened the same way. A future step would give swaps the
 * same treatment: a `respond_to_swap_safe()` Postgres function.
 *
 * Notifications and the activity log are currently GLOBAL (shared by
 * everyone), not per-employee — every device sees the same notification
 * feed. That's a reasonable default for a 12-person team's operational
 * visibility, but it's worth knowing if it feels noisy later.
 * ---------------------------------------------------------------------
 */

const SUPABASE_URL = "https://afqadtjtqtellqgenrgn.supabase.co";
const SUPABASE_KEY = "sb_publishable_8etIDm7Eg_LZwc600YuZpA_AFMoLtCt";

const SupabaseDataService = (() => {
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const cache = {
    employees: [],
    attendance: {},
    bookings: [],
    swaps: [],
    notifications: [],
    activityLog: [],
    config: {}
  };

  const changeListeners = [];
  function onChange(fn) { changeListeners.push(fn); }
  function notifyChange() { changeListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  function newId() { return "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }
  function empName(id) { const e = cache.employees.find(x => x.id === id); return e ? e.name : "Employee"; }

  // ---- row <-> app-shape mapping ----
  const bookingFromRow = r => ({
    id: r.id, day: r.day, employeeId: r.employee_id, start: r.start_min, end: r.end_min, duration: r.duration,
    reason: r.reason || "", status: r.status, bookedAt: r.booked_at, startedAt: r.started_at,
    completedAt: r.completed_at, cancelledAt: r.cancelled_at
  });
  const swapFromRow = r => ({
    id: r.id, fromBookingId: r.from_booking_id, toBookingId: r.to_booking_id,
    fromEmployeeId: r.from_employee_id, toEmployeeId: r.to_employee_id, day: r.day,
    status: r.status, requestedAt: r.requested_at, respondedAt: r.responded_at
  });
  const employeeFromRow = r => ({ id: r.id, name: r.name, nameEn: r.name_en, gender: r.gender });
  const notificationFromRow = r => ({ id: r.id, title: r.title, body: r.body, type: r.type, read: r.read, createdAt: r.created_at });

  // ---- refresh one slice of the cache from Supabase ----
  async function refreshEmployees() {
    const { data, error } = await client.from("employees").select("*").order("id");
    if (error) { console.error("refreshEmployees", error); return; }
    cache.employees = (data || []).map(employeeFromRow);
  }
  async function refreshAttendance() {
    const { data, error } = await client.from("attendance").select("*");
    if (error) { console.error("refreshAttendance", error); return; }
    const att = {};
    DAY_ORDER.forEach(d => { att[d] = []; });
    (data || []).forEach(r => { if (!att[r.day]) att[r.day] = []; att[r.day].push(r.employee_id); });
    cache.attendance = att;
  }
  async function refreshBookings() {
    const { data, error } = await client.from("bookings").select("*").order("start_min");
    if (error) { console.error("refreshBookings", error); return; }
    cache.bookings = (data || []).map(bookingFromRow);
  }
  async function refreshSwaps() {
    const { data, error } = await client.from("swaps").select("*").order("requested_at", { ascending: false });
    if (error) { console.error("refreshSwaps", error); return; }
    cache.swaps = (data || []).map(swapFromRow);
  }
  async function refreshNotifications() {
    const { data, error } = await client.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) { console.error("refreshNotifications", error); return; }
    cache.notifications = (data || []).map(notificationFromRow);
  }
  async function refreshActivityLog() {
    const { data, error } = await client.from("activity_log").select("*").order("ts", { ascending: false }).limit(200);
    if (error) { console.error("refreshActivityLog", error); return; }
    cache.activityLog = (data || []).map(r => ({ ts: r.ts, action: r.action }));
  }
  async function refreshConfig() {
    const { data, error } = await client.from("app_config").select("*").eq("id", 1).maybeSingle();
    if (error) { console.error("refreshConfig", error); return; }
    if (data && data.data) cache.config = data.data;
  }

  // ---- first-run seeding: only inserts if the table is genuinely empty ----
  async function ensureSeeded() {
    if (cache.employees.length === 0) {
      const rows = EMPLOYEES.map(e => ({ id: e.id, name: e.name, name_en: e.nameEn, gender: e.gender }));
      const { error } = await client.from("employees").insert(rows);
      if (error) console.error("seed employees", error);
      await refreshEmployees();
    }
    const attendanceCount = Object.values(cache.attendance).reduce((s, a) => s + a.length, 0);
    if (attendanceCount === 0) {
      const rows = [];
      Object.keys(DEFAULT_ATTENDANCE).forEach(day => DEFAULT_ATTENDANCE[day].forEach(id => rows.push({ day, employee_id: id })));
      const { error } = await client.from("attendance").insert(rows);
      if (error) console.error("seed attendance", error);
      await refreshAttendance();
    }
    if (!cache.config || Object.keys(cache.config).length === 0) {
      const { error } = await client.from("app_config").upsert({ id: 1, data: CONFIG });
      if (error) console.error("seed config", error);
      cache.config = Object.assign({}, CONFIG);
    } else {
      Object.assign(CONFIG, cache.config);
    }
  }

  let readyResolve;
  const readyPromise = new Promise(res => { readyResolve = res; });

  function setupRealtime() {
    client.channel("public:bookings").on("postgres_changes", { event: "*", schema: "public", table: "bookings" },
      async () => { await refreshBookings(); notifyChange(); }).subscribe();
    client.channel("public:swaps").on("postgres_changes", { event: "*", schema: "public", table:
