/**
 * js/booking.js
 * ---------------------------------------------------------------------
 * Time helpers + the booking validation engine. Every rule from
 * requirement #59 funnels through evaluateSlot(). Nothing else in the
 * app re-implements a rule — app.js, admin.js and amal.js all call
 * into these functions.
 * ---------------------------------------------------------------------
 */

// ---- Time helpers ----
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToLabel(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function rangeLabel(start, end) {
  return `${minutesToLabel(start)} — ${minutesToLabel(end)}`;
}
/**
 * Always resolves "now" against Asia/Riyadh (Mecca time), regardless of
 * what timezone the device itself is set to — a phone with a wrong or
 * unusual timezone setting still gets correct booking-window behavior.
 * Also returns today's REAL calendar date (YYYY-MM-DD) — this is what
 * every booking is now actually tied to, instead of just a weekday name
 * that would otherwise recur forever every week.
 */
function nowInMecca() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hour12: false
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  const weekdayShort = get("weekday"); // "Sun".."Sat"
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const WEEKDAY_MAP = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
  return { day: WEEKDAY_MAP[weekdayShort], minutes: hour * 60 + minute, date: `${get("year")}-${get("month")}-${get("day")}` };
}
function getTodayName() {
  return nowInMecca().day;
}
function nowMinutes() {
  return nowInMecca().minutes;
}
/** Today's real calendar date in Mecca time, as "YYYY-MM-DD". This is
 * what bookings are actually keyed by now — see the file-level note above. */
function getTodayDate() {
  return nowInMecca().date;
}
/** Converts a "YYYY-MM-DD" date string to its weekday name — used only
 * for attendance lookups (which are genuinely weekly-recurring by design)
 * and for display labels, never for matching bookings against each other. */
function dateToDayName(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z"); // noon UTC avoids any date-shift from local TZ parsing
  return DAY_ORDER[d.getUTCDay()];
}
/** Adds N days to a "YYYY-MM-DD" date string, returning a new "YYYY-MM-DD". */
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The 7 real calendar dates (Sunday→Saturday) of the CURRENT week, aligned
 * with DAY_ORDER's indices — used for weekly views that need actual dates
 * instead of a perpetual weekday-name aggregate. */
function getCurrentWeekDates() {
  const today = getTodayDate();
  const todayDow = new Date(today + "T12:00:00Z").getUTCDay();
  const sunday = addDays(today, -todayDow);
  return DAY_ORDER.map((_, i) => addDays(sunday, i));
}

// ---- Data queries (read-only helpers built on top of dataService) ----
// NOTE: employeesForDay/isEmployeeWorking take a WEEKDAY NAME (attendance
// is intentionally a recurring weekly schedule). Every other function
// below takes a REAL CALENDAR DATE ("YYYY-MM-DD") — this is the actual
// fix for bookings no longer silently recurring every week.
function employeesForDay(day) {
  const attendance = dataService.getAttendance();
  const employees = dataService.getEmployees();
  const ids = attendance[day] || [];
  return employees.filter(e => ids.includes(e.id));
}
function bookingsForDay(date) {
  return dataService.getBookings().filter(b => b.date === date && b.status !== "cancelled");
}
function bookingsForEmployeeDay(employeeId, date) {
  return bookingsForDay(date).filter(b => b.employeeId === employeeId);
}
function usedMinutes(employeeId, date) {
  return bookingsForEmployeeDay(employeeId, date).reduce((sum, b) => sum + b.duration, 0);
}
function remainingMinutes(employeeId, date) {
  const cfg = dataService.getConfig();
  return cfg.dailyBreakMinutes - usedMinutes(employeeId, date);
}
function isEmployeeWorking(employeeId, day) {
  const attendance = dataService.getAttendance();
  return (attendance[day] || []).includes(employeeId);
}

