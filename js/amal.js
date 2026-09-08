/**
 * js/amal.js
 * ---------------------------------------------------------------------
 * "مساحة أمل" — password-gated manager space. See js/auth.js for how
 * the password check itself is abstracted for a future real backend.
 *
 * SCOPE NOTE: requirement #34/#35/#48/#104 describe full weekly
 * archiving with a Week ID like "2026-W36" and browsable previous
 * weeks. That needs bookings to be stamped with a real calendar date,
 * not just a weekday name — a deliberate simplification made across
 * this whole project (see README "Known limitations"). What's shipped
 * here is a real, working "This Week" view (computed live from current
 * data) and the architecture note for where date-stamping would plug
 * in; it does not fabricate a previous-weeks archive that doesn't exist.
 * Likewise: Swap Center and Waitlist tabs show an honest "not enabled
 * yet" empty state rather than a fake list.
 * ---------------------------------------------------------------------
 */

let amalUnlocked = false;

function el(id) { return document.getElementById(id); }

// Shared fallback avatar (initial letter on a color circle) — used
// anywhere an employee hasn't had a real photo uploaded yet.
function avatarPlaceholderUrl(emp) {
  const letter = encodeURIComponent((emp.name || "?").trim()[0] || "?");
  const bg = emp.gender === "female" ? "F0748A" : "5FA3E0";
  return `https://ui-avatars.com/api/?name=${letter}&background=${bg}&color=fff&size=64&bold=true`;
}

async function tryUnlock() {
  const input = el("amalPasswordInput");
  const btn = el("amalUnlockBtn");
  const msg = el("amalLockMsg");
  btn.disabled = true;
  const ok = await AuthAdapter.verify("amal", input.value);
  btn.disabled = false;
  input.value = "";

  if (ok) {
    amalUnlocked = true;
    el("amalLockScreen").classList.add("hidden");
    el("amalDashboard").classList.remove("hidden");
    el("amalWelcomeBanner").textContent = MessageService.getMessage({
      event: "amalWelcome", locale: i18n.current, gender: "neutral", employeeId: "amal"
    });
    renderAmalDashboard();
  } else {
    msg.textContent = MessageService.getMessage({
      event: "amalWrongPassword", locale: i18n.current, gender: "neutral", employeeId: "amal-wrong"
    });
  }
}

// -----------------------------------------------------------------
// OVERVIEW CARDS (computed live from current data — see scope note)
// -----------------------------------------------------------------
function renderOverviewCards() {
  const allBookings = dataService.getBookings(); // includes cancelled, for accurate counts
  const activeThisWeek = allBookings.filter(b => b.status !== "cancelled");
  const totalMinutes = activeThisWeek.reduce((s, b) => s + b.duration, 0);
  const today = getTodayName();
  const todays = bookingsForDay(today);
  const onBreakNow = getWhosOnBreakNow(today).length;
  const upcoming = getNextUp(today, 999).length;
  const cancelled = allBookings.filter(b => b.status === "cancelled").length;
  const pendingSwaps = dataService.getSwapRequests().filter(s => s.status === "pending").length;

  const cards = [
    [activeThisWeek.length, "Total Breaks", "إجمالي البريكات"],
    [totalMinutes, "Total Break Minutes", "إجمالي دقائق البريك"],
    [todays.length, "Today's Breaks", "بريكات اليوم"],
    [employeesForDay(today).length, "Working Today", "الحاضرين اليوم"],
    [onBreakNow, "On Break Now", "على بريك الآن"],
    [upcoming, "Upcoming Breaks", "بريكات قادمة"],
    [pendingSwaps, "Pending Swaps", "طلبات تبديل"],
    [cancelled, "Cancelled Breaks", "بريكات ملغاة"]
  ];

  el("overviewGrid").innerHTML = cards.map(([num, en, ar]) => `
    <div class="stat-card">
      <div class="num">${num}</div>
      <div class="label">${i18n.current === "ar" ? ar : en}</div>
    </div>
  `).join("");
}

