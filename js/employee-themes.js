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

const THEME_OVERRIDE_VARS = ["--primary-dark-teal", "--secondary-teal", "--bg", "--card", "--border"];

/** Applies employeeId's custom theme if one exists, otherwise reverts to the app default. */
function applyEmployeeTheme(employeeId) {
  THEME_OVERRIDE_VARS.forEach(v => document.documentElement.style.removeProperty(v));
  const theme = EMPLOYEE_THEMES[employeeId];
  if (theme) {
    Object.keys(theme).forEach(k => document.documentElement.style.setProperty(k, theme[k]));
  }
}
