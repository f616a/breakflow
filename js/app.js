/**
 * js/app.js
 * ---------------------------------------------------------------------
 * Controls index.html — the employee-facing home page. Keeps the
 * employee UI intentionally simple (requirement #69): greeting, who's
 * on break, next up, one big "Book a Break" button, today's schedule,
 * and "My Breaks" for whoever this device belongs to.
 *
 * SCOPE NOTE: there's no login system in this phase, so "who am I" is
 * simply "whichever employee this browser/device last booked as" —
 * stored in localStorage. That's the right model for a personal phone
 * (requirement #53) and is easy to swap for real auth later (the value
 * this reads/writes is a single employee id, nothing else depends on
 * how it got set).
 *
 * SCOPE NOTE 2: the employee booking flow books for TODAY only. Booking
 * ahead for future days is not part of this phase's employee UI (it
 * would need day tabs and adds real UI complexity that fights
 * requirement #69's "keep it simple" principle) — Admin can still see
 * attendance for the whole week from admin.html.
 * ---------------------------------------------------------------------
 */

const CURRENT_EMPLOYEE_KEY = "breakflow_current_employee";

const homeState = {
  day: getTodayName(),
  step: 0, // 0 = not booking, 1..4 = active step
  employeeId: getStoredEmployeeId(),
  duration: null,
  selectedSlot: null
};

const notifiedThisSession = { started: new Set(), endingSoon: new Set(), completed: new Set() };

function getStoredEmployeeId() {
  try {
    const v = localStorage.getItem(CURRENT_EMPLOYEE_KEY);
    return v ? Number(v) : null;
  } catch (e) { return null; }
}
function setStoredEmployeeId(id) {
  try { localStorage.setItem(CURRENT_EMPLOYEE_KEY, String(id)); } catch (e) {}
}

function el(id) { return document.getElementById(id); }
function genderOf(employeeId) {
  const emp = getEmployeeById(employeeId);
  return emp ? emp.gender : "neutral";
}

// -----------------------------------------------------------------
// GREETING
// -----------------------------------------------------------------
function renderGreeting() {
  const now = new Date();
  const tod = MessageService.timeOfDayFromHour(now.getHours());
  el("greetingDate").textContent = now.toLocaleDateString(i18n.current === "ar" ? "ar" : undefined, {
    weekday: "long", month: "long", day: "numeric"
  });

  if (homeState.employeeId) {
    const emp = getEmployeeById(homeState.employeeId);
    const name = i18n.current === "ar" ? emp.name : emp.nameEn;
    el("greetingTitle").textContent = MessageService.getMessage({
      event: "greeting", locale: i18n.current, gender: emp.gender, employeeId: emp.id, args: [name]
    });
  } else {
    el("greetingTitle").textContent = MessageService.getMessage({
      event: "timeGreeting", locale: i18n.current, gender: "neutral", employeeId: "global", args: [tod]
    });
  }
}

// -----------------------------------------------------------------
// TOP BAR / HERO / NOTICE BAR (premium header elements)
// -----------------------------------------------------------------
function renderTopBarAndHero() {
  const now = new Date();
  const locale = i18n.current === "ar" ? "ar" : "en-US";
  el("dateBadge").textContent = now.toLocaleDateString(locale, { month: "long", year: "numeric" });
  el("heroMonth").textContent = now.toLocaleDateString(locale, { month: "long" });
  el("heroYear").textContent = now.getFullYear();

  const cfg = dataService.getConfig();
  const windowLabel = `${minutesToLabel(timeToMinutes(cfg.breakWindowStart))} — ${minutesToLabel(timeToMinutes(cfg.breakWindowEnd))}`;
  el("noticeBarText").textContent = i18n.current === "ar"
    ? `نافذة حجز البريكات اليوم: من ${windowLabel}`
    : `Today's break booking window: ${windowLabel}`;
}

// -----------------------------------------------------------------
// THEME (dark / light) — persisted, independent of language/state
// -----------------------------------------------------------------
const THEME_KEY = "breakflow_theme";
function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; }
}
function setStoredTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  el("themeLightBtn").classList.toggle("active", theme === "light");
  el("themeDarkBtn").classList.toggle("active", theme === "dark");
}

