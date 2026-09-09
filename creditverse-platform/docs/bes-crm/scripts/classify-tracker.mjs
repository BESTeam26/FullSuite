/**
 * Place every row of the master build tracker into a Build Engine.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN LIST ───────────────────────
 *
 * The workbook has 140 rows across 55 (phase, section) groups. Classifying it
 * row by row would be 140 judgements nobody could re-check; classifying by
 * SECTION is 55, and the workbook's own sections are already the unit its
 * author thought in. So the rule is the section, with named exceptions where a
 * section genuinely spans two engines — "Pipelines" builds a sales pipeline
 * AND a fulfilment one, and pretending otherwise would put credit-repair
 * lifecycle work into a partner's project who only bought a website.
 *
 * Every exception is listed by its exact title, so an unmatched exception is
 * an error rather than a silent miss. Re-running against an edited workbook
 * reports what it could not place instead of guessing.
 *
 *   node docs/bes-crm/scripts/classify-tracker.mjs           # report
 *   node docs/bes-crm/scripts/classify-tracker.mjs --sql     # emit the insert
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SHEETS = "docs/bes-crm/sheets";

/* ── The rule: one engine and one kind per (phase, section) ──────────────── */
const SECTION = {
  /* Phase 0 — nothing is built yet; this is what must arrive first. */
  "Phase 0|Access":               ["project_setup", "client_requirement"],
  "Phase 0|Brand Assets":         ["project_setup", "client_requirement"],
  "Phase 0|Client Inputs":        ["project_setup", "client_requirement"],
  "Phase 0|Compliance Direction": ["project_setup", "client_requirement"],
  "Phase 0|Offer Strategy":       ["project_setup", "client_requirement"],
  "Phase 0|Internal Setup":       ["project_setup", "work_unit"],
  "Phase 0|Strategy Lock":        ["project_setup", "work_unit"],

  /* Phase 1 — the foundation everything later stands on. */
  "Phase 1|Core Infrastructure":   ["project_setup", "work_unit"],
  "Phase 1|Domain & SSL":          ["website_funnel", "work_unit"],
  "Phase 1|Website Build":         ["website_funnel", "work_unit"],
  "Phase 1|Funnel Build":          ["website_funnel", "work_unit"],
  "Phase 1|Forms & Intake":        ["website_funnel", "work_unit"],
  "Phase 1|Email Foundation":      ["communication", "work_unit"],
  "Phase 1|Phone & SMS Readiness": ["communication", "work_unit"],
  "Phase 1|Calendar Setup":        ["sales", "work_unit"],
  "Phase 1|Lead Automation":       ["sales", "work_unit"],
  "Phase 1|Pipelines":             ["sales", "work_unit"],

  /* Phase 2 — the automations that make the pipelines run. */
  "Phase 2|Intake & Routing":       ["sales", "work_unit"],
  "Phase 2|Credit Repair Sales":    ["sales", "work_unit"],
  "Phase 2|Clarity/Education":      ["sales", "work_unit"],
  "Phase 2|Funding":                ["sales", "work_unit"],
  "Phase 2|Credit Repair Active":   ["fulfillment", "work_unit"],
  "Phase 2|Compliance":             ["fulfillment", "work_unit"],
  "Phase 2|Chat & Conversations":   ["communication", "work_unit"],
  "Phase 2|Phone/SMS":              ["communication", "work_unit"],
  "Phase 2|Payments":               ["billing", "work_unit"],
  "Phase 2|Internal Ops":           ["project_setup", "work_unit"],
  "Phase 2|Workflow Documentation": ["project_setup", "work_unit"],

  /* Phase 3 — everything that reaches outside GHL. */
  "Phase 3|Integrations":        ["integration", "work_unit"],
  "Phase 3|ManyChat":            ["integration", "work_unit"],
  "Phase 3|AI":                  ["marketing_ai", "work_unit"],
  "Phase 3|Marketing Campaigns": ["marketing_ai", "work_unit"],
  "Phase 3|Reputation":          ["marketing_ai", "work_unit"],
  "Phase 3|Social Channels":     ["marketing_ai", "work_unit"],
  "Phase 3|Reporting":           ["reporting", "work_unit"],
  "Phase 3|Tracking":            ["reporting", "work_unit"],

  /* Phase 4 — after it works, before it is handed over. */
  "Phase 4|Client Experience":  ["support_optimization", "work_unit"],
  "Phase 4|Optimization":       ["support_optimization", "work_unit"],
  "Phase 4|SOP/Handoff":        ["support_optimization", "work_unit"],
  "Phase 4|Support System":     ["support_optimization", "work_unit"],
  "Phase 4|Digital Products":   ["portal_membership", "work_unit"],
  "Phase 4|Membership/Portal":  ["portal_membership", "work_unit"],
  "Phase 4|Training Prep":      ["onboarding_support", "work_unit"],

  /* Phase 5 — proving it, then handing it over. */
  "Phase 5|Cleanup":           ["qa_launch", "work_unit"],
  "Phase 5|Delivery":          ["qa_launch", "work_unit"],
  "Phase 5|Go-Live":           ["qa_launch", "work_unit"],
  "Phase 5|Communication QA":  ["qa_launch", "qa"],
  "Phase 5|Compliance QA":     ["qa_launch", "qa"],
  "Phase 5|Form QA":           ["qa_launch", "qa"],
  "Phase 5|Integration QA":    ["qa_launch", "qa"],
  "Phase 5|Permission QA":     ["qa_launch", "qa"],
  "Phase 5|Pipeline QA":       ["qa_launch", "qa"],
  "Phase 5|Website QA":        ["qa_launch", "qa"],
  "Phase 5|Workflow QA":       ["qa_launch", "qa"],
  "Phase 5|Training":          ["onboarding_support", "work_unit"],
};

