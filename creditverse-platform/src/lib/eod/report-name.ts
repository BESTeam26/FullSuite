/**
 * What an EOD report is called.
 *
 * Dee, 2026-09-16, specifying it exactly:
 *
 *   Agent Name - EOD Report - Month Day, Year
 *   James Ivan Lazo - EOD Report - September 16, 2026
 *
 * One function, because the same string is the page heading, the email subject
 * and the notification — and three places composing it separately is how the
 * email subject and the screen begin disagreeing about what the same report is
 * called. The database composes the subject with
 * `to_char(..., 'FMMonth FMDD, YYYY')`; this is the identical format, in the one
 * place the interface uses.
 *
 * The name comes from the canonical profile and is never assembled from an
 * email address or a hardcoded list — Dee's person-independence rule: "Names
 * and emails are DISPLAY ONLY".
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * `workDate` is a plain calendar date — "2026-09-16" — and is deliberately NOT
 * put through `new Date()`, which reads it as UTC midnight and renders the
 * previous day for anybody west of Greenwich. A day's report must be named for
 * the day it covers, wherever the reader is sitting.
 */
export function formatReportDate(workDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
  if (!match) return workDate;
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${Number(day)}, ${year}` : workDate;
}

export function eodReportName(employeeName: string, workDate: string): string {
  const who = employeeName.trim() || "Team member";
  return `${who} - EOD Report - ${formatReportDate(workDate)}`;
}