// -----------------------------------------------------------------
// WHO'S ON BREAK NOW + CAPACITY
// -----------------------------------------------------------------
function renderWhosOnBreak() {
  const onBreak = getWhosOnBreakNow(homeState.day);
  const cfg = dataService.getConfig();
  el("capacityLabel").textContent = `${onBreak.length} / ${cfg.maxConcurrentBreaks} ${i18n.t("onBreakNow").toUpperCase()}`;

  const list = el("onBreakList");
  if (onBreak.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-title">${i18n.t("noOneOnBreakTitle")}</div>
      <div class="empty-sub">${i18n.t("noOneOnBreakSub")}</div>
    </div>`;
    return;
  }
  list.innerHTML = onBreak.map(({ booking, employee, minutesRemaining }) => `
    <div class="person-row gender-${employee.gender}">
      <span class="gender-dot gender-${employee.gender}"></span>
      <span class="person-name">${i18n.current === "ar" ? employee.name : employee.nameEn}</span>
      <span class="person-meta">${i18n.t("remaining")} ${minutesToLabel(booking.end)} · ${minutesRemaining} ${i18n.t("minRemaining")}</span>
    </div>
  `).join("");
}

// -----------------------------------------------------------------
// NEXT UP
// -----------------------------------------------------------------
function renderNextUp() {
  const next = getNextUp(homeState.day, 3);
  const list = el("nextUpList");
  if (next.length === 0) {
    list.innerHTML = `<div class="empty-state small">${i18n.t("noBreaksTitle")}</div>`;
    return;
  }
  list.innerHTML = next.map(({ booking, employee }) => `
    <div class="person-row gender-${employee.gender}">
      <span class="gender-dot gender-${employee.gender}"></span>
      <span class="person-name">${minutesToLabel(booking.start)} — ${i18n.current === "ar" ? employee.name : employee.nameEn}</span>
    </div>
  `).join("");
}

// -----------------------------------------------------------------
// TODAY'S BREAK SCHEDULE (full list, sorted, nothing hidden)
// -----------------------------------------------------------------
function renderTodaysSchedule() {
  const rows = getTodaysSchedule(homeState.day);
  const container = el("scheduleList");
  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-title">${i18n.t("noBreaksTitle")}</div>
      <div class="empty-sub">${i18n.t("noBreaksSub")}</div>
    </div>`;
    return;
  }
  container.innerHTML = rows.map(b => {
    const emp = getEmployeeById(b.employeeId);
    const name = emp ? (i18n.current === "ar" ? emp.name : emp.nameEn) : "—";
    const gClass = emp ? `gender-${emp.gender}` : "";
    const statusKey = "status" + b.status.charAt(0).toUpperCase() + b.status.slice(1).replace("-", "");
    return `
      <div class="schedule-item ${gClass}">
        <div class="schedule-time">${rangeLabel(b.start, b.end)}</div>
        <div class="schedule-name"><span class="gender-dot ${gClass}"></span>${name}</div>
        <div class="schedule-badges">
          <span class="badge-dur">${b.duration} MIN</span>
          <span class="badge-status">${i18n.t(statusKey) || b.status}</span>
        </div>
      </div>`;
  }).join("");
}