// -----------------------------------------------------------------
// WEEKLY CARD GRID (Sunday → Saturday, live counts per weekday)
// -----------------------------------------------------------------
function renderWeekGrid() {
  el("weekGrid").innerHTML = DAY_ORDER.map(day => {
    const bookings = bookingsForDay(day);
    const minutes = bookings.reduce((s, b) => s + b.duration, 0);
    const working = employeesForDay(day).length;
    return `
      <div class="week-day-card" data-day="${day}">
        <div class="day-name">${day}</div>
        <div class="day-meta">${bookings.length} bookings</div>
        <div class="day-meta">${minutes} min</div>
        <div class="day-meta">${working} working</div>
      </div>`;
  }).join("");

  el("weekGrid").querySelectorAll(".week-day-card").forEach(card => {
    card.addEventListener("click", () => renderDayDetail(card.dataset.day));
  });
}

function renderDayDetail(day) {
  const rows = getTodaysSchedule(day);
  const panel = el("dayDetailPanel");
  panel.classList.remove("hidden");
  el("dayDetailTitle").textContent = day;
  el("dayDetailList").innerHTML = rows.length === 0
    ? `<div class="empty-state small">${i18n.t("noBreaksTitle")}</div>`
    : rows.map(b => {
        const emp = getEmployeeById(b.employeeId);
        const name = emp ? (i18n.current === "ar" ? emp.name : emp.nameEn) : "—";
        const gClass = emp ? `gender-${emp.gender}` : "";
        return `<div class="schedule-item ${gClass}">
          <div class="schedule-time">${rangeLabel(b.start, b.end)}</div>
          <div class="schedule-name"><span class="gender-dot ${gClass}"></span>${name}</div>
          <div class="schedule-badges">
            <span class="badge-dur">${b.duration} MIN</span>
            <span class="badge-status">${b.status}</span>
          </div>
        </div>`;
      }).join("");
}

// -----------------------------------------------------------------
// TODAY COMMAND CENTER + BALANCE TABLE
// -----------------------------------------------------------------
function renderBalanceTable() {
  const today = getTodayName();
  const cfg = dataService.getConfig();
  const rows = dataService.getEmployees().map(emp => {
    const working = isEmployeeWorking(emp.id, today); // attendance flag — for the "Working" column only
    const used = usedMinutes(emp.id, today); // real usage counts regardless of attendance (overtime/support bookings)
    const remaining = Math.max(0, cfg.dailyBreakMinutes - used);
    const status = getEmployeeStatus(emp.id, today);
    const next = getNextUp(today, 999).find(n => n.employee && n.employee.id === emp.id);
    return { emp, working, used, remaining, status, next };
  });

  el("balanceTableBody").innerHTML = rows.map(r => `
    <tr>
      <td style="display:flex;align-items:center;gap:8px;">
        <img class="avatar-thumb" src="${r.emp.photoUrl || avatarPlaceholderUrl(r.emp)}" alt="">
        <span class="gender-dot gender-${r.emp.gender}"></span>${i18n.current === "ar" ? r.emp.name : r.emp.nameEn}
      </td>
      <td>${r.working ? "✓" : "—"}</td>
      <td>${r.used}</td>
      <td>${r.remaining}</td>
      <td>${r.next ? minutesToLabel(r.next.booking.start) : "—"}</td>
      <td>${r.status}</td>
    </tr>`).join("");
}

// -----------------------------------------------------------------
// PIN MANAGER — Amal can view and set each employee's personal-page PIN.
// See the app-wide disclosure: this deters casual misuse, it is not
// real server-side security given the public anon key architecture.
// -----------------------------------------------------------------
function renderPinManager() {
  const list = el("pinManagerList");
  if (!list) return;
  const employees = dataService.getEmployees();
  list.innerHTML = employees.map((e, i) => `
    <div class="field" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
      <img class="avatar-thumb" src="${e.photoUrl || avatarPlaceholderUrl(e)}" alt="">
      <span style="flex:1;font-size:13px;font-weight:600;">${i18n.current === "ar" ? e.name : e.nameEn}</span>
      <input type="text" inputmode="numeric" data-pin-idx="${i}" value="${e.pin || ""}" placeholder="No PIN" style="width:120px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);text-align:center;letter-spacing:2px;">
    </div>`).join("");
}