/**
 * Rows whose section is the wrong answer for them.
 *
 * Keyed by the exact task title. Each one is a case where following the
 * section would put work into a project that did not buy it, or would file a
 * test as build work.
 */
const EXCEPTIONS = {
  // A pipeline for the credit-repair LIFECYCLE is fulfilment, not sales.
  "Create Credit Repair Active Lifecycle pipeline": ["fulfillment", "work_unit"],
  // Support and risk belongs to the engine that runs after go-live.
  "Create Support/Risk pipeline": ["onboarding_support", "work_unit"],
  // Testing that roles are right is QA, wherever it sits in the workbook.
  "Test user permissions by role": ["qa_launch", "qa"],
  "Test AI compliance guardrails": ["qa_launch", "qa"],
  // Taking payment is the billing engine, not the sales conversation.
  "Build manual billing authorization trigger": ["billing", "work_unit"],
  // Chasing documents and submitting to lenders is the work, not the sale.
  "Build document request automation": ["fulfillment", "work_unit"],
  "Build lender submission/status workflows": ["fulfillment", "work_unit"],
};

/**
 * Scope the partner may not have bought.
 *
 * The workbook says so in words — "if included", "if applicable", "if
 * scheduled" — so the rule reads the words rather than repeating a list that
 * would fall out of step with them (§11: an optional item is never
 * instantiated unless selected).
 */
const OPTIONAL = /\b(if included|if applicable|if scheduled|where required)\b/i;

/* ── Reading the workbook ────────────────────────────────────────────────── */
const parseCsv = (text) => {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const requirements = [];
for (const file of readdirSync(SHEETS).filter((f) => f.startsWith("phase-")).sort()) {
  const rows = parseCsv(readFileSync(join(SHEETS, file), "utf8"));
  /* Row 0 is a banner; row 1 is the header. */
  const header = rows[1];
  const col = (name) => header.indexOf(name);
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const title = (r[col("Task")] ?? "").trim();
    if (!title) continue;
    requirements.push({
      ref: `${file}:${i + 1}`,
      phase: (r[col("Phase")] ?? "").trim(),
      section: (r[col("Section")] ?? "").trim(),
      title,
      detail: (r[col("Details / Acceptance Criteria")] ?? "").trim(),
      priority: (r[col("Priority")] ?? "").trim(),
    });
  }
}

/* ── Classifying ─────────────────────────────────────────────────────────── */
const unmatchedExceptions = new Set(Object.keys(EXCEPTIONS));
const unplaced = [];
for (const r of requirements) {
  const exception = EXCEPTIONS[r.title];
  if (exception) unmatchedExceptions.delete(r.title);
  const rule = exception ?? SECTION[`${r.phase}|${r.section}`];
  if (!rule) { unplaced.push(r); continue; }
  [r.engine, r.kind] = rule;
  r.optional = OPTIONAL.test(r.title) || OPTIONAL.test(r.detail);
}

const sql = process.argv.includes("--sql");
if (!sql) {
  const byEngine = {};
  for (const r of requirements) {
    if (!r.engine) continue;
    byEngine[r.engine] ??= { total: 0, kinds: {}, optional: 0 };
    byEngine[r.engine].total++;
    byEngine[r.engine].kinds[r.kind] = (byEngine[r.engine].kinds[r.kind] ?? 0) + 1;
    if (r.optional) byEngine[r.engine].optional++;
  }
  console.log(`${requirements.length} requirements read\n`);
  for (const [engine, s] of Object.entries(byEngine).sort((a, b) => b[1].total - a[1].total)) {
    const kinds = Object.entries(s.kinds).map(([k, n]) => `${n} ${k}`).join(", ");
    console.log(`  ${engine.padEnd(22)} ${String(s.total).padStart(3)}   ${kinds}${s.optional ? `   (${s.optional} optional)` : ""}`);
  }
  console.log(`\n  ${"TOTAL".padEnd(22)} ${String(requirements.filter((r) => r.engine).length).padStart(3)} placed, ${unplaced.length} unplaced`);
  if (unplaced.length) {
    console.log("\nUNPLACED — add a section rule for each:");
    for (const r of unplaced) console.log(`  ${r.phase} | ${r.section} | ${r.title}`);
  }
  if (unmatchedExceptions.size) {
    console.log("\nEXCEPTIONS THAT MATCHED NOTHING (a title changed?):");
    for (const t of unmatchedExceptions) console.log(`  ${t}`);
  }
  process.exit(unplaced.length || unmatchedExceptions.size ? 1 : 0);
}

if (unplaced.length || unmatchedExceptions.size) {
  console.error("Refusing to emit SQL: the classification is incomplete. Run without --sql.");
  process.exit(1);
}

const q = (v) => (v ? `'${String(v).replace(/'/g, "''")}'` : "null");
console.log(`  (${requirements
  .map((r) => `${q(r.ref)}, ${q(`${r.phase} · ${r.section}`)}, ${q(r.title)}, ${q(r.detail)}, ${q(r.engine)}, ${q(r.kind)}, ${r.optional}`)
  .join("),\n  (")})`);
