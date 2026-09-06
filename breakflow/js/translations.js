/**
 * js/translations.js
 * ---------------------------------------------------------------------
 * Every piece of UI chrome text (nav, buttons, headers, statuses, empty
 * states) lives here — never inline in HTML or scattered across JS.
 * Fun/gender-aware personal messages are a SEPARATE system: see
 * js/message-service.js. This file is strictly the professional,
 * neutral interface layer (per requirement #72 — nav/data/actions stay
 * clear and professional; only greetings/fun messages get the Hijazi tone).
 *
 * Switching language:
 *   - flips <html dir> between rtl/ltr
 *   - re-renders every element with [data-i18n]
 *   - persists the choice in localStorage
 *   - NEVER touches bookings, selected employee, or any app state
 * ---------------------------------------------------------------------
 */

const TRANSLATIONS = {
  en: {
    appName: "BreakFlow",
    tagline: "The internal team break-booking portal",
    lightMode: "Light", darkMode: "Dark",
    currentMonth: "Current Month",
    heroEyebrow: "Welcome to the team",
    heroHeadline: "Your breaks and today's schedule, in one place.",
    heroSub: "Book your break, see who's on break now, and follow today's schedule — all on one page.",
    heroQuote: "Good rest is part of productivity, not the opposite of it.",
    jumpToSchedule: "View schedule", jumpToMyBreaks: "Your breaks now",
    noticeBarSub: "Please make sure to return on time.",
    whosOnBreakSub: "Live status of the team",
    navHome: "Home", navBook: "Book", navSchedule: "Schedule",
    navSwap: "Swap", navNotifications: "Notifications", navMore: "More",
    navAmal: "Amal's Space", navAdmin: "Admin",

    shift: "Shift", breakWindow: "Break Window", dailyAllowance: "Daily Allowance",
    workingToday: "Working Today", breaksBooked: "Breaks Booked", onBreakNow: "On Break Now",
    availableSlots: "Available Slots", pendingSwaps: "Pending Swap Requests",

    whosOnBreak: "Who's On Break Now", nextUp: "Next Up", bookABreak: "BOOK A BREAK",
    todaysSchedule: "Today's Break Schedule",
    noOneOnBreakTitle: "No one is on break right now.", noOneOnBreakSub: "Full team mode.",
    noBreaksTitle: "No breaks booked yet.", noBreaksSub: "Today's schedule will appear here.",

    selectEmployee: "Select Employee", chooseDuration: "Choose Break Duration",
    whoAmI: "Who are you?", whoAmISub: "Pick your name to see your page: balance, breaks, and times.",
    pickNameFirst: "Pick your name up top first.",
    pickTime: "Pick a Time", confirmBreak: "Confirm Break",
    findNextAvailable: "Find Next Available", bestTime: "Best Time",
    breakBalance: "Break Balance", booked: "Booked", remaining: "Remaining",
    balanceCompleted: "Break allowance completed",
    confirmBtn: "CONFIRM BREAK",

    available: "Available", selected: "Selected", bookedStatus: "Booked",
    unavailable: "Unavailable", popular: "Popular", full: "Full",

    myBreaks: "My Breaks", cancelBreak: "Cancel Break", startBreak: "Start Break",
    minRemaining: "min remaining", returningSoon: "Returning Soon", breakCompleted: "Break Completed",

    statusWorking: "Working", statusScheduled: "Break Scheduled", statusOnBreak: "On Break",
    statusReturning: "Returning Soon", statusCompleted: "Break Completed", statusOff: "Off Today",

    notifications: "Notifications", markAllRead: "Mark all as read", noNotifications: "You're all caught up.",

    amalTitle: "Amal's Space", amalSubtitle: "Weekly Break Command Center",
    amalPasswordPrompt: "If you're Amal, drop the password 👀",
    amalPasswordLocked: "This space is just for Amal.",
    unlock: "Unlock", password: "Password",

    adminTitle: "Admin Settings", employees: "Employees", attendance: "Attendance",
    save: "Save", cancel: "Cancel",

    swapRequests: "Swap Requests", swapRequestsSub: "Swaps only trade the booked time — never your break balance.",
    requestSwap: "Request Swap", accept: "Accept", decline: "Decline",
    incomingSwaps: "Incoming", sentSwaps: "Sent", sentTo: "Sent to",
    waitingApproval: "Waiting for approval", noSwapRequests: "No swap requests.",
    noSwapPartners: "No one else has a swappable break right now.",

    languageSwitch: "AR | EN",
    footerCredit: "Crafted with passion by {name} ✨"
  },
  ar: {
    appName: "بريك فلو",
    tagline: "البوابة الداخلية لحجز البريكات",
    lightMode: "فاتح", darkMode: "غامق",
    currentMonth: "الشهر الحالي",
    heroEyebrow: "أهلاً وسهلاً بالفريق",
    heroHeadline: "بريكاتكم وجدولكم اليوم، في مكان واحد.",
    heroSub: "احجزي بريكك، شوفي مين على بريك الحين، وتابعي جدول اليوم — كل شي بصفحة وحدة.",
    heroQuote: "الراحة الجيدة جزء من الإنتاجية، مو ضدها.",
    jumpToSchedule: "شوفي الجدول", jumpToMyBreaks: "بريكاتك الحين",
    noticeBarSub: "يرجى الالتزام بالعودة بالوقت المحدد.",
    whosOnBreakSub: "آخر تحديث لحالة الفريق",
    navHome: "الرئيسية", navBook: "احجز بريك", navSchedule: "جدول اليوم",
    navSwap: "طلبات التبديل", navNotifications: "الإشعارات", navMore: "المزيد",
    navAmal: "مساحة أمل", navAdmin: "الإدارة",

    shift: "الدوام", breakWindow: "وقت البريك", dailyAllowance: "الرصيد اليومي",
    workingToday: "الحاضرين اليوم", breaksBooked: "البريكات المحجوزة", onBreakNow: "على بريك الآن",
    availableSlots: "أوقات فاضية", pendingSwaps: "طلبات تبديل بانتظار الموافقة",

    whosOnBreak: "مين على بريك الآن", nextUp: "الدور الجاي", bookABreak: "احجز بريك",
    todaysSchedule: "جدول بريكات اليوم",
    noOneOnBreakTitle: "ما فيه حد على بريك الحين.", noOneOnBreakSub: "الفريق كامل 💪",
    noBreaksTitle: "ما فيه بريكات محجوزة بعد.", noBreaksSub: "جدول اليوم بيظهر هنا.",

    selectEmployee: "اختر الموظف", chooseDuration: "اختر مدة البريك",
    whoAmI: "من أنتِ؟", whoAmISub: "اختاري اسمك عشان تشوفي صفحتك: رصيدك، بريكاتك، وأوقاتك.",
    pickNameFirst: "اختاري اسمك فوق أول شي.",
    pickTime: "اختر الوقت", confirmBreak: "تأكيد البريك",
    findNextAvailable: "أقرب وقت متاح", bestTime: "أفضل وقت",
    breakBalance: "رصيد البريك", booked: "محجوز", remaining: "متبقي",
    balanceCompleted: "خلص رصيد البريك اليوم",
    confirmBtn: "أكّد البريك",

    available: "متاح", selected: "مختار", bookedStatus: "محجوز",
    unavailable: "غير متاح", popular: "مزدحم", full: "مكتمل",

    myBreaks: "بريكاتي", cancelBreak: "إلغاء البريك", startBreak: "ابدأ البريك",
    minRemaining: "دقيقة متبقية", returningSoon: "قربت ترجع", breakCompleted: "خلص البريك",

    statusWorking: "شغال", statusScheduled: "بريك مجدول", statusOnBreak: "على بريك",
    statusReturning: "قربت ترجع", statusCompleted: "خلص البريك", statusOff: "إجازة اليوم",

    notifications: "الإشعارات", markAllRead: "تحديد الكل كمقروء", noNotifications: "ما فيه شي جديد، كلك متابع ✨",

    amalTitle: "مساحة أمل ✨", amalSubtitle: "Weekly Break Command Center",
    amalPasswordPrompt: "إذا أنتِ أمل، دخلي الباسوورد 👀",
    amalPasswordLocked: "هذي المساحة خاصة بأمل بس.",
    unlock: "دخول", password: "الباسوورد",

    adminTitle: "إعدادات النظام", employees: "الموظفين", attendance: "جدول الدوام",
    save: "حفظ", cancel: "إلغاء",

    swapRequests: "طلبات التبديل", swapRequestsSub: "التبديل يغيّر الوقت المحجوز بس، ما يأثر على رصيد بريكك.",
    requestSwap: "اطلب تبديل", accept: "موافقة", decline: "رفض",
    incomingSwaps: "طلبات وصلتك", sentSwaps: "طلبات أرسلتها", sentTo: "أُرسل لـ",
    waitingApproval: "بانتظار الموافقة", noSwapRequests: "ما فيه طلبات تبديل.",
    noSwapPartners: "ما فيه حد ثاني عنده بريك قابل للتبديل الحين.",

    languageSwitch: "AR | EN",
    footerCredit: "صُنع بشغف بواسطة {name} ✨"
  }
};

const I18N_KEY = "breakflow_lang";

const i18n = {
  current: "ar",

  init() {
    try {
      this.current = localStorage.getItem(I18N_KEY) || "ar";
    } catch (e) {
      this.current = "ar";
    }
    this.apply();
  },

  /** Switch language and re-render UI chrome. Never touches app state. */
  setLanguage(locale) {
    if (locale !== "ar" && locale !== "en") return;
    this.current = locale;
    try { localStorage.setItem(I18N_KEY, locale); } catch (e) { /* storage unavailable — fine, just won't persist */ }
    this.apply();
    document.dispatchEvent(new CustomEvent("languagechange", { detail: { locale } }));
  },

  t(key, vars) {
    let str = (TRANSLATIONS[this.current] && TRANSLATIONS[this.current][key]) || TRANSLATIONS.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
    }
    return str;
  },

  apply() {
    document.documentElement.setAttribute("dir", this.current === "ar" ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", this.current);
    document.querySelectorAll("[data-i18n]").forEach(node => {
      node.textContent = this.t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(node => {
      // for the rare case a translation intentionally includes an emoji/markup-safe fragment
      node.textContent = this.t(node.getAttribute("data-i18n-html"));
    });
  }
};