// The longest continuous block this employee would have if [start,end) were added.
// This is what blocks the "adjacent bookings" exploit (requirement #5).
function continuousLengthIfAdded(employeeId, day, start, end) {
  const existing = bookingsForEmployeeDay(employeeId, day).map(b => ({ start: b.start, end: b.end }));
  const all = [...existing, { start, end }].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of all) {
    if (merged.length && iv.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  const block = merged.find(m => start >= m.start && end <= m.end);
  return block ? block.end - block.start : end - start;
}

function overlappingCount(day, start, end, excludeEmployeeId) {
  return bookingsForDay(day).filter(b => {
    if (excludeEmployeeId && b.employeeId === excludeEmployeeId) return false;
    return start < b.end && end > b.start;
  }).length;
}
function isEmployeeAlreadyBookedAt(employeeId, day, start, end) {
  return bookingsForEmployeeDay(employeeId, day).some(b => start < b.end && end > b.start);
}

function generateSlots(duration) {
  const cfg = dataService.getConfig();
  const winStart = timeToMinutes(cfg.breakWindowStart);
  const winEnd = timeToMinutes(cfg.breakWindowEnd);
  const slots = [];
  for (let s = winStart; s + duration <= winEnd; s += cfg.slotInterval) {
    slots.push({ start: s, end: s + duration });
  }
  return slots;
}

/**
 * The single source of truth for "can this booking happen." Returns
 * { status: "available"|"unavailable"|"booked", reasonKey, reasonArgs }
 * reasonKey maps to a message-service pool for user-facing text.
 */
// Minimum breathing room between two DIFFERENT, non-overlapping bookings
// (any employees) — overlapping bookings are governed by the concurrency
// rule instead, not this one.
function hasInsufficientGap(day, start, end, gapMinutes) {
  return bookingsForDay(day).some(b => {
    const overlaps = start < b.end && end > b.start;
    if (overlaps) return false; // handled by the concurrency rule, not the gap rule
    const gap = start >= b.end ? (start - b.end) : (b.start - end);
    return gap >= 0 && gap < gapMinutes;
  });
}

function evaluateSlot(employeeId, day, start, end) {
  const cfg = dataService.getConfig();
  const today = getTodayDate();

  // NOTE: attendance is no longer a hard block here. Someone can come in
  // for support/overtime on a day they're not normally scheduled, and
  // still needs to be able to book a break. Attendance (isEmployeeWorking)
  // is still used for reporting/stats (Amal's Space, dashboard counts) —
  // it's just not a gate on booking anymore.
  if (day === today && start < nowMinutes()) {
    return { status: "unavailable", reasonKey: "timePassed" };
  }
  // No booking action at all before this real clock time (today only) —
  // stops people booking hours before their shift even starts.
  if (day === today && nowMinutes() < timeToMinutes(cfg.bookingOpensAt)) {
    return { status: "unavailable", reasonKey: "tooEarlyToBook", reasonArgs: [cfg.bookingOpensAt] };
  }
  if (isEmployeeAlreadyBookedAt(employeeId, day, start, end)) {
    return { status: "booked", reasonKey: "alreadyBooked" };
  }

  const remaining = remainingMinutes(employeeId, day);
  const duration = end - start;
  if (duration > remaining) {
    return { status: "unavailable", reasonKey: "errorInsufficientBalance", reasonArgs: [remaining] };
  }
  if (continuousLengthIfAdded(employeeId, day, start, end) > cfg.maxContinuousBreakMinutes) {
    return { status: "unavailable", reasonKey: "continuousExceeded", reasonArgs: [cfg.maxContinuousBreakMinutes] };
  }
  if (timeToMinutes(cfg.shiftEnd) - end < 15) {
    return { status: "unavailable", reasonKey: "tooCloseToShiftEnd" };
  }

  // Peak Time: Amal can temporarily force capacity down to 1 for a chosen
  // window. Only applies to slots that actually overlap that window.
  let capacity = cfg.maxConcurrentBreaks;
  if (cfg.peakTimeActive) {
    const peakStart = timeToMinutes(cfg.peakTimeStart), peakEnd = timeToMinutes(cfg.peakTimeEnd);
    if (start < peakEnd && end > peakStart) capacity = 1;
  }
  if (overlappingCount(day, start, end, employeeId) + 1 > capacity) {
    return { status: "unavailable", reasonKey: capacity === 1 ? "peakTimeFull" : "errorSlotTaken" };
  }

  if (hasInsufficientGap(day, start, end, cfg.minGapMinutes)) {
    return { status: "unavailable", reasonKey: "tooCloseToOtherBreak", reasonArgs: [cfg.minGapMinutes] };
  }

  return { status: "available" };
}

function findNextAvailableSlot(employeeId, day, duration) {
  return generateSlots(duration).find(s => evaluateSlot(employeeId, day, s.start, s.end).status === "available") || null;
}

/** "Best Time" — the slot with the fewest concurrent bookings across the whole team right now. */
function findBestTime(employeeId, day, duration) {
  const candidates = generateSlots(duration).filter(s => evaluateSlot(employeeId, day, s.start, s.end).status === "available");
  if (candidates.length === 0) return null;
  return candidates.reduce((best, slot) => {
    const load = overlappingCount(day, slot.start, slot.end, null);
    const bestLoad = overlappingCount(day, best.start, best.end, null);
    return load < bestLoad ? slot : best;
  }, candidates[0]);
}
