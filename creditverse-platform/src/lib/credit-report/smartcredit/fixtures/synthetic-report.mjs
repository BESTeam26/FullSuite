/**
 * ONE synthetic report, defined once.
 *
 * The whole point of the adapter architecture is that SmartCredit's HTML
 * export and its PDF export are the same report rendered twice. A fixture
 * that only claimed to be the same report would prove nothing — so this
 * module IS the report, and the two generators render it. If a field is in
 * here, it is in both files with the same value, and any difference the
 * adapters produce is a difference in the adapters.
 *
 * EVERY VALUE IS INVENTED. No consumer report is in this repository, and the
 * real export this layout was measured from stays out of it permanently.
 *
 * The cases, chosen because each one breaks a shortcut:
 *
 *   NORTHSTAR CARD 4417   three bureaus agree — the ordinary case
 *   HARBOR AUTO 8823      Experian only; the other two print an em-dash, so a
 *                         parser that packs values left attributes them wrong
 *   MERIDIAN LOAN 5501    fields on one page, payment history on the next
 *   ATLAS RECOVERY 9910   no bureau header at all — must stay unattributed
 *   SUMMIT BANK 3072      headers REVERSED, Equifax leftmost — only the
 *                         declared header resolves it; position gets it wrong
 */

/** label → the three values, in TransUnion, Experian, Equifax order. */
const AGREE = [
  ["Account Number", "Account #", ["441700****", "441700****", "441700****"]],
  ["High Balance", "High Balance", ["$1,240", "$1,240", "$1,240"]],
  ["Last Verified", "Last Verified", ["08/26/2026", "08/26/2026", "08/26/2026"]],
  ["Date of Last Activity", "Date of Last Activity", ["12/10/2025", "12/10/2025", "12/10/2025"]],
  ["Date Reported", "Date Reported", ["08/26/2026", "08/26/2026", "08/26/2026"]],
  ["Date Opened", "Date Opened", ["10/03/2022", "10/03/2022", "10/03/2022"]],
  /* A reported zero. Must never read as "no balance reported". */
  ["Balance Owed", "Balance Owed", ["$0", "$0", "$0"]],
  /* An em-dash: this bureau's column is empty for this field. A third state. */
  ["Closed Date", "Closed Date", ["——", "——", "——"]],
  ["Account Rating", "Account Rating", ["Open", "Open", "Open"]],
  ["Account Description", "Account Description", ["Individual", "Individual", "Individual"]],
  ["Dispute Status", "Dispute Status", ["Account not disputed", "Account not disputed", "Account not disputed"]],
  ["Creditor Type", "Creditor Type", ["Bank Credit Cards", "Bank Credit Cards", "Bank Credit Cards"]],
  ["Account Status", "Account Status", ["Open", "Open", "Open"]],
  ["Payment Status", "Payment Status", ["Current", "Current", "Current"]],
  ["Creditor Remarks", "Creditor Remarks", ["——", "——", "——"]],
  ["Payment Amount", "Payment Amount", ["$35", "$35", "$35"]],
  ["Last Payment", "Last Payment", ["12/10/2025", "12/10/2025", "12/10/2025"]],
  ["Term Length", "Term Length", ["0", "0", "0"]],
  ["Past Due Amount", "Past Due Amount", ["$0", "$0", "$0"]],
  ["Account Type", "Account Type", ["Credit Card", "Credit Card", "Credit Card"]],
  ["Payment Frequency", "Payment Frequency", ["——", "——", "——"]],
  ["Credit Limit", "Credit Limit", ["$1,500", "$1,500", "$1,500"]],
];

const withValues = (overrides) =>
  AGREE.map(([pdfLabel, htmlLabel, values]) => [pdfLabel, htmlLabel, overrides[pdfLabel] ?? values]);

/**
 * The 24 months, exactly as the export prints them: a year marker stands in
 * for January, and each bureau's row starts in a different month — which is
 * why nothing may be located by index.
 */
