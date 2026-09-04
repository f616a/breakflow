/**
 * js/attendance.js
 * ---------------------------------------------------------------------
 * Who works which day of the week, by employee id. An employee not
 * listed for a given day simply doesn't appear in that day's booking
 * options. Admin can edit this from admin.html; it's saved through the
 * data service so it survives a page reload.
 * ---------------------------------------------------------------------
 */

const DEFAULT_ATTENDANCE = {
  Sunday:    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  Monday:    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  Tuesday:   [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  Wednesday: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  Thursday:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  Friday:    [2, 3, 5, 6, 8, 9, 11, 12],
  Saturday:  [1, 4, 7, 10]
};
