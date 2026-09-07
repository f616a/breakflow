/**
 * js/employees.js
 * ---------------------------------------------------------------------
 * The staff roster. Rename, add, or remove employees here — every other
 * file reads from this array by `id`, so this is the only place names
 * live. `gender` drives the personal accent color (blue/pink) and the
 * gender-aware Arabic message engine (see js/message-service.js).
 * ---------------------------------------------------------------------
 */

const EMPLOYEES = [
  { id: 1,  name: "فارس",    nameEn: "Fares",    gender: "male" },
  { id: 2,  name: "ملاوي",   nameEn: "Milawi",   gender: "male" },
  { id: 3,  name: "مهند",    nameEn: "Mohannad", gender: "male" },
  { id: 4,  name: "وليد",    nameEn: "Waleed",   gender: "male" },
  { id: 5,  name: "عبدالله", nameEn: "Abdullah", gender: "male" },
  { id: 6,  name: "سماهر",   nameEn: "Samaher",  gender: "female" },
  { id: 7,  name: "بدريه",   nameEn: "Badriah",  gender: "female" },
  { id: 8,  name: "عائشة",   nameEn: "Aisha",    gender: "female" },
  { id: 9,  name: "اسماء",   nameEn: "Asma",     gender: "female" },
  { id: 10, name: "لجين",    nameEn: "Lujain",   gender: "female" },
  { id: 11, name: "نجود",    nameEn: "Nujood",   gender: "female" },
  { id: 12, name: "رؤوم",    nameEn: "Ruoom",    gender: "female" }
];

/** Look up one employee by id — prefers the live Supabase-synced roster
 * (so renamed/re-photographed employees show up everywhere immediately),
 * falling back to this static array only if the data service isn't
 * ready yet (e.g. the very first paint before dataService.ready resolves). */
function getEmployeeById(id) {
  if (typeof dataService !== "undefined" && dataService.getEmployees) {
    const live = dataService.getEmployees().find(e => e.id === Number(id));
    if (live) return live;
  }
  return EMPLOYEES.find(e => e.id === Number(id));
}

/** Display name in the current language ("ar" | "en"). */
function getEmployeeName(id, locale) {
  const emp = getEmployeeById(id);
  if (!emp) return "";
  return locale === "en" ? emp.nameEn : emp.name;
}