// -----------------------------------------------------------------
// MY BREAKS
// -----------------------------------------------------------------
function renderMyBreaks() {
  const container = el("myBreaksList");
  const summary = el("myBreaksSummary");
  if (!homeState.employeeId) {
    summary.textContent = "";
    container.innerHTML = `<div class="empty-state small">${i18n.t("noBreaksTitle")}</div>`;
    return;
  }
  const cfg = dataService.getConfig();
  const used = usedMinutes(homeState.employeeId, homeState.day);
  const remaining = Math.max(0, cfg.dailyBreakMinutes - used);
  summary.textContent = `${used} / ${cfg.dailyBreakMinutes} ${i18n.t("booked").toLowerCase()}`;

  const mine = bookingsForEmployeeDay(homeState.employeeId, homeState.day).sort((a, b) => a.start - b.start);
  if (mine.length === 0) {
    container.innerHTML = `<div class="empty-state small">${i18n.t("noBreaksTitle")}</div>`;
    return;
  }
  const gClass = "gender-" + genderOf(homeState.employeeId);
  const now = nowMinutes();

  container.innerHTML = mine.map(b => {
    let actionHtml = `<button class="btn-link btn-danger" data-cancel="${b.id}">${i18n.t("cancelBreak")}</button>`;
    let statusHtml = `<span class="badge-status">${i18n.t("statusScheduled")}</span>`;

    if (b.status === "on-break") {
      const left = Math.max(0, b.end - now);
      statusHtml = `<span class="badge-status badge-live">${left} ${i18n.t("minRemaining")}</span>`;
      actionHtml = "";
    } else if (b.status === "completed") {
      statusHtml = `<span class="badge-status">${i18n.t("breakCompleted")}</span>`;
      actionHtml = "";
    } else if (now >= b.start && b.status === "confirmed") {
      actionHtml = `<button class="btn-link btn-primary" data-start="${b.id}">${i18n.t("startBreak")}</button>` + actionHtml;
    } else if (b.status === "confirmed") {
      actionHtml = `<button class="btn-link btn-secondary" data-swap-open="${b.id}">${i18n.t("requestSwap")}</button>` + actionHtml;
    }

    let pickerHtml = "";
    if (swapPickerForBookingId === b.id) {
      const options = getSwappableBookings(b.id);
      if (options.length === 0) {
        pickerHtml = `<div class="empty-state small">${i18n.t("noSwapPartners")}</div>`;
      } else {
        pickerHtml = `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">` +
          options.map(o => {
            const oEmp = getEmployeeById(o.employeeId);
            const oName = oEmp ? (i18n.current === "ar" ? oEmp.name : oEmp.nameEn) : "?";
            return `<button class="btn-link btn-secondary" data-swap-with="${o.id}" data-swap-mine="${b.id}" style="text-align:start;">${oName} — ${rangeLabel(o.start, o.end)}</button>`;
          }).join("") + `</div>`;
      }
    }

    return `
      <div class="break-row ${gClass}">
        <div class="left">
          <span class="time"><span class="gender-dot ${gClass}"></span>${rangeLabel(b.start, b.end)}</span>
          <span class="badge-dur">${b.duration} MIN</span>
          ${statusHtml}
        </div>
        <div class="row-actions">${actionHtml}</div>
        ${pickerHtml}
      </div>`;
  }).join("");

  container.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => handleCancel(btn.dataset.cancel));
  });
  container.querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => handleStartBreak(btn.dataset.start));
  });
  container.querySelectorAll("[data-swap-open]").forEach(btn => {
    btn.addEventListener("click", () => openSwapPicker(btn.dataset.swapOpen));
  });
  container.querySelectorAll("[data-swap-with]").forEach(btn => {
    btn.addEventListener("click", () => requestSwap(btn.dataset.swapMine, btn.dataset.swapWith));
  });
}

function handleCancel(bookingId) {
  const removed = dataService.cancelBooking(bookingId);
  if (!removed) return;
  const gender = genderOf(removed.employeeId);
  NotificationCenter.notify(
    i18n.t("cancelBreak"),
    MessageService.getMessage({ event: "breakCancelled", locale: i18n.current, gender, employeeId: removed.employeeId })
  );
  renderAll();
}

function handleStartBreak(bookingId) {
  const booking = dataService.updateBookingStatus(bookingId, "on-break", { startedAt: new Date().toISOString() });
  if (!booking) return;
  const gender = genderOf(booking.employeeId);
  const event = booking.duration <= 15 ? "breakStarted15" : "breakStarted30";
  NotificationCenter.notify(
    i18n.t("startBreak"),
    MessageService.getMessage({ event, locale: i18n.current, gender, employeeId: booking.employeeId })
  );
  notifiedThisSession.started.add(booking.id);
  renderAll();
}

