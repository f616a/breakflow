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
      <img class="avatar-thumb" data-avatar-idx="${i}" src="${e.photoUrl || avatarPlaceholder(e)}" alt="">
      <input type="text" data-idx="${i}" data-field="name" value="${e.name}" style="flex:1;">
      <input type="text" data-idx="${i}" data-field="nameEn" value="${e.nameEn}" style="flex:1;">
      <select data-idx="${i}" data-field="gender" style="width:110px;">
        <option value="male" ${e.gender === "male" ? "selected" : ""}>Male</option>
        <option value="female" ${e.gender === "female" ? "selected" : ""}>Female</option>
      </select>
      <label class="btn-link btn-secondary" style="cursor:pointer;white-space:nowrap;">
        📷 Photo
        <input type="file" accept="image/*" data-photo-idx="${i}" style="display:none;">
      </label>
    </div>
  `).join("");

  el("employeeEditorList").querySelectorAll("[data-photo-idx]").forEach(input => {
    input.addEventListener("change", e => uploadEmployeePhoto(Number(input.dataset.photoIdx), e.target.files[0]));
  });
}

// A plain-color circle with the employee's initial — shown until a real
// photo is uploaded, so the UI never has an ugly broken-image icon.
function avatarPlaceholder(emp) {
  const letter = encodeURIComponent((emp.name || "?").trim()[0] || "?");
  const bg = emp.gender === "female" ? "F0748A" : "5FA3E0";
  return `https://ui-avatars.com/api/?name=${letter}&background=${bg}&color=fff&size=64&bold=true`;
}

// Uploads directly from the browser to Supabase Storage (bucket "avatars"),
// then saves the resulting public URL onto the employee record. Requires
// the one-time bucket + policy setup in supabase-setup.sql.
async function uploadEmployeePhoto(idx, file) {
  if (!file) return;
  const list = dataService.getEmployees().map(e => Object.assign({}, e));
  const emp = list[idx];
  if (!emp) return;

  const path = `emp-${emp.id}-${Date.now()}.${(file.name.split(".").pop() || "jpg")}`;
  NotificationCenter.showToast(i18n.current === "ar" ? "جارٍ رفع الصورة..." : "Uploading photo...");

  const { error: uploadError } = await dataService.uploadAvatar(path, file);
  if (uploadError) {
    console.error("uploadAvatar", uploadError);
    NotificationCenter.showToast(i18n.current === "ar" ? "تعذّر رفع الصورة." : "Photo upload failed.", "danger");
    return;
  }

  const publicUrl = dataService.getAvatarPublicUrl(path);
  list[idx].photoUrl = publicUrl;
  dataService.updateEmployees(list);
  NotificationCenter.showToast(i18n.current === "ar" ? "تم رفع الصورة ✅" : "Photo uploaded ✅");
  renderEmployeeEditor();
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
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.start - b.start);

  el("allBookingsBody").innerHTML = rows.length === 0
    ? `<tr><td colspan="6" class="empty-state small">No active bookings.</td></tr>`
    : rows.map(b => {
        const emp = getEmployeeById(b.employeeId);
        return `<tr>
          <td>${b.date || b.day}</td>
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

async function initAdmin() {
  i18n.init();
  await dataService.ready; // wait for the initial Supabase load
  if (dataService.onChange) dataService.onChange(() => { if (adminUnlocked) renderAdminAll(); });

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

  // Default the admin booking date to today, and don't allow picking the
  // past — bookings are now tied to a REAL calendar date, not just a
  // weekday name that would otherwise recur every week forever.
  el("adminBookDay").min = getTodayDate();
  el("adminBookDay").value = getTodayDate();
}

document.addEventListener("DOMContentLoaded", initAdmin);
