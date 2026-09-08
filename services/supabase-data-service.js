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
    config: {},
    leaveRequests: []
  };

  const changeListeners = [];
  function onChange(fn) { changeListeners.push(fn); }
  function notifyChange() { changeListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  function newId() { return "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }
  function empName(id) { const e = cache.employees.find(x => x.id === id); return e ? e.name : "Employee"; }

  // ---- row <-> app-shape mapping ----
  const bookingFromRow = r => ({
    id: r.id, day: r.day, employeeId: r.employee_id, start: r.start_min, end: r.end_min, duration: r.duration,
    reason: r.reason || "", status: r.status, isEmergency: !!r.is_emergency, exceededCapacity: !!r.exceeded_capacity,
    rescheduledFromStart: r.rescheduled_from_start, rescheduledFromEnd: r.rescheduled_from_end,
    bookedAt: r.booked_at, startedAt: r.started_at, completedAt: r.completed_at, cancelledAt: r.cancelled_at
  });
  const swapFromRow = r => ({
    id: r.id, fromBookingId: r.from_booking_id, toBookingId: r.to_booking_id,
    fromEmployeeId: r.from_employee_id, toEmployeeId: r.to_employee_id, day: r.day,
    status: r.status, requestedAt: r.requested_at, respondedAt: r.responded_at
  });
  const employeeFromRow = r => ({ id: r.id, name: r.name, nameEn: r.name_en, gender: r.gender, photoUrl: r.photo_url || "", pin: r.pin || "" });
  const notificationFromRow = r => ({ id: r.id, title: r.title, body: r.body, type: r.type, read: r.read, createdAt: r.created_at });
  const leaveRequestFromRow = r => ({
    id: r.id, employeeId: r.employee_id, day: r.day, compensationMinutes: r.compensation_minutes,
    reason: r.reason || "", createdAt: r.created_at
  });

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
  async function refreshLeaveRequests() {
    const { data, error } = await client.from("leave_requests").select("*").order("created_at", { ascending: false });
    if (error) { console.error("refreshLeaveRequests", error); return; }
    cache.leaveRequests = (data || []).map(leaveRequestFromRow);
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
    client.channel("public:leave_requests").on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" },
      async () => { await refreshLeaveRequests(); notifyChange(); }).subscribe();
  }

  async function init() {
    await Promise.all([refreshEmployees(), refreshAttendance(), refreshConfig(), refreshBookings(), refreshSwaps(), refreshNotifications(), refreshActivityLog(), refreshLeaveRequests()]);
    await ensureSeeded();
    setupRealtime();
    readyResolve();
  }

  // ---------------------------------------------------------------
  // BOOKINGS
  // ---------------------------------------------------------------
  function getBookings() { return cache.bookings; }

  // Optimistic + server-authoritative: the booking appears instantly in the
  // UI (good for the common case), but the REAL decision is made atomically
  // inside Postgres via the create_booking_safe() function (see README /
  // supabase-setup.sql) — it takes a per-day advisory lock so two devices
  // booking the same popular slot at the same instant can never both win.
  // If the server rejects it (lost the race, or the slot filled up in the
  // split second between our check and the write), we roll the optimistic
  // entry back out and tell the person.
  function createBooking({ day, employeeId, start, end, duration, reason }) {
    const id = newId();
    const booking = {
      id, day, employeeId, start, end, duration, reason: reason || "", status: "confirmed",
      bookedAt: new Date().toISOString(), startedAt: null, completedAt: null, cancelledAt: null
    };
    cache.bookings.push(booking); // instant UI feedback — the slot list updates right away

    client.rpc("create_booking_safe", {
      p_id: id, p_day: day, p_employee_id: employeeId, p_start: start, p_end: end,
      p_duration: duration, p_reason: booking.reason
    }).then(({ data, error }) => {
      if (error || !data || !data.ok) {
        if (error) console.error("create_booking_safe", error);
        cache.bookings = cache.bookings.filter(b => b.id !== id);
        notifyChange();
        if (window.NotificationCenter) {
          NotificationCenter.showToast("That time was just taken — please pick another slot.", "danger");
        }
      } else if (window.NotificationCenter && window.MessageService && window.i18n) {
        // Only tell the person "booked!" once the server has actually
        // confirmed it — never before, so there's no misleading success
        // message followed moments later by a silent rollback.
        const emp = cache.employees.find(e => e.id === employeeId);
        NotificationCenter.notify(
          "✓ " + i18n.t("confirmBreak"),
          MessageService.getMessage({
            event: "bookingConfirmed", locale: i18n.current, gender: emp ? emp.gender : "neutral",
            employeeId, args: [null, rangeLabel(start, end)]
          })
        );
        NotificationCenter.SoundEffects.success();
      }
    });

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

  /**
   * "Start Break" with automatic smart extension. If the employee starts
   * later than their scheduled time (e.g. stuck on a customer call), the
   * system first tries to push the END time back by the same delay so
   * they still get their FULL original duration. If that would violate
   * any rule (most commonly: two other people already booked that later
   * time slot, hitting max concurrent capacity), the break simply ends at
   * its original scheduled time instead — the employee just used less
   * time than planned, and the difference becomes ordinary unused daily
   * balance they can book again later (no separate tracking needed: it
   * falls out naturally from shortening this booking's own duration).
   *
   * KNOWN LIMITATION: like swap acceptance, this re-validates against
   * this device's own cache, not inside a single atomic Postgres
   * transaction — a rare race is possible if two people's extensions
   * collide in the same instant. See create_booking_safe() for the
   * pattern a future hardening pass would apply here too.
   */
  function startBreakSmart(bookingId) {
    const booking = cache.bookings.find(b => b.id === bookingId);
    if (!booking || booking.status !== "confirmed") return { ok: false, reasonKey: "notFound" };

    const now = nowMinutes();
    const delay = Math.max(0, now - booking.start);
    const originalEnd = booking.end;
    const originalDuration = booking.duration;
    const startedAt = new Date().toISOString();

    if (delay === 0) {
      booking.status = "on-break";
      booking.startedAt = startedAt;
      client.from("bookings").update({ status: "on-break", started_at: startedAt }).eq("id", bookingId)
        .then(({ error }) => { if (error) console.error("startBreakSmart", error); });
      return { ok: true, extended: false, shortened: false };
    }

    const desiredEnd = originalEnd + delay;
    // Dry-run: hide this booking's OLD time, then check the ACTUAL delayed
    // window [now, desiredEnd) against every real rule in js/booking.js.
    const originalBookings = cache.bookings;
    cache.bookings = originalBookings.filter(b => b.id !== bookingId);
    const check = evaluateSlot(booking.employeeId, booking.day, now, desiredEnd);
    cache.bookings = originalBookings;

    let newEnd, newDuration, extended;
    if (check.status === "available") {
      newEnd = desiredEnd;
      newDuration = desiredEnd - now;
      extended = true;
    } else {
      newEnd = originalEnd;
      newDuration = Math.max(0, originalEnd - now);
      extended = false;
    }

    booking.start = now;
    booking.end = newEnd;
    booking.duration = newDuration;
    booking.status = "on-break";
    booking.startedAt = startedAt;

    client.from("bookings").update({
      start_min: now, end_min: newEnd, duration: newDuration, status: "on-break", started_at: startedAt
    }).eq("id", bookingId).then(({ error }) => { if (error) console.error("startBreakSmart", error); });

    return { ok: true, extended, shortened: !extended && newDuration < originalDuration, newEnd, newDuration, originalDuration };
  }

  /**
   * "I'm Back" — lets someone on break end it EARLY, voluntarily, before
   * the scheduled end time (mirror image of startBreakSmart's late-start
   * handling). The booking shrinks to the time actually used; the unused
   * remainder is automatically free again in their daily balance — no
   * separate tracking needed, since usedMinutes() just sums durations.
   */
  function endBreakEarly(bookingId) {
    const booking = cache.bookings.find(b => b.id === bookingId);
    if (!booking || booking.status !== "on-break") return null;

    const now = nowMinutes();
    const actualEnd = Math.min(now, booking.end); // never extends it — only ever shortens or leaves as-is
    const savedMinutes = Math.max(0, booking.end - actualEnd);
    const completedAt = new Date().toISOString();

    booking.end = actualEnd;
    booking.duration = Math.max(0, actualEnd - booking.start);
    booking.status = "completed";
    booking.completedAt = completedAt;

    client.from("bookings").update({
      end_min: actualEnd, duration: booking.duration, status: "completed", completed_at: completedAt
    }).eq("id", bookingId).then(({ error }) => { if (error) console.error("endBreakEarly", error); });

    return { ok: true, booking, savedMinutes };
  }

  /**
   * "استئذان من الدوام" — the employee excuses themselves from the rest
   * of today's shift, starting right now. Cancels every CONFIRMED (not
   * yet started) booking they have today — an in-progress or already
   * completed break is left alone, since that already happened. The
   * compensation owed is simply "how much of today's shift is left from
   * this moment to shiftEnd" — logged with a real calendar timestamp
   * (created_at), which is what makes correct monthly totals possible
   * without needing bookings themselves to carry a real date.
   *
   * KNOWN EDGE CASE: if a booking's own createBooking() write is still
   * in flight (hasn't hit the database yet) at the exact instant it gets
   * cancelled here, the cancel can land before the row exists and be
   * lost when the delayed insert finally arrives. In practice this needs
   * the two actions within the same fraction of a second and is very
   * unlikely — real bookings are almost always seconds-to-hours old by
   * the time someone requests leave — but it's a real gap, not a
   * theoretical one, and the same fix as create_booking_safe() (an
   * atomic server-side function) would close it properly if it ever
   * becomes a problem in practice.
   */
  function requestLeave({ employeeId, reason }) {
    const cfg = getConfig();
    const day = getTodayName();
    const now = nowMinutes();
    const shiftEndMin = timeToMinutes(cfg.shiftEnd);
    const compensationMinutes = Math.max(0, shiftEndMin - now);

    cache.bookings
      .filter(b => b.employeeId === employeeId && b.day === day && b.status === "confirmed")
      .forEach(b => cancelBooking(b.id));

    const id = newId();
    const leave = { id, employeeId, day, compensationMinutes, reason: reason || "", createdAt: new Date().toISOString() };
    cache.leaveRequests.unshift(leave);
    client.from("leave_requests").insert({
      id, employee_id: employeeId, day, compensation_minutes: compensationMinutes, reason: leave.reason, created_at: leave.createdAt
    }).then(({ error }) => { if (error) console.error("requestLeave", error); });

    logActivity(`${empName(employeeId)} requested leave for the rest of the day — ${compensationMinutes} min compensation owed`);
    return { ok: true, compensationMinutes };
  }

  function getLeaveRequests() { return cache.leaveRequests; }

  /** Total compensation minutes an employee owes within a given month (0-based JS month + year). */
  function getMonthlyCompensation(employeeId, month, year) {
    return cache.leaveRequests
      .filter(l => l.employeeId === employeeId)
      .filter(l => { const d = new Date(l.createdAt); return d.getMonth() === month && d.getFullYear() === year; })
      .reduce((sum, l) => sum + l.compensationMinutes, 0);
  }

  /**
   * Peak Time activation with an automatic fair queue. Anyone who already
   * had a confirmed (not-yet-started) break overlapping the chosen window
   * gets that booking cancelled and replaced with a strict one-at-a-time
   * turn: 15 minutes each, a 2-minute gap between turns, in a RANDOM
   * order (so no one is systematically first or last every time). This
   * deliberately bypasses the normal 5-minute minGap rule and the usual
   * concurrency check — Amal is explicitly orchestrating this queue by
   * hand, and the queue is self-consistent (never more than one person
   * at a time) by construction, so those two rules don't apply here.
   * Everything else (daily cap, continuous-break limit, shift-end buffer)
   * is NOT re-validated for simplicity — this is an occasional manual
   * admin action for a small handful of people, not everyday booking.
   */
  function activatePeakTimeQueue(peakStartStr, peakEndStr) {
    const day = getTodayName();
    const peakStart = timeToMinutes(peakStartStr), peakEnd = timeToMinutes(peakEndStr);
    const QUEUE_DURATION = 15, QUEUE_GAP = 2;

    const overlapping = cache.bookings.filter(b =>
      b.day === day && b.status === "confirmed" && b.start < peakEnd && b.end > peakStart
    );
    // Remember each affected employee's ORIGINAL time before we touch anything,
    // so the new booking can carry "what it used to be" for the employee's page.
    const originalByEmployee = {};
    overlapping.forEach(b => { if (!originalByEmployee[b.employeeId]) originalByEmployee[b.employeeId] = b; });

    const employeeIds = [...new Set(overlapping.map(b => b.employeeId))];
    for (let i = employeeIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [employeeIds[i], employeeIds[j]] = [employeeIds[j], employeeIds[i]];
    }

    overlapping.forEach(b => cancelBooking(b.id));

    let cursor = peakStart;
    const queue = [];
    employeeIds.forEach(employeeId => {
      const start = cursor, end = cursor + QUEUE_DURATION;
      const id = newId();
      const nowIso = new Date().toISOString();
      const original = originalByEmployee[employeeId];
      const booking = {
        id, day, employeeId, start, end, duration: QUEUE_DURATION, reason: "Peak Time queue",
        status: "confirmed", isEmergency: false, exceededCapacity: false,
        rescheduledFromStart: original.start, rescheduledFromEnd: original.end,
        bookedAt: nowIso, startedAt: null, completedAt: null, cancelledAt: null
      };
      cache.bookings.push(booking);
      client.from("bookings").insert({
        id, day, employee_id: employeeId, start_min: start, end_min: end, duration: QUEUE_DURATION,
        reason: booking.reason, status: "confirmed", booked_at: nowIso,
        rescheduled_from_start: original.start, rescheduled_from_end: original.end
      }).then(({ error }) => { if (error) console.error("activatePeakTimeQueue", error); });
      queue.push({ employeeId, start, end, previousStart: original.start, previousEnd: original.end });
      cursor = end + QUEUE_GAP;
    });

    updateConfig({ peakTimeActive: true, peakTimeStart: peakStartStr, peakTimeEnd: peakEndStr });
    logActivity(`Peak Time activated (${peakStartStr}–${peakEndStr}) — ${queue.length} people queued, 15 min each, 2 min gaps`);
    notifyChange();

    return { ok: true, queue };
  }

  /**
   * "اختاري المداومين" mode — Amal explicitly picks which employees to
   * queue (rather than the system auto-detecting who already had a
   * booking). Each selected employee's ENTIRE remaining daily balance
   * becomes their turn length (not a fixed 15 min), scheduled back to
   * back with a 2-minute gap, starting from the chosen time and
   * continuing until the break window's own end (cfg.breakWindowEnd —
   * "4:30" by default, but always follows whatever Admin has set).
   * Anyone already booked today gets that booking cancelled first, so
   * their "remaining balance" is computed cleanly with no double count.
   * Employees who have zero balance left, or for whom no time remains
   * before the cutoff, are skipped and reported back — not silently
   * dropped — so Amal can see exactly who didn't get queued and why.
   */
  /**
   * "اختاري المداومين" mode, ROUND-ROBIN — Amal explicitly picks which
   * employees to queue. Instead of giving someone their entire remaining
   * balance in one long turn, everyone gets a MAX 15-minute turn per
   * round, in the same order, cycling back around for a second (third,
   * etc.) 15-minute turn if they still have balance left — so with a
   * mixed group, no one is stuck waiting through someone else's full
   * hour before getting their first break. The last turn for anyone may
   * be shorter than 15 min if that's all the balance (or window room)
   * they have left. Continues until every selected employee's balance
   * is exhausted or the break window's own end is reached.
   */
  function activatePeakTimeQueueForSelected(employeeIds, peakStartStr) {
    const cfg = getConfig();
    const day = getTodayName();
    const cutoffMin = timeToMinutes(cfg.breakWindowEnd);
    const QUEUE_GAP = 2;
    const ROUND_CHUNK = 15;

    // Balances are snapshotted ONCE, against the CURRENT (untouched) state,
    // before anything is cancelled — so someone who genuinely has zero
    // balance left is skipped without their real booking ever being touched.
    const remainingByEmployee = {};
    employeeIds.forEach(id => { remainingByEmployee[id] = remainingMinutes(id, day); });

    const originalByEmployee = {};
    const skipped = [];
    const activeIds = [];
    employeeIds.forEach(id => {
      if (remainingByEmployee[id] <= 0) { skipped.push({ employeeId: id, reasonKey: "noBalance" }); return; }
      const existing = cache.bookings.filter(b => b.employeeId === id && b.day === day && b.status === "confirmed");
      if (existing.length) originalByEmployee[id] = existing[0];
      existing.forEach(b => cancelBooking(b.id));
      activeIds.push(id);
    });

    let cursor = timeToMinutes(peakStartStr);
    const queue = [];
    const noRoom = new Set();
    const hadFirstTurn = new Set();

    while (activeIds.some(id => remainingByEmployee[id] > 0 && !noRoom.has(id))) {
      for (const employeeId of activeIds) {
        if (remainingByEmployee[employeeId] <= 0 || noRoom.has(employeeId)) continue;
        const roomLeft = cutoffMin - cursor;
        if (roomLeft <= 0) { noRoom.add(employeeId); continue; }

        const turn = Math.min(ROUND_CHUNK, remainingByEmployee[employeeId], roomLeft);
        const start = cursor, end = cursor + turn;
        const id = newId();
        const nowIso = new Date().toISOString();
        const isFirstTurn = !hadFirstTurn.has(employeeId);
        const original = isFirstTurn ? originalByEmployee[employeeId] : null;
        hadFirstTurn.add(employeeId);

        const booking = {
          id, day, employeeId, start, end, duration: turn, reason: "Peak Time queue",
          status: "confirmed", isEmergency: false, exceededCapacity: false,
          rescheduledFromStart: original ? original.start : null, rescheduledFromEnd: original ? original.end : null,
          bookedAt: nowIso, startedAt: null, completedAt: null, cancelledAt: null
        };
        cache.bookings.push(booking);
        client.from("bookings").insert({
          id, day, employee_id: employeeId, start_min: start, end_min: end, duration: turn,
          reason: booking.reason, status: "confirmed", booked_at: nowIso,
          rescheduled_from_start: original ? original.start : null, rescheduled_from_end: original ? original.end : null
        }).then(({ error }) => { if (error) console.error("activatePeakTimeQueueForSelected", error); });

        queue.push({ employeeId, start, end, duration: turn, previousStart: original ? original.start : null, previousEnd: original ? original.end : null });
        remainingByEmployee[employeeId] -= turn;
        cursor = end + QUEUE_GAP;
      }
    }

    // Anyone who never got even a first turn because the window was already
    // full before their turn came up is reported as skipped, not silently dropped.
    activeIds.forEach(id => {
      if (!hadFirstTurn.has(id)) skipped.push({ employeeId: id, reasonKey: "noRoomLeft" });
    });

    updateConfig({ peakTimeActive: true, peakTimeStart: peakStartStr, peakTimeEnd: cfg.breakWindowEnd });
    logActivity(`Peak Time round-robin activated from ${peakStartStr} — ${queue.length} turns across ${hadFirstTurn.size} people, ${skipped.length} skipped`);
    notifyChange();

    return { ok: true, queue, skipped };
  }

  /**
   * Emergency break — starts immediately, deliberately SKIPS the
   * max-concurrent-breaks check (that's the entire point: a genuine
   * emergency shouldn't wait for a free slot), but still counts fully
   * against the employee's daily balance and still respects the daily
   * cap, the continuous-break limit, and the shift-end buffer, so it
   * can't be used to bypass those. Tagged `isEmergency` for Amal's
   * reporting (a fuller monthly emergency-break report is a later phase).
   */
  function createEmergencyBreak({ employeeId, duration, reason }) {
    const cfg = getConfig();
    const day = getTodayName();
    const start = nowMinutes();
    const end = start + duration;

    if (isEmployeeAlreadyBookedAt(employeeId, day, start, end)) {
      return { ok: false, reasonKey: "alreadyBooked" };
    }
    if (duration > remainingMinutes(employeeId, day)) {
      return { ok: false, reasonKey: "errorInsufficientBalance" };
    }
    if (continuousLengthIfAdded(employeeId, day, start, end) > cfg.maxContinuousBreakMinutes) {
      return { ok: false, reasonKey: "continuousExceeded" };
    }
    if (timeToMinutes(cfg.shiftEnd) - end < 15) {
      return { ok: false, reasonKey: "tooCloseToShiftEnd" };
    }

    // Record whether this genuinely exceeded capacity (i.e. whether a
    // NORMAL booking would have been blocked here) — this is what lets
    // Amal's monthly report answer "did this actually affect anyone else?"
    const exceededCapacity = (overlappingCount(day, start, end, employeeId) + 1) > cfg.maxConcurrentBreaks;

    const id = newId();
    const nowIso = new Date().toISOString();
    const booking = {
      id, day, employeeId, start, end, duration, reason: reason || "",
      status: "on-break", isEmergency: true, exceededCapacity,
      bookedAt: nowIso, startedAt: nowIso, completedAt: null, cancelledAt: null
    };
    cache.bookings.push(booking);
    client.from("bookings").insert({
      id, day, employee_id: employeeId, start_min: start, end_min: end, duration,
      reason: booking.reason, status: "on-break", is_emergency: true, exceeded_capacity: exceededCapacity,
      booked_at: nowIso, started_at: nowIso
    }).then(({ error }) => { if (error) console.error("createEmergencyBreak", error); });

    logActivity(`🚨 ${empName(employeeId)} took an EMERGENCY break ${minutesToLabel(start)}–${minutesToLabel(end)}`);
    return { ok: true, booking };
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
    const rows = list.map(e => ({ id: e.id, name: e.name, name_en: e.nameEn, gender: e.gender, photo_url: e.photoUrl || null, pin: e.pin || null }));
    client.from("employees").upsert(rows).then(({ error }) => { if (error) console.error("updateEmployees", error); });
    logActivity("Admin updated the employee roster");
    return list;
  }

  // ---------------------------------------------------------------
  // AVATARS — direct browser → Supabase Storage upload (bucket "avatars",
  // created by supabase-setup.sql). No server code involved; the anon
  // key is allowed to insert/read on that bucket only, per its policies.
  // ---------------------------------------------------------------
  function uploadAvatar(path, file) {
    return client.storage.from("avatars").upload(path, file, { upsert: true });
  }
  function getAvatarPublicUrl(path) {
    return client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
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
    getBookings, createBooking, cancelBooking, updateBookingStatus, startBreakSmart, endBreakEarly, createEmergencyBreak,
    requestLeave, getLeaveRequests, getMonthlyCompensation, activatePeakTimeQueue, activatePeakTimeQueueForSelected,
    getConfig, updateConfig,
    getEmployees, updateEmployees, uploadAvatar, getAvatarPublicUrl,
    getAttendance, updateAttendance,
    getNotifications, addNotification, markNotificationRead, markAllNotificationsRead,
    getActivityLog, logActivity,
    getSwapRequests, createSwapRequest, respondToSwap,
    resetAllDemoData
  };
})();
