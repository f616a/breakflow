/**
 * js/admin.js
 * ---------------------------------------------------------------------
 * Admin Dashboard: system configuration (shift/break rules, max
 * concurrent), the employee roster, the weekly attendance schedule,
 * and a real booking manager (view/cancel any booking, book on behalf
 * of any employee).
 *
 * SCOPE NOTE: Block Time and Announcements (requirements #29/#30) are
 * not implemented in this phase — they'd need new data model fields
 * (a "blocked periods" list, an "announcements" list) that don't exist
 * yet. Rather than fake buttons that do nothing, they're simply not
 * shown here; adding them later is a new dataService method + a small
 * UI section, not a redesign.
 * ---------------------------------------------------------------------
 */

let adminUnlocked = false;
function el(id) { return document.getElementById(id); }

async function tryAdminUnlock() {
  const input = el("adminPasswordInput");
  const msg = el("adminLockMsg");
  const ok = await AuthAdapter.verify("admin", input.value);
  input.value = "";
  if (ok) {
    adminUnlocked = true;
    el("adminLockScreen").classList.add("hidden");
    el("adminDashboard").classList.remove("hidden");
    renderAdminAll();
  } else {
    msg.textContent = i18n.current === "ar" ? "الباسوورد غلط، حاول مرة ثانية." : "Wrong password, try again.";
  }
}

// -----------------------------------------------------------------
// SYSTEM CONFIG FORM
// -----------------------------------------------------------------
function renderConfigForm() {
  const cfg = dataService.getConfig();
  el("cfgShiftStart").value = cfg.shiftStart;
  el("cfgShiftEnd").value = cfg.shiftEnd;
  el("cfgWindowStart").value = cfg.breakWindowStart;
  el("cfgWindowEnd").value = cfg.breakWindowEnd;
  el("cfgDailyAllowance").value = cfg.dailyBreakMinutes;
  el("cfgMaxContinuous").value = cfg.maxContinuousBreakMinutes;
  el("cfgMaxConcurrent").value = cfg.maxConcurrentBreaks;
}
function saveConfigForm() {
  dataService.updateConfig({
    shiftStart: el("cfgShiftStart").value,
    shiftEnd: el("cfgShiftEnd").value,
    breakWindowStart: el("cfgWindowStart").value,
    breakWindowEnd: el("cfgWindowEnd").value,
    dailyBreakMinutes: Number(el("cfgDailyAllowance").value),
    maxContinuousBreakMinutes: Number(el("cfgMaxContinuous").value),
    maxConcurrentBreaks: Number(el("cfgMaxConcurrent").value)
  });
  NotificationCenter.showToast(i18n.current === "ar" ? "تم حفظ الإعدادات." : "Settings saved.");
}

// -----------------------------------------------------------------
// EMPLOYEES
// -----------------------------------------------------------------
function renderEmployeeEditor() {
  const list = dataService.getEmployees();
  el("employeeEditorList").innerHTML = list.map((e, i) => `
    <div class="field" style="display:flex;gap:8px;align-items:center;">
      <input type="text" data-idx="${i}" data-field="name" value="${e.name}" style="flex:1;">
      <input type="text" data-idx="${i}" data-field="nameEn" value="${e.nameEn}" style="flex:1;">
      <select data-idx="${i}" data-field="gender" style="width:110px;">
        <option value="male" ${e.gender === "male" ? "selected" : ""}>Male</option>
        <option value="female" ${e.gender === "female" ? "selected" : ""}>Female</option>
      </select>
    </div>
  `).join("");
}
function saveEmployeeEditor() {
  const list = dataService.getEmployees().map(e => Object.assign({}, e));
  el("employeeEditorList").querySelectorAll("[data-idx]").forEach(input => {
    const idx = Number(input.dataset.idx);
    list[idx][input.dataset.field] = input.value;
  });
  dataService.updateEmployees(list);
  NotificationCenter.showToast(i18n.current === "ar" ? "تم تحديث الموظفين." : "Employees updated.");
  renderAdminAll();
}

// -----------------------------------------------------------------
// ATTENDANCE GRID (employees x days)
// -----------------------------------------------------------------
function renderAttendanceGrid() {
  const employees = dataService.getEmployees();
  const attendance = dataService.getAttendance();
  const table = el("attendanceTable");

  const header = `<tr><th>Employee</th>${DAY_ORDER.map(d => `<th>${d.slice(0, 3)}</th>`).join("")}</tr>`;
  const rows = employees.map(emp => {
    const cells = DAY_ORDER.map(day => {
      const checked = (attendance[day] || []).includes(emp.id);
      return `<td style="text-align:center;"><input type="checkbox" data-emp="${emp.id}" data-day="${day}" ${checked ? "checked" : ""}></td>`;
    }).join("");
    return `<tr><td>${emp.name}</td>${cells}</tr>`;
  }).join("");

  table.innerHTML = `<thead>${header}</thead><tbody>${rows}</tbody>`;
}
function saveAttendanceGrid() {
  const attendance = {};
  DAY_ORDER.forEach(day => { attendance[day] = []; });
  el("attendanceTable").querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    attendance[cb.dataset.day].push(Number(cb.dataset.emp));
  });
  dataService.updateAttendance(attendance);
  NotificationCenter.showToast(i18n.current === "ar" ? "تم تحديث جدول الدوام." : "Attendance updated.");
}

