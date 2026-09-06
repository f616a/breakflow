# BreakFlow — Employee Break Management System

A break-booking and management system for a 12-person team. Vanilla HTML/CSS/JS,
no build step, no frameworks. Designed to run as-is on GitHub Pages and to be
migrated onto a real shared backend (Supabase/Firebase) later without rewriting
the UI.

## How to run locally

No build tools needed. Just serve the folder over HTTP (opening `index.html`
directly via `file://` mostly works too, but a local server avoids browser
quirks around `fetch`/manifest loading):

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use the VS Code "Live Server" extension, or `npx serve`.

## How to deploy to GitHub Pages

1. Push this folder to a GitHub repository (root of the repo, or a `/docs` folder).
2. Repo Settings → Pages → set the source branch/folder.
3. GitHub gives you a public URL within a minute or two.

No environment variables or secrets are needed for the current (demo/local)
version — see **Security Notes** below before that changes.

## Project structure

```
breakflow/
├── index.html          Employee home page (greeting, who's on break, book, schedule, my breaks)
├── admin.html           Password-gated: system config, employees, attendance, bookings
├── amal.html             مساحة أمل — password-gated manager command center
├── manifest.json         PWA metadata (see PWA Notes)
├── css/
│   ├── variables.css     Design tokens (Teal identity + male/female accents)
│   ├── global.css        Base element styles, page shell, toasts
│   ├── components.css    Buttons, cards, slot pills, badges, tables
│   ├── dashboard.css     Header/nav layout, page-specific arrangement
│   └── responsive.css    Mobile-first breakpoints
├── js/
│   ├── config.js         ALL tunable settings — start here to change rules
│   ├── employees.js       The staff roster (names, gender)
│   ├── attendance.js      Default weekly attendance
│   ├── translations.js    AR/EN UI text + the i18n engine (RTL, persistence)
│   ├── message-service.js Gender-aware Hijazi/English fun messages
│   ├── auth.js            Password check abstraction (see Security Notes)
│   ├── booking.js         Time helpers + the full validation engine
│   ├── schedule.js        Today's schedule / live status helpers
│   ├── notifications.js   Toasts + in-app notification center
│   ├── app.js             index.html controller
│   ├── admin.js           admin.html controller
│   └── amal.js            amal.html controller
├── services/
│   ├── data-service.js         The ONLY interface UI code calls
│   └── local-storage-service.js Demo-mode backend (see below)
└── assets/icons/          PWA icon slots (add real PNGs before shipping)
```

## Where to edit things

| What | File |
|---|---|
| Employee names / gender | `js/employees.js` (or Admin → Employees, which persists over it) |
| Who works which day | `js/attendance.js` (or Admin → Attendance) |
| Shift hours, break window, daily allowance, max continuous, max concurrent | `js/config.js` (or Admin → Break Rules) |
| Creator credit in the footer | `APP_META` in `js/config.js` |
| Demo/Amal/Admin passwords | `DEMO_AUTH` in `js/config.js` — **see Security Notes, this is not production-safe** |
| Fun/greeting message pools | `js/message-service.js` |
| UI chrome text (buttons, nav, labels) | `js/translations.js` |

## How demo storage works

Everything (bookings, config overrides, employee edits, attendance edits,
notifications, activity log) is stored in the browser's `localStorage`.
That means:

- Data is **per-browser, per-device**. Twelve employees on twelve phones each
  have their own separate copy — this is a demo/single-device mode, not a
  real multi-user backend (see requirement #56 in the original brief).
- Clearing browser data wipes it.
- It's perfectly fine for testing the whole system on one machine.

Admin → "Reset Demo Data" clears it (only shown while `CONFIG.demoMode` is `true`).

## How to later connect Supabase (or Firebase, or any real backend)

The whole app talks to data through `services/data-service.js`:

```js
const dataService = LocalStorageDataService;
```

To go live with a shared backend:

1. Write `services/supabase-data-service.js` implementing the exact same
   method names as `LocalStorageDataService` (`getBookings`, `createBooking`,
   `cancelBooking`, `getConfig`, `updateConfig`, `getEmployees`,
   `updateEmployees`, `getAttendance`, `updateAttendance`,
   `getNotifications`, `addNotification`, etc.) but backed by Supabase calls.
2. Change the one line in `data-service.js` to point at it.
3. No other file needs to change — `app.js`, `admin.js`, `amal.js`, and
   `booking.js` only ever call `dataService.xxx()`.

Concurrency: `evaluateSlot()` in `booking.js` is a pure function that reads
current bookings and returns a verdict. When wiring a real database, re-run
this same check against the latest data immediately before the write (not
just before showing the button as enabled) to guard against two people
booking the same slot at the same instant.

## Security notes

- `DEMO_AUTH` in `js/config.js` holds plaintext demo passwords for
  **مساحة أمل** and Admin. This is fine for a local prototype and is **not**
  safe for a real deployment — anyone can view the page source and read them.
- `js/auth.js` isolates every password check behind `AuthAdapter.verify()`.
  Swapping to real auth (Supabase Auth, or a serverless function that holds
  the real secret and returns a signed session) means editing that one file.
- Never commit real database secrets, service-role keys, or private API keys
  to this repo. If/when Supabase is connected, only the public anon key
  (protected by Row Level Security) belongs in frontend code — any admin
  secret must live server-side.

## PWA notes

`manifest.json` is in place (name, colors, icon slots) so the app is
"add to home screen"-ready visually. **No service worker is included yet** —
adding one is a later phase, deliberately, because a half-finished service
worker can make local development confusing (stale caches, etc.). When ready:
add `sw.js`, register it from each HTML page, and start with a minimal
cache-the-shell strategy.

## What's implemented vs. deferred

This ships a real, working Phase 1–4-ish foundation: design system, employee
roster + attendance, the full booking validation engine (60-min daily cap,
30-min continuous cap with the adjacent-booking exploit blocked, max
concurrent capacity, break-window bounds, past-time blocking), Today's
Schedule, live status + countdowns, in-app notifications, the bilingual
gender-aware Hijazi message engine, مساحة أمل (lock screen + a real
overview/week/employee-balance/full-list/activity-log dashboard), and a
working Admin settings page.

**Deliberately not included** (the architecture is ready for all of these —
none of them require touching `booking.js` or the data-service contract):

- **Break Swap system** (requirements #24–27) — no swap request/accept/decline
  flow. `services/local-storage-service.js` documents the planned method
  signatures at the bottom of the file.
- **Waitlist** (requirement #28).
- **Admin Block Time / Announcements** (requirements #29–30).
- **True weekly archiving** (requirements #34/#35/#48/#104–105) — bookings are
  stored by weekday name, not a real calendar date, so there's no concept of
  "last week vs. this week" yet. مساحة أمل's "week" view is a live snapshot
  computed from current data, honestly labeled as such rather than faking a
  Week ID / archive browser that doesn't exist.
- **Capacity heatmap, weekly break matrix, exports (CSV/print)**
  (requirements #93–94, #106).
- **Service worker / real installability** (requirement #52) — manifest only.
- **Supabase/Firebase connection** — the adapter is ready, the actual backend
  isn't wired up.

None of the above are faked with placeholder UI — they're simply absent, per
the "no fake functionality" requirement, so nothing in the shipped app lies
about what it does.
