/**
 * js/employee-layouts.js
 * ---------------------------------------------------------------------
 * Per-employee page LAYOUT template — distinct from color theme
 * (js/employee-themes.js). A layout changes WHERE things sit on the
 * page (via CSS `order` on .wrap, which is a flex column), not what
 * color they are.
 *
 * "modern" is the default — natural document order, no override class
 * needed. Each additional layout is a CSS class added to .wrap; see
 * css/components.css for the actual `order` rules per layout.
 *
 * Adding a new layout: define it here with a label, add its CSS rules
 * in components.css scoped under `.wrap.layout-<key>`, and it appears
 * automatically in the picker.
 * ---------------------------------------------------------------------
 */

const LAYOUT_PRESETS = {
  modern: { label: "Modern (Default)" },
  neoclassic: { label: "NeoClassic — Book a Break at the top" }
};

const LAYOUT_CLASS_PREFIX = "layout-";

/** Applies employeeId's chosen page layout by swapping the `.wrap` class. */
function applyEmployeeLayout(employeeId) {
  const wrap = document.querySelector(".wrap");
  if (!wrap) return;
  Object.keys(LAYOUT_PRESETS).forEach(key => wrap.classList.remove(LAYOUT_CLASS_PREFIX + key));
  const emp = getEmployeeById(employeeId);
  const choice = (emp && emp.layoutChoice && LAYOUT_PRESETS[emp.layoutChoice]) ? emp.layoutChoice : "modern";
  if (choice !== "modern") wrap.classList.add(LAYOUT_CLASS_PREFIX + choice);
}
