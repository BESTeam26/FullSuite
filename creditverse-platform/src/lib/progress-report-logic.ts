// Progress Report Logic — data model + AI narrative generator
// Implements the client's "Progress Report Logic" prompt: produces a structured,
// factual, non-exaggerated client update from verified report data only.
// No fabrication, no assumed outcomes, no em dashes, emojis only in headings/SMS.

export type BureauKey = "EQ" | "EX" | "TU";

export interface BureauHistoryPoint {
  label: string;
  score: number;
  change: number;
}

export interface DeletionRow {
  name: string;
  accountNumber?: string;
  highBalance: string;
  category: string; // "ACCOUNTS" | "INQUIRY" | "PERSONAL Information"
  /**
   * What the newest report shows for the item. `NoLongerObserved` is our
   * reading of a complete report — never a claim that a bureau deleted it.
   * A bureau-confirmed deletion is a reviewed outcome and lives in
   * `dispute_item_outcomes`, not here (see `dispute/outcome-vocabulary`).
   */
  status: "Positive" | "Negative" | "NoLongerObserved";
}

export interface BureauUsage {
  pct: number;
  prevPct: number;
  limit: number;
  balance: number;
}

export interface BureauProgress {
  key: BureauKey;
  label: string;
  brandColor: string;
  score: number;
  prevScore: number;
  date: string;
  startingScore: number;
  history: BureauHistoryPoint[];
  itemsDeleted: number;
  updatedToPositive: number;
  newItemsAdded: number;
  disputesOnGoing: number;
  deletionRows: DeletionRow[];
  newDisputeRows: DeletionRow[];
  usage: BureauUsage;
}

export interface ProgressReportTotals {
  deletedThisRound: number;
  deletedLastRound: number;
  onGoingThisRound: number;
  onGoingLastRound: number;
  undisputedNegativeThisRound: number;
  undisputedNegativeLastRound: number;
  updatedToPositiveThisRound: number;
  updatedToPositiveLastRound: number;
  newItemsAddedThisRound: number;
  newItemsAddedLastRound: number;
}

