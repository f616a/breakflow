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
      <span class="gender-dot