function savePins() {
  const list = dataService.getEmployees().map(e => Object.assign({}, e));
  el("pinManagerList").querySelectorAll("[data-pin-idx]").forEach(input => {
    list[Number(input.dataset.pinIdx)].pin = input.value.trim();
  });
  dataService.updateEmployees(list);
  NotificationCenter.showToast("PINs saved.");
  renderPinManager();
}

// -----------------------------------------------------------------
// PEAK TIME — temporarily force capacity to 1 for a chosen window.
// -----------------------------------------------------------------
function renderPeakTimeControl() {
  const cfg = dataService.getConfig();
  const startInput = el("peakStartInput"), endInput = el("peakEndInput"), btn = el("togglePeakTimeBtn");
  if (!startInput || !btn) return;
  if (!startInput.dataset.userEdited) startInput.value = cfg.peakTimeStart || "12:00";
  if (!endInput.dataset.userEdited) endInput.value = cfg.peakTimeEnd || "13:00";
  if (cfg.peakTimeActive) {
    btn.textContent = `Deactivate Peak Time (${cfg.peakTimeStart}–${cfg.peakTimeEnd}, capacity 1)`;
    btn.classList.add("active-peak");
  } else {
    btn.textContent = "Activate Peak Time";
    btn.classList.remove("active-peak");
  }
}

function togglePeakTime() {
  const cfg = dataService.getConfig();
  if (cfg.peakTimeActive) {
    dataService.updateConfig({ peakTimeActive: false });
    NotificationCenter.showToast("Peak Time deactivated — normal capacity restored.");
  } else {
    const start = el("peakStartInput").value, end = el("peakEndInput").value;
    if (!start || !end) { NotificationCenter.showToast("Pick a start and end time first.", "danger"); return; }
    if (!confirm(`Activating Peak Time will cancel any existing overlapping breaks and re-queue those people one at a time (15 min each, 2 min gaps), in random order. Continue?`)) return;
    const result = dataService.activatePeakTimeQueue(start, end);
    if (result.queue.length === 0) {
      NotificationCenter.showToast("Peak Time activated — no one had an overlapping break to requeue.");
    } else {
      const names = result.queue.map(q => {
        const emp = getEmployeeById(q.employeeId);
        return `${emp ? emp.name : "?"} (${minutesToLabel(q.start)}–${minutesToLabel(q.end)})`;
      }).join(", ");
      NotificationCenter.showToast(`Peak Time activated — queued: ${names}`);
    }
  }
  renderPeakTimeControl();
}

function renderFullBreakList() {
  const filterEmp = el("filterEmployee").value;
  const filterStatus = el("filterStatus").value;
  const search = el("searchEmployee").value.trim().toLowerCase();

  let rows = dataService.getBookings().slice();
  if (filterEmp) rows = rows.filter(b => String(b.employeeId) === filterEmp);
  if (filterStatus) rows = rows.filter(b => b.status === filterStatus);
  if (search) {
    rows = rows.filter(b => {
      const emp = getEmployeeById(b.employeeId);
      if (!emp) return false;
      return emp.name.toLowerCase().includes(search) || emp.nameEn.toLowerCase().includes(search);
    });
  }
  rows.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start);
  lastFilteredBreakRows = rows;

  el("fullListBody").innerHTML = rows.map(b => {
    const emp = getEmployeeById(b.employeeId);
    return `<tr>
      <td>${b.day}</td>
      <td>${emp ? (i18n.current === "ar" ? emp.name : emp.nameEn) : "—"}</td>
      <td>${emp ? emp.gender : "—"}</td>
      <td>${minutesToLabel(b.start)}</td>
      <td>${minutesToLabel(b.end)}</td>
      <td>${b.duration}</td>
      <td>${b.status}</td>
    </tr>`;
  }).join("");
}

