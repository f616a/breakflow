/**
 * js/employee-themes.js
 * ---------------------------------------------------------------------
 * Optional per-employee custom color theme for their personal page —
 * a small personal touch, separate from the app-wide Navy/Gold identity
 * and from the male/female personal accents used on slots/badges.
 *
 * Add more employees here the same way: pick 4-5 CSS variables to
 * override and applyEmployeeTheme() takes care of applying/reverting
 * them whenever the selected employee changes.
 * ---------------------------------------------------------------------
 */

const EMPLOYEE_THEMES = {
  9: { // اسماء / Asma — "Sage Green" / "Warm Ivory"
    "--primary-dark-teal": "#5F6E58",
    "--secondary-teal": "#7C8873",
    "--bg": "#F3EEE1",
    "--card": "#FBF9F2",
    "--border": "#E3DDCC"
  }
};

// Shared, curated color-palette presets any employee can pick for their
// own personal page — deliberately harmonious pairs, not a free color
// picker, so the result always looks intentional rather than clashing.
const THEME_PRESETS = {
  navy:    { label: "Navy & Gold (Default)",  "--primary-dark-teal": "#1E2A42", "--secondary-teal": "#2A3752", "--bg": "#F4F5FA", "--card": "#FFFFFF", "--border": "#E7E9F2" },
  sage:    { label: "Sage & Ivory",           "--primary-dark-teal": "#5F6E58", "--secondary-teal": "#7C8873", "--bg": "#F3EEE1", "--card": "#FBF9F2", "--border": "#E3DDCC" },
  ocean:   { label: "Ocean Blue",             "--primary-dark-teal": "#1B4965", "--secondary-teal": "#2E6E8E", "--bg": "#F0F7FA", "--card": "#FFFFFF", "--border": "#DCEBF2" },
  sunset:  { label: "Sunset Clay",            "--primary-dark-teal": "#8A4B38", "--secondary-teal": "#B06A4F", "--bg": "#FBF1EA", "--card": "#FFFFFF", "--border": "#F0DFD3" },
  plum:    { label: "Plum & Rose",            "--primary-dark-teal": "#5B3358", "--secondary-teal": "#7D4A78", "--bg": "#F8F1F7", "--card": "#FFFFFF", "--border": "#EBDCE8" },
  forest:  { label: "Deep Forest",            "--primary-dark-teal": "#2C4A3A", "--secondary-teal": "#3F6B54", "--bg": "#F1F6F3", "--card": "#FFFFFF", "--border": "#DDEAE3" },
  slate:   { label: "Slate Gray",             "--primary-dark-teal": "#3A4750", "--secondary-teal": "#556570", "--bg": "#F4F6F7", "--card": "#FFFFFF", "--border": "#E4E9EB" },
  amber:   { label: "Warm Amber",             "--primary-dark-teal": "#8A5A1E", "--secondary-teal": "#B0792F", "--bg": "#FBF4E8", "--card": "#FFFFFF", "--border": "#F0E2C8" }
};

const THEME_OVERRIDE_VARS = ["--primary-dark-teal", "--secondary-teal", "--bg", "--card", "--border"];

/** Applies employeeId's chosen theme (their own pick, falling back to a
 * hardcoded per-person override, then the app default) — reverts fully
 * for anyone without one so switching between employees is always clean. */
function applyEmployeeTheme(employeeId) {
  THEME_OVERRIDE_VARS.forEach(v => document.documentElement.style.removeProperty(v));
  const emp = getEmployeeById(employeeId);
  const theme = (emp && emp.themeChoice && THEME_PRESETS[emp.themeChoice]) || EMPLOYEE_THEMES[employeeId];
  if (theme) {
    THEME_OVERRIDE_VARS.forEach(v => { if (theme[v]) document.documentElement.style.setProperty(v, theme[v]); });
  }
}
