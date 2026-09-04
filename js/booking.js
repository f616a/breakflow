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
function getTodayName() {
  return DAY_ORDER[new Date().getDay()];
}
function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ---- Data queries (read-only helpers built on top of dataService) ----
function employeesForDay(day) {
  const attendance = dataService.getAttendance();
  const employees = dataService.getEmployees();
  const ids = attendance[day] || [];
  return employees.filter(e => ids.includes(e.id));
}
function bookingsForDay(day) {
  return dataService.getBookings().filter(b => b.day === day && b.status !== "cancelled");
}
function bookingsForEmployeeDay(employeeId, day) {
  return bookingsForDay(day).filter(b => b.employeeId === employeeId);
}
function usedMinutes(employeeId, day) {
  return bookingsForEmployeeDay(employeeId, day).reduce((sum, b) => sum + b.duration, 0);
}
function remainingMinutes(employeeId, day) {
  const cfg = dataService.getConfig();
  return cfg.dailyBreakMinutes - usedMinutes(employeeId, day);
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
function evaluateSlot(employeeId, day, start, end) {
  const cfg = dataService.getConfig();

  // NOTE: attendance is no longer a hard block here. Someone can come in
  // for support/overtime on a day they're not normally scheduled, and
  // still needs to be able to book a break. Attendance (isEmployeeWorking)
  // is still used for reporting/stats (Amal's Space, dashboard counts) —
  // it's just not a gate on booking anymore.
  if (day === getTodayName() && start < nowMinutes()) {
    return { status: "unavailable", reasonKey: "timePassed" };
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
  if (overlappingCount(day, start, end, employeeId) + 1 > cfg.maxConcurrentBreaks) {
    return { status: "unavailable", reasonKey: "errorSlotTaken" };
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