// -----------------------------------------------------------------
// SWAP REQUESTS — swap the TIME SLOTS of two existing bookings.
// Never moves minutes between employees' balances; needs both sides to
// accept; fully re-validated against every booking rule at accept time.
// -----------------------------------------------------------------
let swapPickerForBookingId = null;

function openSwapPicker(bookingId) {
  swapPickerForBookingId = swapPickerForBookingId === bookingId ? null : bookingId;
  renderMyBreaks();
}

function getSwappableBookings(excludeBookingId) {
  const now = nowMinutes();
  return bookingsForDay(homeState.day).filter(b =>
    b.id !== excludeBookingId && b.status === "confirmed" && b.start > now && b.employeeId !== homeState.employeeId
  );
}

function requestSwap(myBookingId, theirBookingId) {
  const swap = dataService.createSwapRequest(myBookingId, theirBookingId);
  if (!swap) return;
  const target = getEmployeeById(swap.toEmployeeId);
  const name = target ? (i18n.current === "ar" ? target.name : target.nameEn) : "";
  NotificationCenter.notify(
    i18n.t("requestSwap"),
    MessageService.getMessage({ event: "swapRequested", locale: i18n.current, gender: genderOf(swap.fromEmployeeId), employeeId: swap.fromEmployeeId, args: [name] })
  );
  swapPickerForBookingId = null;
  renderAll();
}

function respondSwap(swapId, accept) {
  const result = dataService.respondToSwap(swapId, accept);
  const list = dataService.getSwapRequests();
  const swap = list.find(s => s.id === swapId);
  const requester = swap ? getEmployeeById(swap.fromEmployeeId) : null;

  if (!result.ok) {
    NotificationCenter.showToast(MessageService.getMessage({ event: "swapFailed", locale: i18n.current, gender: "neutral" }), "danger");
    renderAll();
    return;
  }
  if (accept) {
    NotificationCenter.notify(i18n.t("requestSwap"),
      MessageService.getMessage({ event: "swapAccepted", locale: i18n.current, gender: genderOf(homeState.employeeId), employeeId: homeState.employeeId }));
  } else {
    NotificationCenter.notify(i18n.t("requestSwap"),
      MessageService.getMessage({ event: "swapDeclined", locale: i18n.current, gender: genderOf(homeState.employeeId), employeeId: homeState.employeeId }));
  }
  renderAll();
}

function renderSwapRequests() {
  const container = el("swapRequestsList");
  if (!container) return;
  if (!homeState.employeeId) {
    container.innerHTML = `<div class="empty-state small">${i18n.t("noSwapRequests")}</div>`;
    return;
  }
  const all = dataService.getSwapRequests();
  const incoming = all.filter(s => s.toEmployeeId === homeState.employeeId && s.status === "pending");
  const sent = all.filter(s => s.fromEmployeeId === homeState.employeeId && s.status === "pending");

  if (incoming.length === 0 && sent.length === 0) {
    container.innerHTML = `<div class="empty-state small">${i18n.t("noSwapRequests")}</div>`;
    return;
  }

  const bookings = dataService.getBookings();
  const rowsIncoming = incoming.map(s => {
    const fromEmp = getEmployeeById(s.fromEmployeeId);
    const fromBooking = bookings.find(b => b.id === s.fromBookingId);
    const toBooking = bookings.find(b => b.id === s.toBookingId);
    const name = fromEmp ? (i18n.current === "ar" ? fromEmp.name : fromEmp.nameEn) : "?";
    return `
      <div class="break-row gender-${fromEmp ? fromEmp.gender : ""}">
        <div class="left" style="flex-direction:column;align-items:flex-start;gap:6px;">
          <span style="font-weight:700;">${name}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="time">${rangeLabel(fromBooking.start, fromBooking.end)}</span>
            <span>→</span>
            <span class="time">${rangeLabel(toBooking.start, toBooking.end)}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn-link btn-primary" data-swap-accept="${s.id}">${i18n.t("accept")}</button>
          <button class="btn-link btn-danger" data-swap-decline="${s.id}">${i18n.t("decline")}</button>
        </div>
      </div>`;
  }).join("");

  const rowsSent = sent.map(s => {
    const toEmp = getEmployeeById(s.toEmployeeId);
    const name = toEmp ? (i18n.current === "ar" ? toEmp.name : toEmp.nameEn) : "?";
    return `<div class="break-row"><div class="left"><span class="time">${i18n.t("sentTo")} ${name}</span></div><span class="badge-status">${i18n.t("waitingApproval")}</span></div>`;
  }).join("");

  container.innerHTML = (rowsIncoming ? `<div class="sub" style="margin-bottom:6px;">${i18n.t("incomingSwaps")}</div>${rowsIncoming}` : "") +
    (rowsSent ? `<div class="sub" style="margin:14px 0 6px;">${i18n.t("sentSwaps")}</div>${rowsSent}` : "");

  container.querySelectorAll("[data-swap-accept]").forEach(btn => btn.addEventListener("click", () => respondSwap(btn.dataset.swapAccept, true)));
  container.querySelectorAll("[data-swap-decline]").forEach(btn => btn.addEventListener("click", () => respondSwap(btn.dataset.swapDecline, false)));
}

