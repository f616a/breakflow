/**
 * js/schedule.js
 * ---------------------------------------------------------------------
 * Builds "Today's Break Schedule" and per-employee live status. Shared
 * between index.html (employee view) and amal.html (manager view) so
 * the two never drift out of sync.
 * ---------------------------------------------------------------------
 */

/** Full, sorted list of today's bookings — every booking shown, overlaps included (requirement #15/#92). */
function getTodaysSchedule(day) {
  return bookingsForDay(day).slice().sort((a, b) => a.start - b.start);
}

/**
 * Per-employee status right now, for a given day:
 * "off" | "working" | "scheduled" | "on-break" | "returning-soon" | "completed"
 */
function getEmployeeStatus(employeeId, day) {
  const mine = bookingsForEmployeeDay(employeeId, day);
  // Attendance ("off today") is still a real signal for reporting, but if
  // someone actually has a booking that day (e.g. came in for overtime or
  // support), their real activity wins over the schedule label.
  if (mine.length === 0 && !isEmployeeWorking(employeeId, day)) return "off";

  const now = day === getTodayName() ? nowMinutes() : -1;

  const active = mine.find(b => now >= b.start && now < b.end);
  if (active) {
    return (active.end - now) <= 5 ? "returning-soon" : "on-break";
  }
  const upcoming = mine.find(b => b.start > now);
  if (upcoming) return "scheduled";

  const remaining = remainingMinutes(employeeId, day);
  const cfg = dataService.getConfig();
  if (remaining <= 0 && mine.length > 0) return "completed";
  return "working";
}

/** Everyone currently on break, with countdown info — for "Who's On Break Now". */
function getWhosOnBreakNow(day) {
  const now = nowMinutes();
  return bookingsForDay(day)
    .filter(b => now >= b.start && now < b.end)
    .map(b => ({
      booking: b,
      employee: getEmployeeById(b.employeeId),
      minutesRemaining: b.end - now
    }))
    .sort((a, b) => a.minutesRemaining - b.minutesRemaining);
}

/** The next N bookings that haven't started yet — for "Next Up". */
function getNextUp(day, limit) {
  const now = day === getTodayName() ? nowMinutes() : -1;
  return bookingsForDay(day)
    .filter(b => b.start > now)
    .sort((a, b) => a.start - b.start)
    .slice(0, limit || 3)
    .map(b => ({ booking: b, employee: getEmployeeById(b.employeeId) }));
}