export const TU_MONTHS = ["Aug", "Sep", "Oct", "Nov", "Dec", "'25", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
  "Aug", "Sep", "Oct", "Nov", "Dec", "'26", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
export const EX_MONTHS = ["Sep", "Oct", "Nov", "Dec", "'25", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec", "'26", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

/** The provider's codes, per month. `C` current, `1` thirty days, `U` unknown. */
export const TU_STATUS = TU_MONTHS.map((_, i) => (i === 5 || i === 17 ? "U" : i === 9 ? "1" : "C"));
export const EX_STATUS = EX_MONTHS.map((_, i) => (i === 4 || i === 16 ? "U" : "C"));

export const ACCOUNTS = [
  {
    heading: "NORTHSTAR CARD", case: "agree", page: 1,
    headerOrder: [0, 1, 2], header: true,
    fields: AGREE,
    history: [
      { bureau: "TransUnion", col: 2, months: TU_MONTHS, status: TU_STATUS },
      { bureau: "Experian", col: 3, months: EX_MONTHS, status: EX_STATUS },
      { bureau: "Equifax", col: 4, noneReported: true },
    ],
  },
  {
    heading: "HARBOR AUTO", case: "one-bureau", page: 2,
    headerOrder: [0, 1, 2], header: true,
    fields: withValues({
      ...Object.fromEntries(AGREE.map(([p, , v]) => [p, ["——", v[1], "——"]])),
      "Account Number": ["——", "882300****", "——"],
    }),
    history: [],
  },
  {
    heading: "MERIDIAN LOAN", case: "spans-pages", page: 2,
    headerOrder: [0, 1, 2], header: true,
    fields: withValues({ "Account Number": ["550100****", "550100****", "550100****"] }),
    /* Rendered on page 3 in the PDF. One account, two pages, one item. */
    history: [
      { bureau: "TransUnion", col: 2, months: TU_MONTHS, status: TU_STATUS, onNextPage: true },
      { bureau: "Experian", col: 3, months: EX_MONTHS, status: EX_STATUS, onNextPage: true },
    ],
  },
  {
    heading: "ATLAS RECOVERY", case: "no-header", page: 3,
    headerOrder: [0, 1, 2], header: false,
    fields: withValues({ "Account Number": ["991000****", "991000****", "991000****"] }),
    history: [],
  },
  {
    heading: "SUMMIT BANK", case: "reversed-header", page: 3,
    /* Equifax printed over the FIRST column. A positional parser reads every
       one of this account's values under the wrong bureau. */
    headerOrder: [2, 1, 0], header: true,
    fields: withValues({ "Account Number": ["307200****", "307200****", "307200****"] }),
    history: [],
  },
];

/**
 * The summary counts, DERIVED from the accounts above rather than typed in, so
 * the fixture cannot drift out of agreement with itself. An account is counted
 * for a bureau when that bureau's column carries a value.
 *
 * ATLAS RECOVERY has no header, so its columns are attributable to nobody and
 * it counts for no bureau. That is the correct arithmetic, and it means a
 * correct parser reconciles while a position-guessing one does not.
 */
export function summaryCounts() {
  const order = ["TransUnion", "Experian", "Equifax"];
  const per = { TransUnion: 0, Experian: 0, Equifax: 0 };
  for (const account of ACCOUNTS) {
    if (!account.header) continue;
    account.headerOrder.forEach((slot, i) => {
      const value = account.fields[0][2][slot];
      if (value && !/^[—–]+$/.test(value)) per[order[i]] += 1;
    });
  }
  return per;
}

export const PERSONAL = [
  ["Name", ["JORDAN SAMPLE", "JORDAN SAMPLE", "JORDAN SAMPLE"]],
  ["Date of Birth", ["1980", "1980", "1980"]],
  ["Current Address", ["1 EXAMPLE WAY", "1 EXAMPLE WAY", "1 EXAMPLE WAY"]],
  ["Previous Address", ["——", "——", "——"]],
  ["Credit Report Date", ["09/05/2026", "09/05/2026", "09/06/2026"]],
  ["Consumer Statement", ["NONE REPORTED", "NONE REPORTED", "NONE REPORTED"]],
];

export const SCORES = ["611", "624", "608"];