// -----------------------------------------------------------------
// BOOKING FLOW (progressive: employee -> duration -> time -> confirm)
// -----------------------------------------------------------------
function openBookingFlow() {
  if (!homeState.employeeId) {
    NotificationCenter.showToast(i18n.t("pickNameFirst"), "danger");
    el("whoAmICard").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  homeState.step = 1;
  el("bookingPanel").classList.remove("hidden");
  el("stepDuration").classList.remove("hidden");
  el("stepTime").classList.add("hidden");
  el("stepConfirm").classList.add("hidden");
  renderDurationButtons();
  el("bookingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderWhoAmISelect() {
  const select = el("whoAmISelect");
  const options = dataService.getEmployees();
  select.innerHTML = `<option value="">${i18n.t("selectEmployee")}…</option>` +
    options.map(e => `<option value="${e.id}" ${e.id === homeState.employeeId ? "selected" : ""}>${i18n.current === "ar" ? e.name : e.nameEn}</option>`).join("");
}

function renderEmployeeStatusCard() {
  const card = el("employeeStatusCard");
  if (!homeState.employeeId) { card.classList.add("hidden"); return; }
  const emp = getEmployeeById(homeState.employeeId);
  const cfg = dataService.getConfig();
  const used = usedMinutes(homeState.employeeId, homeState.day);
  const remaining = Math.max(0, cfg.dailyBreakMinutes - used);

  card.classList.remove("hidden");
  card.className = "status-card gender-" + emp.gender;
  el("statusName").innerHTML = `<span class="gender-dot gender-${emp.gender}"></span>${i18n.current === "ar" ? emp.name : emp.nameEn}`;
  el("statusBalance").textContent = remaining > 0 ? `${remaining} ${i18n.t("remaining")}` : i18n.t("balanceCompleted");
  el("statusFill").style.width = `${Math.min(100, (used / cfg.dailyBreakMinutes) * 100)}%`;
}

function renderDurationButtons() {
  const remaining = remainingMinutes(homeState.employeeId, homeState.day);
  const b15 = el("btnDur15"), b30 = el("btnDur30");
  b15.disabled = remaining < 15;
  b30.disabled = remaining < 30;
  b15.classList.toggle("selected", homeState.duration === 15);
  b30.classList.toggle("selected", homeState.duration === 30);
}

function chooseDuration(duration) {
  homeState.duration = duration;
  homeState.selectedSlot = null;
  renderDurationButtons();
  el("stepTime").classList.remove("hidden");
  el("stepConfirm").classList.add("hidden");
  renderSlotGrid();
}

function renderSlotGrid() {
  const grid = el("slotGrid");
  const gClass = "gender-" + genderOf(homeState.employeeId);
  grid.className = "slot-grid " + gClass;
  const cfg = dataService.getConfig();

  grid.innerHTML = generateSlots(homeState.duration).map(slot => {
    const evalRes = evaluateSlot(homeState.employeeId, homeState.day, slot.start, slot.end);
    const isSelected = homeState.selectedSlot && homeState.selectedSlot.start === slot.start && homeState.selectedSlot.end === slot.end;
    const load = overlappingCount(homeState.day, slot.start, slot.end, null);
    const isPopular = load >= cfg.maxConcurrentBreaks - 1 && evalRes.status === "available";
    const cls = ["slot-pill"];
    if (isSelected) cls.push("selected");
    if (evalRes.status !== "available" && !isSelected) cls.push("disabled");
    if (isPopular) cls.push("popular");
    return `<button class="${cls.join(" ")}" data-start="${slot.start}" data-end="${slot.end}">${rangeLabel(slot.start, slot.end)}</button>`;
  }).join("");

  grid.querySelectorAll(".slot-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const start = Number(pill.dataset.start), end = Number(pill.dataset.end);
      const evalRes = evaluateSlot(homeState.employeeId, homeState.day, start, end);
      const isSelected = homeState.selectedSlot && homeState.selectedSlot.start === start;
      if (evalRes.status !== "available" && !isSelected) {
        NotificationCenter.showToast(
          MessageService.getMessage({ event: evalRes.reasonKey === "errorInsufficientBalance" ? "errorInsufficientBalance" : "errorSlotTaken",
            locale: i18n.current, gender: genderOf(homeState.employeeId), args: evalRes.reasonArgs || [] }) ||
          i18n.t("unavailable"),
          "danger"
        );
        return;
      }
      homeState.selectedSlot = { start, end };
      renderSlotGrid();
      renderConfirmStep();
    });
  });
}

