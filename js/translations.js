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
    whoAmI: "Who are you?", whoAmISub: "Tap your photo or name to see your page: balance, breaks, and times.",
    pickNameFirst: "Pick your name up top first.", wrongPin: "Wrong PIN.",
    pickTime: "Pick a Time", confirmBreak: "Confirm Break",
    findNextAvailable: "Find Next Available", bestTime: "Best Time",
    breakBalance: "Break Balance", booked: "Booked", remaining: "Remaining",
    balanceCompleted: "Break allowance completed",
    confirmBtn: "CONFIRM BREAK",

    available: "Available", selected: "Selected", bookedStatus: "Booked",
    unavailable: "Unavailable", popular: "Popular", full: "Full",
    tooEarlyToBook: "Booking opens at {time}.", tooCloseToOtherBreak: "Too close to another break — leave at least {gap} minutes.",
    peakTimeFull: "Peak Time is active — only one person can be on break right now.",

    myBreaks: "My Breaks", cancelBreak: "Cancel Break", startBreak: "Start Break", imBack: "I'm Back",
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

    emergencyBreak: "Emergency Break", emergencyBreakSub: "For genuine emergencies only — skips the usual capacity limit, but still counts against your daily balance.",
    takeEmergencyBreak: "Take Emergency Break Now", emergencyMinutes: "Minutes",
    emergency: "Emergency",
    wasRescheduledFrom: "was", byManagementPeakTime: "changed by management (Peak Time)",
    peakBannerTitle: "Peak Time is active",
    peakBannerBodyWindow: "Management has activated Peak Time from {start} to {end}. During this window, only ONE person can be on break at a time. If your break fell in this window, it's been rescheduled to a fair turn (15 minutes at a time). Breaks outside this window are unaffected.",
    peakBannerBodyToShiftEnd: "Management has activated Peak Time from {start} until the end of the shift. During this time, only ONE person can be on break at a time. Anyone affected has been rescheduled into a fair turn-based order (15 minutes at a time) to make sure everyone still gets their full break before the shift ends.",
    customizeMyPage: "Customize my page",

    requestLeave: "Request Leave From Duty", requestLeaveSub: "Cancels today's remaining breaks and logs compensation time owed.",
    requestLeaveConfirm: "Requesting leave will cancel all your remaining breaks today and log compensation time. Are you sure?",
    myCompensation: "My Compensation", compensationThisMonth: "Owed this month", noCompensationOwed: "You don't owe any compensation time this month.",
    hoursShort: "h", minutesShort: "m",

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
    whoAmI: "من أنتِ؟", whoAmISub: "اضغطي صورتك أو اسمك عشان تشوفي صفحتك: رصيدك، بريكاتك، وأوقاتك.",
    pickNameFirst: "اختاري اسمك فوق أول شي.", wrongPin: "الرقم السري غلط.",
    pickTime: "اختر الوقت", confirmBreak: "تأكيد البريك",
    findNextAvailable: "أقرب وقت متاح", bestTime: "أفضل وقت",
    breakBalance: "رصيد البريك", booked: "محجوز", remaining: "متبقي",
    balanceCompleted: "خلص رصيد البريك اليوم",
    confirmBtn: "أكّد البريك",

    available: "متاح", selected: "مختار", bookedStatus: "محجوز",
    unavailable: "غير متاح", popular: "مزدحم", full: "مكتمل",
    tooEarlyToBook: "الحجز يفتح الساعة {time}.", tooCloseToOtherBreak: "قريب جدًا من بريك ثاني — خلي فاصل {gap} دقايق على الأقل.",
    peakTimeFull: "وقت الذروة مفعّل الحين — شخص وحد بس يقدر يكون على بريك.",

    myBreaks: "بريكاتي", cancelBreak: "إلغاء البريك", startBreak: "ابدأ البريك", imBack: "رجعت",
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

    emergencyBreak: "بريك اضطراري", emergencyBreakSub: "بس للحالات الطارئة فعليًا — يتجاوز حد الزحمة المعتاد، بس يُخصم من رصيدك اليومي زي أي بريك عادي.",
    takeEmergencyBreak: "خذ بريك اضطراري الحين", emergencyMinutes: "الدقايق",
    emergency: "اضطراري",
    wasRescheduledFrom: "كان بوقت", byManagementPeakTime: "تغيّر بسبب تفعيل وقت الذروة من الإدارة",
    peakBannerTitle: "وقت الذروة مفعّل",
    peakBannerBodyWindow: "فعّلت الإدارة وضع الذروة من {start} إلى {end}. خلال هذي الفترة، شخص وحد بس يقدر يكون على بريك بنفس اللحظة. لو كان بريكك يقع بهذي الفترة، انترتب لك بدور عادل (15 دقيقة بالدور). بريكاتك خارج هذي الفترة ما تأثرت.",
    peakBannerBodyToShiftEnd: "فعّلت الإدارة وضع الذروة من {start} لين نهاية الدوام. خلال هذي الفترة، شخص وحد بس يقدر يكون على بريك بنفس اللحظة. أي حد تأثر انترتب له دور عادل (15 دقيقة بالدور) عشان يضمن حصوله على كامل وقته قبل ما ينتهي الدوام.",
    customizeMyPage: "خصّصي صفحتك",

    requestLeave: "استئذان من الدوام", requestLeaveSub: "يلغي بريكات اليوم الباقية ويسجل وقت التعويض المستحق.",
    requestLeaveConfirm: "الاستئذان بيلغي كل بريكاتك الباقية اليوم ويسجل عليك وقت تعويض. متأكد؟",
    myCompensation: "التعويض المستحق عليّ", compensationThisMonth: "مستحق هالشهر", noCompensationOwed: "ما عليك أي تعويض هالشهر.",
    hoursShort: "س", minutesShort: "د",

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