// Exports exactly what's currently shown (respects the active filters/search).
function exportBreaksCsv() {
  const header = ["Day", "Employee (AR)", "Employee (EN)", "Gender", "Start", "End", "Duration (min)", "Status", "Reason", "Booked At"];
  const dataRows = lastFilteredBreakRows.map(b => {
    const emp = getEmployeeById(b.employeeId);
    return [
      b.day, emp ? emp.name : "", emp ? emp.nameEn : "", emp ? emp.gender : "",
      minutesToLabel(b.start), minutesToLabel(b.end), b.duration, b.status, b.reason || "", b.bookedAt || ""
    ];
  });
  const csv = [header, ...dataRows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM so Excel shows Arabic correctly
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `breakflow-breaks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function populateFilters() {
  const empSelect = el("filterEmployee");
  empSelect.innerHTML = `<option value="">All</option>` +
    dataService.getEmployees().map(e => `<option value="${e.id}">${i18n.current === "ar" ? e.name : e.nameEn}</option>`).join("");
}

// -----------------------------------------------------------------
// ACTIVITY LOG
// -----------------------------------------------------------------
function renderActivityLog() {
  const log = dataService.getActivityLog();
  el("activityLogList").innerHTML = log.length === 0
    ? `<div class="empty-state small">No activity yet.</div>`
    : log.map(entry => `<div class="notif-item"><div class="notif-body">${new Date(entry.ts).toLocaleTimeString()} — ${entry.action}</div></div>`).join("");
}

// -----------------------------------------------------------------
// FUN INSIGHT (real data only, per requirement #47)
// -----------------------------------------------------------------
function renderFunFact() {
  const today = getTodayName();
  const bookings = bookingsForDay(today);
  const box = el("funFactCard");
  if (bookings.length === 0) {
    box.textContent = i18n.current === "ar" ? "ما فيه بريكات اليوم بعد ✨" : "No breaks booked yet today ✨";
    return;
  }
  const counts = {};
  bookings.forEach(b => { counts[b.start] = (counts[b.start] || 0) + 1; });
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const label = minutesToLabel(Number(busiest[0]));
  box.textContent = i18n.current === "ar"
    ? `أكثر وقت محبوب اليوم: ${label} 👀 (${bookings.length} بريكات محجوزة)`
    : `Most popular time today: ${label} 👀 (${bookings.length} breaks booked)`;
}

// -----------------------------------------------------------------
// SWAP CENTER — every swap request across the team, all statuses.
// NOTE: "From Slot"/"To Slot" reflect the booking's CURRENT time — once
// a swap is accepted the two bookings already hold their new times, so
// an accepted row shows the post-swap slots, not the original ask.
// -----------------------------------------------------------------
function renderSwapCenter() {
  const tbody = el("swapCenterBody");
  if (!tbody) return;
  const swaps = dataService.getSwapRequests().slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  if (swaps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state small">No swap requests yet.</td></tr>`;
    return;
  }
  const bookings = dataService.getBookings();
  tbody.innerHTML = swaps.map(s => {
    const fromEmp = getEmployeeById(s.fromEmployeeId);
    const toEmp = getEmployeeById(s.toEmployeeId);
    const fromBooking = bookings.find(b => b.id === s.fromBookingId);
    const toBooking = bookings.find(b => b.id === s.toBookingId);
    return `<tr>
      <td>${new Date(s.requestedAt).toLocaleString()}</td>
      <td>${fromEmp ? fromEmp.name : "—"}</td>
      <td>${fromBooking ? `<span class="no-flip">${rangeLabel(fromBooking.start, fromBooking.end)}</span>` : "—"}</td>
      <td>${toEmp ? toEmp.name : "—"}</td>
      <td>${toBooking ? `<span class="no-flip">${rangeLabel(toBooking.start, toBooking.end)}</span>` : "—"}</td>
      <td>${s.status}</td>
    </tr>`;
  }).join("");
}

// -----------------------------------------------------------------
// COMPENSATION & EMERGENCY MONTHLY REPORT
// Grouped by REAL calendar month/year (using leave_requests.createdAt and
// bookings.bookedAt) — not the weekday-only "day" field bookings use for
// their own scheduling, which is what makes an accurate monthly report
// possible without a bigger schema change.
// -----------------------------------------------------------------
let lastCompensationRows = [];

function currentMonthLabel() {
  const now = new Date();
  return now.toLocaleDateString(i18n.current === "ar" ? "ar" : "en-US", { month: "long", year: "numeric" });
}