function findNext() {
  const slot = findNextAvailableSlot(homeState.employeeId, homeState.day, homeState.duration);
  if (!slot) { NotificationCenter.showToast(i18n.t("unavailable"), "danger"); return; }
  homeState.selectedSlot = slot;
  renderSlotGrid();
  renderConfirmStep();
}
function findBest() {
  const slot = findBestTime(homeState.employeeId, homeState.day, homeState.duration);
  if (!slot) { NotificationCenter.showToast(i18n.t("unavailable"), "danger"); return; }
  homeState.selectedSlot = slot;
  renderSlotGrid();
  renderConfirmStep();
}

function renderConfirmStep() {
  if (!homeState.selectedSlot) { el("stepConfirm").classList.add("hidden"); return; }
  el("stepConfirm").classList.remove("hidden");
  const emp = getEmployeeById(homeState.employeeId);
  el("confirmSummary").innerHTML = `
    <div><span class="k">${i18n.t("selectEmployee")}</span><span class="v">${i18n.current === "ar" ? emp.name : emp.nameEn}</span></div>
    <div><span class="k">${i18n.t("pickTime")}</span><span class="v">${rangeLabel(homeState.selectedSlot.start, homeState.selectedSlot.end)}</span></div>
    <div><span class="k">${i18n.t("chooseDuration")}</span><span class="v">${homeState.duration} MIN</span></div>
  `;
}

function confirmBooking() {
  const evalRes = evaluateSlot(homeState.employeeId, homeState.day, homeState.selectedSlot.start, homeState.selectedSlot.end);
  if (evalRes.status !== "available") {
    NotificationCenter.showToast(i18n.t("unavailable"), "danger");
    renderSlotGrid();
    return;
  }
  // The "booked!" success message (or a "that time was just taken" failure
  // message) is fired by dataService itself, only once the server has
  // actually confirmed the write — see services/supabase-data-service.js.
  // Firing it here instead would risk showing "success" a split second
  // before a legitimate server-side rejection rolls the booking back.
  dataService.createBooking({
    day: homeState.day, employeeId: homeState.employeeId,
    start: homeState.selectedSlot.start, end: homeState.selectedSlot.end, duration: homeState.duration
  });

  homeState.step = 0;
  homeState.selectedSlot = null;
  homeState.duration = null;
  el("bookingPanel").classList.add("hidden");
  renderAll();
}

