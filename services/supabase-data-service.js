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
 * KNOWN LIMITATION (documented honestly, not hidden): the optimistic
 * "check then write" pattern has a small race window — if two people
 * tap "Confirm" on the exact same slot within the same second, both
 * could succeed client-side before Realtime catches the conflict. For
 * a 12-person team this is a rare edge case, not a demo-mode issue, but
 * it is not eliminated. A future hardening step would move the final
 * validation into a Postgres function (RPC) so the database itself
 * rejects a second conflicting write — see requirement #119 in the
 * original brief for why this matters at scale.
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
    client.channel("public:swaps").on("postgres_changes", { event: "*", schema: "public", table: "swaps" },
      async () => { await refreshSwaps(); notifyChange(); }).subscribe();
    client.channel("public:attendance").on("postgres_changes", { event: "*", schema: "public", table: "attendance" },
      async () => { await refreshAttendance(); notifyChange(); }).subscribe();
    client.channel("public:employees").on("postgres_changes", { event: "*", schema: "public", table: "employees" },
      async () => { await refreshEmployees(); notifyChange(); }).subscribe();
    client.channel("public:app_config").on("postgres_changes", { event: "*", schema: "public", table: "app_config" },
      async () => { await refreshConfig(); Object.assign(CONFIG, cache.config); notifyChange(); }).subscribe();
    client.channel("public:notifications").on("postgres_changes", { event: "*", schema: "public", table: "notifications" },
      async () => { await refreshNotifications(); notifyChange(); }).subscribe();
  }

  async function init() {
    await Promise.all([refreshEmployees(), refreshAttendance(), refreshConfig(), refreshBookings(), refreshSwaps(), refreshNotifications(), refreshActivityLog()]);
    await ensureSeeded();
    setupRealtime();
    readyResolve();
  }

  // ---------------------------------------------------------------
  // BOOKINGS
  // ---------------------------------------------------------------
  function getBookings() { return cache.bookings; }

  function createBooking({ day, employeeId, start, end, duration, reason }) {
    const booking = {
      id: newId(), day, employeeId, start, end, duration, reason: reason || "", status: "confirmed",
      bookedAt: new Date().toISOString(), startedAt: null, completedAt: null, cancelledAt: null
    };
    cache.bookings.push(booking);
    client.from("bookings").insert({
      id: booking.id, day, employee_id: employeeId, start_min: start, end_min: end, duration,
      reason: booking.reason, status: "confirmed", booked_at: booking.bookedAt
    }).then(({ error }) => { if (error) console.error("createBooking", error); });
    logActivity(`${empName(employeeId)} booked ${minutesToLabel(start)}–${minutesToLabel(end)}`);
    return booking;
  }

  function cancelBooking(id) {
    const booking = cache.bookings.find(b => b.id === id);
    if (!booking) return null;
    booking.status = "cancelled";
    booking.cancelledAt = new Date().toISOString();
    client.from("bookings").update({ status: "cancelled", cancelled_at: booking.cancelledAt }).eq("id", id)
      .then(({ error }) => { if (error) console.error("cancelBooking", error); });
    logActivity(`${empName(booking.employeeId)} cancelled ${minutesToLabel(booking.start)}–${minutesToLabel(booking.end)}`);
    return booking;
  }

  function updateBookingStatus(id, status, extra) {
    const booking = cache.bookings.find(b => b.id === id);
    if (!booking) return null;
    booking.status = status;
    Object.assign(booking, extra || {});
    const patch = { status };
    if (extra && "startedAt" in extra) patch.started_at = extra.startedAt;
    if (extra && "completedAt" in extra) patch.completed_at = extra.completedAt;
    client.from("bookings").update(patch).eq("id", id).then(({ error }) => { if (error) console.error("updateBookingStatus", error); });
    return booking;
  }

  // ---------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------
  function getConfig() { return Object.assign({}, CONFIG, cache.config); }
  function updateConfig(patch) {
    const merged = Object.assign({}, getConfig(), patch);
    cache.config = merged;
    Object.assign(CONFIG, merged);
    client.from("app_config").upsert({ id: 1, data: merged }).then(({ error }) => { if (error) console.error("updateConfig", error); });
    logActivity("Admin updated system configuration");
    return merged;
  }

  // ---------------------------------------------------------------
  // EMPLOYEES
  // ---------------------------------------------------------------
  function getEmployees() { return cache.employees; }
  function updateEmployees(list) {
    cache.employees = list;
    const rows = list.map(e => ({ id: e.id, name: e.name, name_en: e.nameEn, gender: e.gender }));
    client.from("employees").upsert(rows).then(({ error }) => { if (error) console.error("updateEmployees", error); });
    logActivity("Admin updated the employee roster");
    return list;
  }

  // ---------------------------------------------------------------
  // ATTENDANCE
  // ---------------------------------------------------------------
  function getAttendance() { return cache.attendance; }
  function updateAttendance(newAttendance) {
    cache.attendance = newAttendance;
    const rows = [];
    Object.keys(newAttendance).forEach(day => (newAttendance[day] || []).forEach(id => rows.push({ day, employee_id: id })));
    client.from("attendance").delete().neq("day", "___never___")
      .then(() => client.from("attendance").insert(rows))
      .then(({ error }) => { if (error) console.error("updateAttendance", error); });
    logActivity("Admin updated the attendance schedule");
    return newAttendance;
  }

  // ---------------------------------------------------------------
  // NOTIFICATIONS (global feed — see file header note)
  // ---------------------------------------------------------------
  function getNotifications() { return cache.notifications; }
  function addNotification({ title, body, type }) {
    const n = { id: newId(), title, body, type: type || "info", read: false, createdAt: new Date().toISOString() };
    cache.notifications.unshift(n);
    cache.notifications = cache.notifications.slice(0, 100);
    client.from("notifications").insert({ id: n.id, title, body, type: n.type, read: false, created_at: n.createdAt })
      .then(({ error }) => { if (error) console.error("addNotification", error); });
    return n;
  }
  function markNotificationRead(id) {
    const n = cache.notifications.find(x => x.id === id);
    if (n) n.read = true;
    client.from("notifications").update({ read: true }).eq("id", id).then(({ error }) => { if (error) console.error("markNotificationRead", error); });
  }
  function markAllNotificationsRead() {
    cache.notifications.forEach(n => { n.read = true; });
    client.from("notifications").update({ read: true }).eq("read", false).then(({ error }) => { if (error) console.error("markAllNotificationsRead", error); });
  }

  // ---------------------------------------------------------------
  // ACTIVITY LOG
  // ---------------------------------------------------------------
  function getActivityLog() { return cache.activityLog; }
  function logActivity(action) {
    const entry = { ts: new Date().toISOString(), action };
    cache.activityLog.unshift(entry);
    cache.activityLog = cache.activityLog.slice(0, 200);
    client.from("activity_log").insert({ ts: entry.ts, action }).then(({ error }) => { if (error) console.error("logActivity", error); });
  }

  // ---------------------------------------------------------------
  // SWAP REQUESTS — identical rules to the local-storage version; see
  // services/local-storage-service.js for the fully-commented original.
  // ---------------------------------------------------------------
  function getSwapRequests() { expireOldSwaps(); return cache.swaps; }

  function createSwapRequest(fromBookingId, toBookingId) {
    const fromBooking = cache.bookings.find(b => b.id === fromBookingId);
    const toBooking = cache.bookings.find(b => b.id === toBookingId);
    if (!fromBooking || !toBooking) return null;
    const swap = {
      id: newId(), fromBookingId, toBookingId, fromEmployeeId: fromBooking.employeeId, toEmployeeId: toBooking.employeeId,
      day: fromBooking.day, status: "pending", requestedAt: new Date().toISOString(), respondedAt: null
    };
    cache.swaps.unshift(swap);
    client.from("swaps").insert({
      id: swap.id, from_booking_id: fromBookingId, to_booking_id: toBookingId,
      from_employee_id: swap.fromEmployeeId, to_employee_id: swap.toEmployeeId, day: swap.day,
      status: "pending", requested_at: swap.requestedAt
    }).then(({ error }) => { if (error) console.error("createSwapRequest", error); });
    logActivity(`Swap requested: ${empName(swap.fromEmployeeId)} ⇄ ${empName(swap.toEmployeeId)}`);
    return swap;
  }

  function respondToSwap(swapId, accept) {
    const swap = cache.swaps.find(s => s.id === swapId);
    if (!swap || swap.status !== "pending") return { ok: false, reasonKey: "swapNotFound" };

    if (!accept) {
      swap.status = "declined";
      swap.respondedAt = new Date().toISOString();
      client.from("swaps").update({ status: "declined", responded_at: swap.respondedAt }).eq("id", swapId).then(({ error }) => { if (error) console.error(error); });
      logActivity(`Swap declined (${empName(swap.fromEmployeeId)} ⇄ ${empName(swap.toEmployeeId)})`);
      return { ok: true };
    }

    const fromBooking = cache.bookings.find(b => b.id === swap.fromBookingId);
    const toBooking = cache.bookings.find(b => b.id === swap.toBookingId);
    if (!fromBooking || !toBooking || fromBooking.status !== "confirmed" || toBooking.status !== "confirmed") {
      return { ok: false, reasonKey: "swapBookingGone" };
    }
    const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
    const todayName = DAY_ORDER[new Date().getDay()];
    if (fromBooking.day === todayName && nowMin >= fromBooking.start) return { ok: false, reasonKey: "swapAlreadyStarted" };
    if (toBooking.day === todayName && nowMin >= toBooking.start) return { ok: false, reasonKey: "swapAlreadyStarted" };

    // Dry-run validation: temporarily hide the two swapping bookings from
    // the cache, re-run the real evaluateSlot() rule engine (js/booking.js)
    // for each side's NEW time, then restore the cache either way.
    const originalBookings = cache.bookings;
    cache.bookings = originalBookings.filter(b => b.id !== fromBooking.id && b.id !== toBooking.id);
    const fromCheck = evaluateSlot(fromBooking.employeeId, toBooking.day, toBooking.start, toBooking.end);
    const toCheck = evaluateSlot(toBooking.employeeId, fromBooking.day, fromBooking.start, fromBooking.end);
    cache.bookings = originalBookings;
    if (fromCheck.status !== "available" || toCheck.status !== "available") {
      return { ok: false, reasonKey: "swapNoLongerValid" };
    }

    const tmp = { start: fromBooking.start, end: fromBooking.end, duration: fromBooking.duration, day: fromBooking.day };
    fromBooking.start = toBooking.start; fromBooking.end = toBooking.end; fromBooking.duration = toBooking.duration; fromBooking.day = toBooking.day;
    toBooking.start = tmp.start; toBooking.end = tmp.end; toBooking.duration = tmp.duration; toBooking.day = tmp.day;

    client.from("bookings").update({ start_min: fromBooking.start, end_min: fromBooking.end, duration: fromBooking.duration, day: fromBooking.day })
      .eq("id", fromBooking.id).then(({ error }) => { if (error) console.error(error); });
    client.from("bookings").update({ start_min: toBooking.start, end_min: toBooking.end, duration: toBooking.duration, day: toBooking.day })
      .eq("id", toBooking.id).then(({ error }) => { if (error) console.error(error); });

    swap.status = "accepted";
    swap.respondedAt = new Date().toISOString();
    client.from("swaps").update({ status: "accepted", responded_at: swap.respondedAt }).eq("id", swapId).then(({ error }) => { if (error) console.error(error); });
    logActivity(`Swap accepted: ${empName(swap.fromEmployeeId)} ⇄ ${empName(swap.toEmployeeId)}`);
    return { ok: true };
  }

  function expireOldSwaps() {
    const cfg = getConfig();
    const now = Date.now();
    cache.swaps.forEach(s => {
      if (s.status === "pending" && (now - new Date(s.requestedAt).getTime()) > cfg.swapExpirationMinutes * 60000) {
        s.status = "expired";
        client.from("swaps").update({ status: "expired" }).eq("id", s.id).then(({ error }) => { if (error) console.error(error); });
      }
    });
  }

  // ---------------------------------------------------------------
  // DEMO DATA RESET — intentionally disabled on the real shared backend.
  // Wiping this would delete every real employee's real bookings.
  // ---------------------------------------------------------------
  function resetAllDemoData() {
    console.warn("resetAllDemoData is disabled — this is a real shared database now, not demo storage.");
  }

  init(); // kick off the initial load the moment this script runs

  return {
    ready: readyPromise, onChange,
    getBookings, createBooking, cancelBooking, updateBookingStatus,
    getConfig, updateConfig,
    getEmployees, updateEmployees,
    getAttendance, updateAttendance,
    getNotifications, addNotification, markNotificationRead, markAllNotificationsRead,
    getActivityLog, logActivity,
    getSwapRequests, createSwapRequest, respondToSwap,
    resetAllDemoData
  };
})();