function renderCompensationReport() {
  const titleEl = el("compensationReportTitle");
  if (titleEl) titleEl.textContent = `Compensation & Emergency — ${currentMonthLabel()}`;

  const now = new Date();
  const month = now.getMonth(), year = now.getFullYear();
  const inThisMonth = iso => { const d = new Date(iso); return d.getMonth() === month && d.getFullYear() === year; };

  const employees = dataService.getEmployees();
  const leaveRequests = dataService.getLeaveRequests();
  const bookings = dataService.getBookings();

  lastCompensationRows = employees.map(emp => {
    const myLeaves = leaveRequests.filter(l => l.employeeId === emp.id && inThisMonth(l.createdAt));
    const compensation = myLeaves.reduce((s, l) => s + l.compensationMinutes, 0);
    const myEmergencies = bookings.filter(b => b.employeeId === emp.id && b.isEmergency && b.bookedAt && inThisMonth(b.bookedAt));
    const exceeded = myEmergencies.filter(b => b.exceededCapacity).length;
    return { emp, leaveCount: myLeaves.length, compensation, emergencyCount: myEmergencies.length, exceeded };
  });

  el("compensationReportBody").innerHTML = lastCompensationRows.map(r => `
    <tr>
      <td><span class="gender-dot gender-${r.emp.gender}"></span>${i18n.current === "ar" ? r.emp.name : r.emp.nameEn}</td>
      <td>${r.leaveCount}</td>
      <td>${r.compensation} min</td>
      <td>${r.emergencyCount}</td>
      <td>${r.exceeded}</td>
    </tr>`).join("");
}

function exportCompensationCsv() {
  const header = ["Employee (AR)", "Employee (EN)", "Leave Requests", "Compensation Minutes Owed", "Emergency Breaks", "Exceeded Capacity Count"];
  const rows = lastCompensationRows.map(r => [r.emp.name, r.emp.nameEn, r.leaveCount, r.compensation, r.emergencyCount, r.exceeded]);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `breakflow-compensation-${new Date().toISOString().slice(0, 7)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------
// TABS
// -----------------------------------------------------------------
function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.dataset.tab !== tabName));
}

function renderAmalDashboard() {
  renderOverviewCards();
  renderWeekGrid();
  renderBalanceTable();
  renderPinManager();
  renderPeakTimeControl();
  populateFilters();
  renderFullBreakList();
  renderSwapCenter();
  renderCompensationReport();
  renderActivityLog();
  renderFunFact();
  renderFooterCredit();
}

function renderFooterCredit() {
  const node = el("footerCredit");
  if (!node) return;
  const name = i18n.current === "ar" ? APP_META.creatorNameAr : APP_META.creatorNameEn;
  node.textContent = i18n.t("footerCredit", { name });
}

async function initAmal() {
  i18n.init();
  await dataService.ready; // wait for the initial Supabase load
  if (dataService.onChange) dataService.onChange(() => { if (amalUnlocked) renderAmalDashboard(); });

  el("amalPasswordPrompt").textContent = i18n.t("amalPasswordPrompt");
  el("amalUnlockBtn").addEventListener("click", tryUnlock);
  el("amalPasswordInput").addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  el("filterEmployee").addEventListener("change", renderFullBreakList);
  el("filterStatus").addEventListener("change", renderFullBreakList);
  el("searchEmployee").addEventListener("input", renderFullBreakList);
  el("exportBreaksCsvBtn").addEventListener("click", exportBreaksCsv);
  el("exportCompensationCsvBtn").addEventListener("click", exportCompensationCsv);
  el("savePinsBtn").addEventListener("click", savePins);
  el("togglePeakTimeBtn").addEventListener("click", togglePeakTime);
  el("peakStartInput").addEventListener("input", e => { e.target.dataset.userEdited = "1"; });
  el("peakEndInput").addEventListener("input", e => { e.target.dataset.userEdited = "1"; });

  el("langToggleBtn").addEventListener("click", () => {
    i18n.setLanguage(i18n.current === "ar" ? "en" : "ar");
    if (amalUnlocked) renderAmalDashboard();
    el("amalPasswordPrompt").textContent = i18n.t("amalPasswordPrompt");
  });

  setInterval(() => { if (amalUnlocked) { renderOverviewCards(); renderWeekGrid(); renderBalanceTable(); } }, 30000);
}

document.addEventListener("DOMContentLoaded", initAmal);