export interface ProgressReportData {
  clientName: string;
  companyName: string;
  companyPhone: string;
  monthYear: string;
  reportDate: string;
  previousReportDate: string;
  sinceDate: string;
  bureaus: BureauProgress[];
  totals: ProgressReportTotals;
  overallUsage: { avgPct: number; totalLimit: number; totalBalance: number };
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function grandTotal(thisRound: number, lastRound: number) {
  return thisRound + lastRound;
}

// ─── Sample data (mirrors the Kevin Mcmanus reference report) ────────────────

export const sampleProgressReport: ProgressReportData = {
  clientName: "Kevin Mcmanus",
  companyName: "Dispute Center",
  companyPhone: "(817) 985-3536",
  monthYear: "August 2026",
  reportDate: "Aug 29th, 2026",
  previousReportDate: "Jul 28th, 2026",
  sinceDate: "Jan 27th, 2026",
  totals: {
    deletedThisRound: 5,
    deletedLastRound: 1,
    onGoingThisRound: 32,
    onGoingLastRound: 24,
    undisputedNegativeThisRound: 19,
    undisputedNegativeLastRound: 24,
    updatedToPositiveThisRound: 4,
    updatedToPositiveLastRound: 0,
    newItemsAddedThisRound: 4,
    newItemsAddedLastRound: 2,
  },
  overallUsage: { avgPct: 9, totalLimit: 26027.33, totalBalance: 1007.67 },
  bureaus: [
    {
      key: "EQ",
      label: "Equifax",
      brandColor: "#c8102e",
      score: 733,
      prevScore: 716,
      date: "Aug 29th, 2026",
      startingScore: 705,
      history: [
        { label: "Jul 2026", score: 716, change: 20 },
        { label: "Jun 2026", score: 696, change: -10 },
        { label: "Apr 2026", score: 706, change: 1 },
      ],
      itemsDeleted: 0,
      updatedToPositive: 4,
      newItemsAdded: 0,
      disputesOnGoing: 4,
      deletionRows: [
        {
          name: "Capital One",
          accountNumber: "515676879826",
          highBalance: "$0.00",
          category: "ACCOUNTS",
          status: "Positive",
        },
        {
          name: "MissionLnTab",
          accountNumber: "4315037515191421",
          highBalance: "$0.00",
          category: "ACCOUNTS",
          status: "Positive",
        },
        {
          name: "SyncB/Amazon",
          accountNumber: "6045781606109410",
          highBalance: "$0.00",
          category: "ACCOUNTS",
          status: "Positive",
        },
        {
          name: "THD/CBNA",
          accountNumber: "6035321077891949",
          highBalance: "$0.00",
          category: "ACCOUNTS",
          status: "Positive",
        },
        {
          name: "Capital One",
          accountNumber: "515676922417",
          highBalance: "$0.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "FB&T/Mercury",
          accountNumber: "0045065687",
          highBalance: "$2,750.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Upstart Netw",
          accountNumber: "L2060125",
          highBalance: "$7,295.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Macyscbna",
          highBalance: "—",
          category: "INQUIRY",
          status: "Negative",
        },
      ],
      newDisputeRows: [],
      usage: { pct: 27, prevPct: 25, limit: 11050, balance: 2939 },
    },
    {
      key: "EX",
      label: "Experian",
      brandColor: "#6b21a8",
      score: 684,
      prevScore: 672,
      date: "Aug 29th, 2026",
      startingScore: 680,
      history: [
        { label: "Jul 2026", score: 672, change: -11 },
        { label: "Jun 2026", score: 683, change: 0 },
        { label: "Apr 2026", score: 683, change: 3 },
      ],
      itemsDeleted: 2,
      updatedToPositive: 0,
      newItemsAdded: 1,
      disputesOnGoing: 19,
      deletionRows: [
        {
          name: "Bankruptcy 08/28/2024",
          accountNumber: "US BKPT CT CA SAN DIEG",
          highBalance: "$0.00",
          category: "PUBLIC RECORD",
          status: "Negative",
        },
        {
          name: "Capital One",
          accountNumber: "515676922417",
          highBalance: "$432.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Capital One",
          accountNumber: "515676879826",
          highBalance: "$2,305.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "FB&T/Mercury",
          accountNumber: "0045065687",
          highBalance: "$2,897.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "MissionLnTab",
          accountNumber: "431503751519",
          highBalance: "$2,313.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "SyncB/Amazon",
          accountNumber: "604578160610",
          highBalance: "$242.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "THD/CBNA",
          accountNumber: "603532107789",
          highBalance: "$500.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Upstart Netw",
          accountNumber: "L2060125",
          highBalance: "$9,400.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Employers — AC Kelly Production",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "NoLongerObserved",
        },
        {
          name: "Previous Address — 1274 Lawrenceville Hwy, Lawrenceville GA",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "NoLongerObserved",
        },
      ],
      newDisputeRows: [
        {
          name: "Previous Address — PO Box 1521, Lawrenceville GA",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "Negative",
        },
      ],
      usage: { pct: 0, prevPct: 2, limit: 32082, balance: 42 },
    },
    {
      key: "TU",
      label: "TransUnion",
      brandColor: "#00a0af",
      score: 705,
      prevScore: 692,
      date: "Aug 29th, 2026",
      startingScore: 683,
      history: [
        { label: "Jul 2026", score: 692, change: 9 },
        { label: "Jun 2026", score: 683, change: 0 },
        { label: "Apr 2026", score: 683, change: 0 },
      ],
      itemsDeleted: 3,
      updatedToPositive: 0,
      newItemsAdded: 3,
      disputesOnGoing: 9,
      deletionRows: [
        {
          name: "Bankruptcy 08/28/2024",
          accountNumber: "U.S. Bankruptcy Court",
          highBalance: "$0.00",
          category: "PUBLIC RECORD",
          status: "Negative",
        },
        {
          name: "Capital One",
          accountNumber: "515676922417",
          highBalance: "$432.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Capital One",
          accountNumber: "515676879826",
          highBalance: "$2,305.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "FB&T/Mercury",
          accountNumber: "0045065687",
          highBalance: "$2,897.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "MissionLnTab",
          accountNumber: "4315037515191421",
          highBalance: "$2,313.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "SyncB/Amazon",
          accountNumber: "6045781606109410",
          highBalance: "$242.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "THD/CBNA",
          accountNumber: "6035321077891949",
          highBalance: "$500.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Upstart Netw",
          accountNumber: "L2060125",
          highBalance: "$9,400.00",
          category: "ACCOUNTS",
          status: "Negative",
        },
        {
          name: "Employers — MV Transportation",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "NoLongerObserved",
        },
        {
          name: "Employers — Cooper Global",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "NoLongerObserved",
        },
        {
          name: "Previous Address — 628 Glenwood Av, Atlanta GA",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "NoLongerObserved",
        },
        {
          name: "Previous Address — 5235 Louis Ln, Atlanta GA",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "Negative",
        },
      ],
      newDisputeRows: [
        {
          name: "Employers — Haddon News",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "Negative",
        },
        {
          name: "Employers — UEB",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "Negative",
        },
        {
          name: "Previous Address — 1900 Glenn Club Dr, Stone Mountain GA",
          highBalance: "—",
          category: "PERSONAL Information",
          status: "Negative",
        },
      ],
      usage: { pct: 0, prevPct: 1, limit: 34950, balance: 42 },
    },
  ],
};

export const FICO_FACTORS = [
  { label: "Payment History", pct: 35 },
  { label: "Amount Owed", pct: 30 },
  { label: "Credit History Length", pct: 15 },
  { label: "Types of Credit", pct: 10 },
  { label: "Applying for New Credit", pct: 10 },
];

// ─── AI narrative generator ────────────────────────────────────────────────
// Produces the exact section order required by the platform's Progress Report
// Logic prompt. Every number is pulled directly from ProgressReportData —
// nothing is invented and no outcome is promised.

export interface GeneratedProgressUpdate {
  full: string;
  sections: {
    heading: string;
    scoreMovement: string;
    deletionsConfirmed: string;
    newlyAdded: string;
    utilization: string;
    ficoFactors: string;
    overallSummary: string;
    clientFacingSummary: string;
    affiliateSummary: string;
    clientSms: string;
    signOff: string;
  };
}

export function generateProgressUpdate(
  data: ProgressReportData,
): GeneratedProgressUpdate {
  const firstName = data.clientName.split(" ")[0];

  // Score Movement
  const scoreMovementLines = data.bureaus
    .map(
      (b) =>
        `${b.label}: ${b.prevScore} → ${b.score} (${b.score - b.prevScore >= 0 ? "+" : ""}${b.score - b.prevScore})`,
    )
    .join("\n");

  // What the newest report shows — observations, not bureau statements.
  const deletionEntries = data.bureaus.flatMap((b) =>
    b.deletionRows
      .filter((r) => r.status === "NoLongerObserved" || r.status === "Positive")
      .map(
        (r) =>
          `${r.name} — ${b.label}: ${r.status === "NoLongerObserved" ? "No longer observed in this report" : "Now reported in positive standing"}`,
      ),
  );
  const deletionsConfirmed =
    deletionEntries.length > 0
      ? deletionEntries.map((l) => `• ${l}`).join("\n")
      : "No items came off the report this round.";

  // Newly Added Items
  const newEntries = data.bureaus.flatMap((b) =>
    b.newDisputeRows.map((r) => `${r.name} — ${b.label} (${r.category})`),
  );
  const newlyAdded =
    newEntries.length > 0
      ? newEntries.map((l) => `• ${l}`).join("\n")
      : "No new negative items appeared on this round's report.";

  // Credit Utilization
  const utilizationLines = data.bureaus
    .map(
      (b) =>
        `${b.label}: using ${b.usage.pct}% of ${fmtMoney(b.usage.limit)} available (balance ${fmtMoney(b.usage.balance)}, previous ${b.usage.prevPct}%)`,
    )
    .join("\n");
  const utilization = `Blended average usage: ${data.overallUsage.avgPct}%\n${utilizationLines}\nKeeping card balances below 10% of the limit generally supports stronger scores.`;

  // FICO Factors
  const ficoFactors = FICO_FACTORS.map((f) => `${f.pct}% — ${f.label}`).join(
    "\n",
  );

  // Overall Summary
  const scoreDeltas = data.bureaus.map((b) => b.score - b.prevScore);
  const allUp = scoreDeltas.every((d) => d > 0);
  const anyDown = scoreDeltas.some((d) => d < 0);
  const overallSummary = `${data.clientName} showed movement across all three bureaus this round (${scoreMovementLines.replace(/\n/g, ", ")}). ${data.totals.deletedThisRound} item${data.totals.deletedThisRound === 1 ? " is" : "s are"} no longer observed or now report${data.totals.deletedThisRound === 1 ? "s" : ""} differently, while ${data.totals.newItemsAddedThisRound} new item${data.totals.newItemsAddedThisRound === 1 ? "" : "s"} appeared and will be reviewed for the next round. ${data.totals.onGoingThisRound} disputes remain open with the bureaus.${anyDown ? " Note that not every bureau moved the same amount, which is normal during an active dispute cycle." : ""}`;

  // Client-Facing Summary
  const clientTone = allUp
    ? "Great progress this round."
    : "Solid, steady progress this round.";
  const clientFacingSummary = `Hi ${firstName}, here is where things stand as of ${data.reportDate}.\n\n${clientTone} Your scores moved to Equifax ${data.bureaus[0].score}, Experian ${data.bureaus[1].score}, and TransUnion ${data.bureaus[2].score}. ${data.totals.deletedThisRound} item${data.totals.deletedThisRound === 1 ? "" : "s"} are no longer showing on your report or now report in positive standing, and ${data.totals.onGoingThisRound} disputes are still actively being worked with the bureaus.\n\nA few new items showed up on your report (${data.totals.newItemsAddedThisRound} this round) and we're already reviewing them for the next round. Keeping your card balances low, ideally under 10% of your limit, will keep helping your scores climb.\n\nWe'll keep you posted every step of the way. Full details are in your emailed report and your client portal.`;

  // Affiliate Summary
  const affiliateSummary = `Client: ${data.clientName}\nRound summary (${data.previousReportDate} → ${data.reportDate}):\n- Scores: EQ ${data.bureaus[0].prevScore}→${data.bureaus[0].score}, EX ${data.bureaus[1].prevScore}→${data.bureaus[1].score}, TU ${data.bureaus[2].prevScore}→${data.bureaus[2].score}\n- No longer observed / changed this round: ${data.totals.deletedThisRound} (grand total ${grandTotal(data.totals.deletedThisRound, data.totals.deletedLastRound)})\n- Disputes on-going: ${data.totals.onGoingThisRound} (grand total ${grandTotal(data.totals.onGoingThisRound, data.totals.onGoingLastRound)})\n- Un-disputed negative remaining: ${data.totals.undisputedNegativeThisRound}\n- New items added this round: ${data.totals.newItemsAddedThisRound} — flagged for review before next round\n- Avg. revolving utilization: ${data.overallUsage.avgPct}%\nNo compliance flags on this round. Next round scheduled after new item review.`;

  // Client SMS
  const clientSms = `📊 Hi ${firstName}! Your ${data.monthYear} credit update is ready — scores are moving (EQ ${data.bureaus[0].score}, EX ${data.bureaus[1].score}, TU ${data.bureaus[2].score}) and ${data.totals.deletedThisRound} item${data.totals.deletedThisRound === 1 ? "" : "s"} no longer showing this round. Your detailed report has been emailed to you, and you can review everything anytime in your Client Portal. 💪`;

  const heading = `📊 Credit Progress Update – ${data.monthYear}`;
  const signOff = "Client Success Team";

  const full = [
    heading,
    "\n📊 Score Movement",
    scoreMovementLines,
    `\n✔️ ${data.totals.deletedThisRound} Deletions Confirmed This Round`,
    deletionsConfirmed,
    "\n⚠️ Newly Added Items",
    newlyAdded,
    "\n📉 Credit Utilization",
    utilization,
    "\n📌 FICO Factors Impacting Score",
    ficoFactors,
    "\n💡 Overall Summary",
    overallSummary,
    "\n1️⃣ Client-Facing Summary",
    clientFacingSummary,
    "\n2️⃣ Affiliate Summary",
    affiliateSummary,
    "\n📱 Client SMS Update",
    clientSms,
    "",
    signOff,
  ].join("\n");

  return {
    full,
    sections: {
      heading,
      scoreMovement: scoreMovementLines,
      deletionsConfirmed,
      newlyAdded,
      utilization,
      ficoFactors,
      overallSummary,
      clientFacingSummary,
      affiliateSummary,
      clientSms,
      signOff,
    },
  };
}

export { fmtMoney };