// -----------------------------------------------------------------
// LIVE TICK — countdowns, auto status transitions, timely notifications
// -----------------------------------------------------------------
function liveTick() {
  const now = nowMinutes();
  bookingsForDay(homeState.day).forEach(b => {
    if (b.status === "on-break") {
      if (now >= b.end - 5 && now < b.end && !notifiedThisSession.endingSoon.has(b.id)) {
        NotificationCenter.notify(i18n.t("returningSoon"),
          MessageService.getMessage({ event: "breakEndingSoon", locale: i18n.current, gender: genderOf(b.employeeId), employeeId: b.employeeId }));
        notifiedThisSession.endingSoon.add(b.id);
      }
      if (now >= b.end && !notifiedThisSession.completed.has(b.id)) {
        dataService.updateBookingStatus(b.id, "completed", { completedAt: new Date().toISOString() });
        NotificationCenter.notify(i18n.t("breakCompleted"),
          MessageService.getMessage({ event: "breakCompleted", locale: i18n.current, gender: genderOf(b.employeeId), employeeId: b.employeeId }));
        notifiedThisSession.completed.add(b.id);
      }
    }
  });
  renderAll();
}

// -----------------------------------------------------------------
// FULL RENDER + INIT
// -----------------------------------------------------------------
function renderFooterCredit() {
  const el2 = document.getElementById("footerCredit");
  if (!el2) return;
  const name = i18n.current === "ar" ? APP_META.creatorNameAr : APP_META.creatorNameEn;
  el2.textContent = i18n.t("footerCredit", { name });
}

function renderAll() {
  renderGreeting();
  renderTopBarAndHero();
  renderWhoAmISelect();
  renderEmployeeStatusCard();
  renderWhosOnBreak();
  renderNextUp();
  renderTodaysSchedule();
  renderMyBreaks();
  renderSwapRequests();
  renderFooterCredit();
  NotificationCenter.renderBell();
}

async function initApp() {
  i18n.init();
  applyTheme(getStoredTheme());
  await dataService.ready; // wait for the initial Supabase load before first render
  if (dataService.onChange) dataService.onChange(renderAll); // live updates from other devices
  renderAll();

  el("bookBreakBtn").addEventListener("click", openBookingFlow);
  el("whoAmISelect").addEventListener("change", e => {
    homeState.employeeId = e.target.value ? Number(e.target.value) : null;
    homeState.duration = null;
    homeState.selectedSlot = null;
    homeState.step = 0;
    el("bookingPanel").classList.add("hidden");
    if (homeState.employeeId) setStoredEmployeeId(homeState.employeeId);
    renderAll();
  });
  el("btnDur15").addEventListener("click", () => chooseDuration(15));
  el("btnDur30").addEventListener("click", () => chooseDuration(30));
  el("findNextBtn").addEventListener("click", findNext);
  el("bestTimeBtn").addEventListener("click", findBest);
  el("confirmBookingBtn").addEventListener("click", confirmBooking);
  el("closeBookingBtn").addEventListener("click", () => el("bookingPanel").classList.add("hidden"));

  el("langToggleBtn").addEventListener("click", () => {
    i18n.setLanguage(i18n.current === "ar" ? "en" : "ar");
    renderAll();
  });
  document.addEventListener("languagechange", renderAll);

  el("themeLightBtn").addEventListener("click", () => { applyTheme("light"); setStoredTheme("light"); });
  el("themeDarkBtn").addEventListener("click", () => { applyTheme("dark"); setStoredTheme("dark"); });

  el("notifBellBtn").addEventListener("click", () => {
    const panel = el("notifPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) NotificationCenter.renderList(el("notifList"));
  });
  el("markAllReadBtn").addEventListener("click", () => {
    NotificationCenter.markAllRead();
    NotificationCenter.renderList(el("notifList"));
  });

  setInterval(liveTick, 20000);
}

document.addEventListener("DOMContentLoaded", initApp);
