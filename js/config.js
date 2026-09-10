/**
 * js/config.js
 * ---------------------------------------------------------------------
 * Single source of truth for every tunable value in BreakFlow.
 * Business logic files NEVER hardcode these numbers — they always read
 * CONFIG.* live, so changing a rule here (or later from Admin Settings)
 * changes behavior everywhere without touching other files.
 * ---------------------------------------------------------------------
 */

const CONFIG = {
  shiftStart: "09:00",
  shiftEnd: "17:00",
  breakWindowStart: "09:15",
  breakWindowEnd: "16:30",
  dailyBreakMinutes: 60,
  minBreakMinutes: 15,
  maxContinuousBreakMinutes: 30,
  slotInterval: 15,

  // Demo default — never compared against directly in business logic,
  // always read as CONFIG.maxConcurrentBreaks so Admin can change it.
  maxConcurrentBreaks: 2,

  // Minimum spacing (minutes) required between any two DIFFERENT breaks
  // that don't overlap — prevents back-to-back scheduling with zero
  // breathing room, without affecting the max-concurrent overlap rule
  // (two people genuinely overlapping is still fine up to capacity).
  minGapMinutes: 5,

  // No one can create a NEW booking before this real clock time, even if
  // the slot itself is later in the day — stops people booking hours
  // before their shift even starts. Doesn't affect a slot's own start
  // time (breakWindowStart), only WHEN the booking action is allowed.
  bookingOpensAt: "09:00",

  // "Peak Time" — Amal can temporarily force capacity down to 1 for a
  // chosen window (e.g. a busy hour), then turn it back off. Editable
  // from مساحة أمل; not meant to be hand-edited here.
  peakTimeActive: false,
  peakTimeMode: "specificWindow", // "specificWindow" | "toShiftEnd"
  peakTimeStart: "12:00",
  peakTimeEnd: "13:00",

  // Real calendar dates ("YYYY-MM-DD") that Amal has opened for EARLY
  // self-booking — an employee can normally only book TODAY themselves;
  // adding a future date here lets them book that specific day in
  // advance too (bypassing the 9am-opens-at gate, since that rule only
  // ever applies to bookings made FOR today). Removing a date closes it
  // again. Each day is independent — this never affects any other date.
  openBookingDates: [],

  // Swap requests auto-expire after this many minutes if not accepted/declined.
  // (Swap system architecture is ready; the feature itself ships in a later phase.)
  swapExpirationMinutes: 15,

  // Waitlist offers expire after this many minutes if not confirmed.
  // (Waitlist architecture is ready; the feature itself ships in a later phase.)
  waitlistExpirationMinutes: 5,

  // "Sunday" or "Monday" — every weekly calculation should read this instead
  // of assuming a start day. Weekly archiving itself is a later phase; this
  // flag is here so that phase doesn't require touching booking logic.
  weekStartDay: "Sunday",

  // Demo-mode flag. When true, seed data may be loaded and a "Reset Demo
  // Data" control may be shown. Set to false before a real deployment.
  // FALSE now that this app is backed by a real shared Supabase database —
  // "Reset Demo Data" would wipe everyone's real bookings, so it's hidden.
  demoMode: false
};

// Days, in fixed calendar order — used everywhere so "day" always means
// the same thing (attendance keys, schedules, weekly views).
const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// App-wide branding / credit info — edit here, nowhere else.
const APP_META = {
  name: "BreakFlow",
  tagline: "Employee Break Management System",
  creatorNameAr: "فارس الأحمدي",
  creatorNameEn: "Fares Alahmadi"
};

// ---- Auth (DEMO ONLY — see js/auth.js for the full explanation) ----
// These constants exist ONLY so the app has something to check against in
// local/demo mode. They are never logged, never shown in the UI, and this
// file is exactly where a real deployment would delete these two lines
// and point AuthAdapter at a real backend instead.
const DEMO_AUTH = {
  amalPassword: "1999",
  adminPassword: "1999"
};
