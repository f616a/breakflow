/**
 * services/local-storage-service.js
 * ---------------------------------------------------------------------
 * DEMO-MODE backend. Implements the same method names dataService.js
 * exposes to the rest of the app, backed by the browser's localStorage.
 *
 * IMPORTANT (requirement #56): localStorage is per-browser, per-device.
 * If this app is opened from 12 different phones, each phone has its
 * own separate, disconnected copy of the data. This is fine for a demo
 * or a single shared kiosk device; it is NOT a real multi-user backend.
 * A real deployment needs a shared database (Supabase, Firebase, etc.)
 * — see services/data-service.js for how that swap happens without
 * touching any UI file.
 * ---------------------------------------------------------------------
 */

const LocalStorageDataService = (() => {

  const KEYS = {
    bookings: "breakflow_bookings",
    config: "breakflow_config",
    employees: "breakflow_employees",
    attendance: "breakflow_attendance",
    notifications: "breakflow_notifications",
    activityLog: "breakflow_activity_log",
    swaps: "breakflow_swaps"
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { /* storage unavailable — app still works, just won't persist */ }
  }

  function newId() {
    return "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------
  // BOOKINGS
  // ---------------------------------------------------------------
  function getBookings() {
    return safeGet(KEYS.bookings, []);
  }

  function createBooking({ day, employeeId, start, end, duration, reason }) {
    const bookings = getBookings();
    const booking = {
      id: newId(),
      day, employeeId, start, end, duration,
      reason: reason || "",
      status: "confirmed", // confirmed | on-break | completed | cancelled
      bookedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null
    };
    bookings.push(booking);
    safeSet(KEYS.bookings, bookings);
    logActivity(`${getEmployeeById(employeeId)?.name || "Employee"} booked ${minutesToLabel(start)}–${minutesToLabel(end)}`);
    return booking;
  }

  function cancelBooking(id) {
    const bookings = getBookings();
    const booking = bookings.find(b => b.id === id);
    if (!booking) return null;
    // Soft-cancel: keep the record (status="cancelled") so Amal's full
    // break list and activity log retain real history — active queries
    // (bookingsForDay, availability checks) already filter status
    // !== "cancelled", so this doesn't affect booking logic.
    booking.status = "cancelled";
    booking.cancelledAt = new Date().toISOString();
    safeSet(KEYS.bookings, bookings);
    logActivity(`${getEmployeeById(booking.employeeId)?.name || "Employee"} cancelled ${minutesToLabel(booking.start)}–${minutesToLabel(booking.end)}`);
    return booking;
  }

  function updateBookingStatus(id, status, extra) {
    const bookings = getBookings();
    const booking = bookings.find(b => b.id === id);
    if (!booking) return null;
    booking.status = status;
    Object.assign(booking, extra || {});
    safeSet(KEYS.bookings, bookings);
    return booking;
  }

  // ---------------------------------------------------------------
  // CONFIG (shift hours, break rules, max concurrent, etc.)
  // ---------------------------------------------------------------
  function getConfig() {
    return Object.assign({}, CONFIG, safeGet(KEYS.config, {}));
  }
  function updateConfig(patch) {
    const merged = Object.assign({}, getConfig(), patch);
    safeSet(KEYS.config, merged);
    Object.assign(CONFIG, merged);
    logActivity("Admin updated system configuration");
    return merged;
  }

  // ---------------------------------------------------------------
  // EMPLOYEES
  // ---------------------------------------------------------------
  function getEmployees() {
    return safeGet(KEYS.employees, EMPLOYEES);
  }
  function updateEmployees(list) {
    safeSet(KEYS.employees, list);
    logActivity("Admin updated the employee roster");
    return list;
  }

  // ---------------------------------------------------------------
  // ATTENDANCE
  // ---------------------------------------------------------------
  function getAttendance() {
    return safeGet(KEYS.attendance, DEFAULT_ATTENDANCE);
  }
  function updateAttendance(newAttendance) {
    safeSet(KEYS.attendance, newAttendance);
    logActivity("Admin updated the attendance schedule");
    return newAttendance;
  }

  // ---------------------------------------------------------------
  // NOTIFICATIONS (in-app center — see js/notifications.js for rendering)
  // ---------------------------------------------------------------
  function getNotifications() {
    return safeGet(KEYS.notifications, []);
  }
  function addNotification({ title, body, type }) {
    const list = getNotifications();
    list.unshift({
      id: newId(), title, body, type: type || "info",
      read: false, createdAt: new Date().toISOString()
    });
    safeSet(KEYS.notifications, list.slice(0, 100));
    return list[0];
  }
  function markNotificationRead(id) {
    const list = getNotifications();
    const n = list.find(x => x.id === id);
    if (n) n.read = true;
    safeSet(KEYS.notifications, list);
  }
  function markAllNotificationsRead() {
    const list = getNotifications().map(n => Object.assign({}, n, { read: true }));
    safeSet(KEYS.notifications, list);
  }

  // ---------------------------------------------------------------
  // ACTIVITY LOG (operational, chronological — shown in Amal's Space)
  // ---------------------------------------------------------------
  function getActivityLog() {
    return safeGet(KEYS.activityLog, []);
  }
  function logActivity(action) {
    const list = getActivityLog();
    list.unshift({ ts: new Date().toISOString(), action });
    safeSet(KEYS.activityLog, list.slice(0, 200));
  }

  // ---------------------------------------------------------------
  // SWAP REQUESTS — swaps the TIME SLOTS of two existing bookings.
  // Never moves minutes between employees' daily allowances (requirement
  // #24) — each booking keeps its own employeeId; only start/end/duration
  // trade places once BOTH sides have accepted.
  // ---------------------------------------------------------------
  function getSwapRequests() {
    expireOldSwaps();
    return safeGet(KEYS.swaps, []);
  }

  function createSwapRequest(fromBookingId, toBookingId) {
    const bookings = getBookings();
    const fromBooking = bookings.find(b => b.id === fromBookingId);
    const toBooking = bookings.find(b => b.id === toBookingId);
    if (!fromBooking || !toBooking) return null;

    const list = getSwapRequests();
    const swap = {
      id: newId(),
      fromBookingId, toBookingId,
      fromEmployeeId: fromBooking.employeeId, toEmployeeId: toBooking.employeeId,
      day: fromBooking.day,
      status: "pending", // pending | accepted | declined | expired
      requestedAt: new Date().toISOString(),
      respondedAt: null
    };
    list.unshift(swap);
    safeSet(KEYS.swaps, list);
    logActivity(`Swap requested: ${getEmployeeById(fromBooking.employeeId)?.name || "?"} ⇄ ${getEmployeeById(toBooking.employeeId)?.name || "?"}`);
    return swap;
  }

  /**
   * @param {string} swapId
   * @param {boolean} accept
   * @returns {{ok:true}|{ok:false, reasonKey:string}}
   */
  function respondToSwap(swapId, accept) {
    const list = getSwapRequests();
    const swap = list.find(s => s.id === swapId);
    if (!swap || swap.status !== "pending") return { ok: false, reasonKey: "swapNotFound" };

    if (!accept) {
      swap.status = "declined";
      swap.respondedAt = new Date().toISOString();
      safeSet(KEYS.swaps, list);
      logActivity(`Swap declined (${getEmployeeById(swap.fromEmployeeId)?.name || "?"} ⇄ ${getEmployeeById(swap.toEmployeeId)?.name || "?"})`);
      return { ok: true };
    }

    // Full validation re-run before committing (requirement #26) — booking
    // must still exist and not have started; every rule is re-checked with
    // the OTHER employee's new time, excluding the swapping bookings
    // themselves from the conflict checks (they're about to change).
    const bookings = getBookings();
    const fromBooking = bookings.find(b => b.id === swap.fromBookingId);
    const toBooking = bookings.find(b => b.id === swap.toBookingId);
    if (!fromBooking || !toBooking || fromBooking.status !== "confirmed" || toBooking.status !== "confirmed") {
      return { ok: false, reasonKey: "swapBookingGone" };
    }
    const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
    if (fromBooking.day === DAY_ORDER[new Date().getDay()] && nowMin >= fromBooking.start) {
      return { ok: false, reasonKey: "swapAlreadyStarted" };
    }
    if (toBooking.day === DAY_ORDER[new Date().getDay()] && nowMin >= toBooking.start) {
      return { ok: false, reasonKey: "swapAlreadyStarted" };
    }

    // Simulate the swap on a temporary copy of bookings, then re-run every
    // real booking rule (evaluateSlot from js/booking.js) for each side's
    // NEW time — excluding their own two bookings from the conflict set.
    const otherBookings = bookings.filter(b => b.id !== fromBooking.id && b.id !== toBooking.id);
    const check = (employeeId, day, start, end, excludeId) => {
      const stash = getBookings;
      const original = safeGet(KEYS.bookings, []);
      safeSet(KEYS.bookings, otherBookings.concat(
        original.filter(b => b.id !== fromBooking.id && b.id !== toBooking.id && b.id !== excludeId)
      ));
      const result = evaluateSlot(employeeId, day, start, end);
      safeSet(KEYS.bookings, original); // restore immediately — this is a dry run
      return result;
    };
    const fromCheck = check(fromBooking.employeeId, toBooking.day, toBooking.start, toBooking.end, fromBooking.id);
    const toCheck = check(toBooking.employeeId, fromBooking.day, fromBooking.start, fromBooking.end, toBooking.id);
    if (fromCheck.status !== "available" || toCheck.status !== "available") {
      return { ok: false, reasonKey: "swapNoLongerValid" };
    }

    // Commit: trade start/end/duration only — employeeId never changes.
    const freshBookings = getBookings();
    const fb = freshBookings.find(b => b.id === fromBooking.id);
    const tb = freshBookings.find(b => b.id === toBooking.id);
    const tmp = { start: fb.start, end: fb.end, duration: fb.duration, day: fb.day };
    fb.start = tb.start; fb.end = tb.end; fb.duration = tb.duration; fb.day = tb.day;
    tb.start = tmp.start; tb.end = tmp.end; tb.duration = tmp.duration; tb.day = tmp.day;
    safeSet(KEYS.bookings, freshBookings);

    swap.status = "accepted";
    swap.respondedAt = new Date().toISOString();
    safeSet(KEYS.swaps, list);
    logActivity(`Swap accepted: ${getEmployeeById(swap.fromEmployeeId)?.name || "?"} ⇄ ${getEmployeeById(swap.toEmployeeId)?.name || "?"}`);
    return { ok: true };
  }

  function expireOldSwaps() {
    const cfg = getConfig();
    const list = safeGet(KEYS.swaps, []);
    const now = Date.now();
    let changed = false;
    list.forEach(s => {
      if (s.status === "pending" && (now - new Date(s.requestedAt).getTime()) > cfg.swapExpirationMinutes * 60000) {
        s.status = "expired";
        changed = true;
      }
    });
    if (changed) safeSet(KEYS.swaps, list);
  }

  // ---------------------------------------------------------------
  // DEMO DATA / RESET (development only — see README)
  // ---------------------------------------------------------------
  function resetAllDemoData() {
    Object.values(KEYS).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  return {
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

/*
 * STILL NOT IMPLEMENTED (architecture-ready, ships later):
 *   joinWaitlist(employeeId, day, start, end, duration)
 *   offerWaitlistSlot(waitlistId)
 * Intentionally omitted rather than stubbed with fake success — per the
 * "no fake functionality" requirement, nothing calls them yet.
 */