// -----------------------------------------------------------------
// ALL BOOKINGS (view + cancel any booking)
// -----------------------------------------------------------------
function renderAllBookings() {
  const rows = dataService.getBookings()
    .filter(b => b.status !== "cancelled")
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start);

  el("allBookingsBody").innerHTML = rows.length === 0
    ? `<tr><td colspan="6" class="empty-state small">No active bookings.</td></tr>`
    : rows.map(b => {
        const emp = getEmployeeById(b.employeeId);
        return `<tr>
          <td>${b.day}</td>
          <td>${emp ? emp.name : "—"}</td>
          <td>${minutesToLabel(b.start)}</td>
          <td>${minutesToLabel(b.end)}</td>
          <td>${b.status}</td>
          <td><button class="btn-link btn-danger" data-cancel="${b.id}">Cancel</button></td>
        </tr>`;
      }).join("");

  el("allBookingsBody").querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      dataService.cancelBooking(btn.dataset.cancel);
      NotificationCenter.showToast("Booking cancelled.");
      renderAllBookings();
    });
  });
}

// -----------------------------------------------------------------
// BOOK ON BEHALF OF AN EMPLOYEE
// -----------------------------------------------------------------
function refreshAdminBookingDaySelect() {
  const day = el("adminBookDay").value;
  const empSelect = el("adminBookEmployee");
  empSelect.innerHTML = dataService.getEmployees().map(e => `<option value="${e.id}">${e.name}</option>`).join("");
}
function refreshAdminBookingSlots() {
  const day = el("adminBookDay").value;
  const employeeId = Number(el("adminBookEmployee").value);
  const duration = Number(el("adminBookDuration").value);
  if (!employeeId) return;
  const slots = generateSlots(duration).filter(s => evaluateSlot(employeeId, day, s.start, s.end).status === "available");
  el("adminBookSlot").innerHTML = slots.map(s => `<option value="${s.start}|${s.end}">${rangeLabel(s.start, s.end)}</option>`).join("");
}
function submitAdminBooking() {
  const day = el("adminBookDay").value;
  const employeeId = Number(el("adminBookEmployee").value);
  const duration = Number(el("adminBookDuration").value);
  const slotValue = el("adminBookSlot").value;
  if (!employeeId || !slotValue) return;
  const [start, end] = slotValue.split("|").map(Number);
  const evalRes = evaluateSlot(employeeId, day, start, end);
  if (evalRes.status !== "available") {
    NotificationCenter.showToast("That slot is no longer valid.", "danger");
    return;
  }
  dataService.createBooking({ day, employeeId, start, end, duration });
  NotificationCenter.showToast("Booking created.");
  renderAllBookings();
}

// -----------------------------------------------------------------
// DEMO DATA RESET (dev only)
// -----------------------------------------------------------------
function renderDemoResetVisibility() {
  el("demoResetSection").classList.toggle("hidden", !CONFIG.demoMode);
}

function renderFooterCredit() {
  const node = el("footerCredit");
  if (!node) return;
  const name = i18n.current === "ar" ? APP_META.creatorNameAr : APP_META.creatorNameEn;
  node.textContent = i18n.t("footerCredit", { name });
}

function renderAdminAll() {
  renderConfigForm();
  renderEmployeeEditor();
  renderAttendanceGrid();
  renderAllBookings();
  refreshAdminBookingDaySelect();
  refreshAdminBookingSlots();
  renderDemoResetVisibility();
  renderFooterCredit();
}

function initAdmin() {
  i18n.init();
  el("adminUnlockBtn").addEventListener("click", tryAdminUnlock);
  el("adminPasswordInput").addEventListener("keydown", e => { if (e.key === "Enter") tryAdminUnlock(); });

  el("saveConfigBtn").addEventListener("click", saveConfigForm);
  el("saveEmployeesBtn").addEventListener("click", saveEmployeeEditor);
  el("saveAttendanceBtn").addEventListener("click", saveAttendanceGrid);

  el("adminBookDay").addEventListener("change", () => { refreshAdminBookingDaySelect(); refreshAdminBookingSlots(); });
  el("adminBookEmployee").addEventListener("change", refreshAdminBookingSlots);
  el("adminBookDuration").addEventListener("change", refreshAdminBookingSlots);
  el("adminBookSubmitBtn").addEventListener("click", submitAdminBooking);

  el("resetDemoDataBtn").addEventListener("click", () => {
    if (!confirm("This clears all demo bookings/notifications. Continue?")) return;
    dataService.resetAllDemoData();
    renderAdminAll();
    NotificationCenter.showToast("Demo data reset.");
  });

  // Populate the day select for the admin booking form.
  el("adminBookDay").innerHTML = DAY_ORDER.map(d => `<option value="${d}">${d}</option>`).join("");
  el("adminBookDay").value = getTodayName();
}

document.addEventListener("DOMContentLoaded", initAdmin);
