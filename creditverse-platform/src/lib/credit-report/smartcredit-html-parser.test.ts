/**
 * The mapper, against the synthetic fixture only.
 *
 * The fixture is built to fail a lazy parser: one account has no declared
 * bureau header (must attribute nothing), one reverses the header order (a
 * positional parser labels it backwards), one is reported by two bureaus of
 * three, and one has a gap in its payment grid.
 *
 * No real consumer report is used here, or anywhere in this repository.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveQuality } from "./completeness";
import {
  completenessFacts,
  declaredBureauColumns,
  parseHistory,
  parseLateCounts,
  parseSmartCreditHtml,
  reconcile,
} from "./smartcredit-html-parser";

const fixture = readFileSync(
  join(process.cwd(), "docs/creditops/sources/smartcredit-synthetic.fixture.html"),
  "utf8",
);
const parsed = parseSmartCreditHtml(fixture);
const byName = (n: string) => parsed.items.find((i) => i.name.includes(n))!;

describe("one tradeline is one item", () => {
  it("returns one item per account block, not one per field label", () => {
    expect(parsed.items).toHaveLength(5);
  });

  /* The bug this whole milestone exists to prevent: an import preview of
     hundreds of rows named after field labels. */
  it("never emits a field label as an item", () => {
    const names = parsed.items.map((i) => i.name.toLowerCase());
    for (const label of ["last verified", "dispute status", "last payment", "payment frequency", "account rating", "creditor type"]) {
      expect(names).not.toContain(label);
    }
  });

  it("names each item after its creditor", () => {
    expect(parsed.items.map((i) => i.name)).toEqual([
      "NORTHWIND BANK", "MERIDIAN CARD SERVICES", "HALCYON RECOVERY LLC",
      "CALDER MUTUAL AUTO", "FERNDALE CREDIT UNION",
    ]);
  });

  it("attaches history to the bureau observation, not to items of its own", () => {
    const acct = byName("NORTHWIND");
    expect(acct.bureauValues?.some((v) => (v.payment_history?.length ?? 0) > 0)).toBe(true);
    expect(parsed.items.some((i) => /history/i.test(i.name))).toBe(false);
  });
});

describe("the 22 source labels map to canonical fields", () => {
  const tu = () => byName("NORTHWIND").bureauValues!.find((v) => v.bureau === "TU")!;

  it("maps every field the account exposes", () => {
    expect(tu()).toMatchObject({
      account_number_masked: "****4417",
      account_type: "Revolving",
      status: "Open",
      payment_status: "Current",
      balance_cents: 143000,
      high_balance_cents: 210000,
      credit_limit_cents: 300000,
      past_due_cents: 0,
      monthly_payment_cents: 4500,
      open_date: "06/2018",
      date_last_payment: "02/2026",
      date_last_active: "02/2026",
      account_information_date: "03/2026",
    });
  });

  it("maps the six fields migration 0136 added", () => {
    expect(tu()).toMatchObject({
      responsibility_raw: "Individual",
      dispute_status: "Account not disputed",
      account_rating: "Paid as agreed",
      creditor_type: "Bank",
      payment_frequency: "Monthly",
      last_verified: "03/2026",
    });
  });

  /* Date Reported and Last Verified are different questions. Equifax verified
     a month earlier in the fixture, and that difference must survive. */
  it("keeps Date Reported and Last Verified apart", () => {
    const eq = byName("NORTHWIND").bureauValues!.find((v) => v.bureau === "EQ")!;
    expect(eq.account_information_date).toBe("03/2026");
    expect(eq.last_verified).toBe("02/2026");
  });

  it("leaves a blank cell absent rather than zero", () => {
    expect(tu().term_months).toBeUndefined();
    expect(tu().date_closed).toBeUndefined();
  });

  /* SmartCredit exposes no delinquency date: NOT_EXPOSED_BY_PROVIDER. */
  it("never invents a delinquency date", () => {
    for (const item of parsed.items) {
      expect(item.dofd).toBeUndefined();
      for (const v of item.bureauValues ?? []) expect(v.dofd).toBeUndefined();
    }
  });
});

describe("attribution comes from the declared header, never the column index", () => {
  it("reads the declared bureau for each column", () => {
    /* Scoped to ONE block. Slicing to end-of-file spans the reversed-header
       block too, and the duplicate-column guard then correctly refuses the
       whole thing — which is itself worth asserting, below. */
    const block = fixture.slice(fixture.indexOf("NORTHWIND"), fixture.indexOf("MERIDIAN"));
    const cols = declaredBureauColumns(block);
    expect(cols.get("2")).toBe("TU");
    expect(cols.get("3")).toBe("EX");
    expect(cols.get("4")).toBe("EQ");
  });

  it("refuses a region where two blocks claim a column for different bureaus", () => {
    /* Two accounts with opposite header orders, read as one region: column 2
       is claimed by both TU and EQ. Refuse rather than pick. */
    const spanning = fixture.slice(fixture.indexOf("NORTHWIND"));
    expect(declaredBureauColumns(spanning).size).toBe(0);
  });

  /* THE TEST A POSITIONAL PARSER FAILS. In this block equifax is col-start-2
     and transunion is col-start-4; only the declared classes resolve it. */
  it("follows a reversed header instead of the position", () => {
    const acct = byName("FERNDALE");
    const tu = acct.bureauValues!.find((v) => v.bureau === "TU")!;
    const eq = acct.bureauValues!.find((v) => v.bureau === "EQ")!;
    expect(tu.status).toBe("Paid");
    expect(eq.status).toBe("Closed");
  });

  it("attributes nothing where no header is declared, and preserves the values", () => {
    const acct = byName("CALDER");
    expect(acct.bureauValues).toBeUndefined();
    expect(acct.sourceColumns).toMatchObject({
      balance_cents: ["$4,120", "$4,120", "$3,980"],
      term_months: ["60", "60", "60"],
    });
  });

  it("warns about the unattributed block rather than passing it off as read", () => {
    expect(parsed.warnings.join(" ")).toMatch(/CALDER MUTUAL AUTO.*declares no bureau header/i);
  });

  it("records only the bureaus that actually reported an account", () => {
    expect(byName("HALCYON").bureaus.sort()).toEqual(["EX", "TU"]);
    expect(byName("HALCYON").bureauValues!.map((v) => v.bureau).sort()).toEqual(["EX", "TU"]);
  });

  it("keeps a per-bureau difference as a difference", () => {
    const acct = byName("MERIDIAN");
    const tu = acct.bureauValues!.find((v) => v.bureau === "TU")!;
    const eq = acct.bureauValues!.find((v) => v.bureau === "EQ")!;
    expect(tu.balance_cents).toBe(0);
    expect(eq.balance_cents).toBe(150000);
    expect(tu.status).toBe("Closed");
    expect(eq.status).toBe("Open");
  });

  it("refuses a block whose header claims one column for two bureaus", () => {
    const broken = `<dt class="bg-transunion col-start-2">transunion</dt><dt class="bg-equifax col-start-2">equifax</dt>`;
    expect(declaredBureauColumns(broken).size).toBe(0);
  });
});

describe("payment history carries its own dates", () => {
  it("pairs each status with the month and year the grid labels it", () => {
    const region = fixture.slice(fixture.indexOf("NORTHWIND"), fixture.indexOf("MERIDIAN"));
    expect(parseHistory(region, "2")).toEqual([
      { year: 2026, month: 3, status: "OK" },
      { year: 2026, month: 2, status: "OK" },
      { year: 2026, month: 1, status: "OK" },
      { year: 2025, month: 12, status: "OK" },
    ]);
  });

  /* A gap is an ABSENT entry, not a shifted one. January is missing from the
     fixture's second account, and February must stay February. */
  it("leaves a gap absent rather than shifting the months", () => {
    const region = fixture.slice(fixture.indexOf("MERIDIAN"), fixture.indexOf("HALCYON"));
    const history = parseHistory(region, "2");
    expect(history).toEqual([
      { year: 2026, month: 3, status: "OK" },
      { year: 2026, month: 2, status: "30" },
      { year: 2025, month: 12, status: "OK" },
    ]);
    expect(history.find((h) => h.month === 1)).toBeUndefined();
  });

  it("stores each entry with its date, never as a bare status list", () => {
    const tu = byName("NORTHWIND").bureauValues!.find((v) => v.bureau === "TU")!;
    for (const entry of tu.payment_history ?? []) {
      expect(entry).toMatch(/^\d{4}-\d{2}:/);
    }
  });
});

describe("the seven-year late counts stay separate", () => {
  it("reads the 30/60/90 tally as its own three figures", () => {
    const region = fixture.slice(fixture.indexOf("MERIDIAN"), fixture.indexOf("HALCYON"));
    expect(parseLateCounts(region, "2")).toEqual({ "30": 2, "60": 1, "90": 0 });
    expect(parseLateCounts(region, "4")).toEqual({ "30": 1, "60": 0, "90": 0 });
  });

  it("is not derived from the two-year grid", () => {
    /* The grid shows ONE 30-day mark in two years; the tally says two in
       seven. Both are true, and neither can produce the other. */
    const region = fixture.slice(fixture.indexOf("MERIDIAN"), fixture.indexOf("HALCYON"));
    expect(parseHistory(region, "2").filter((h) => h.status === "30")).toHaveLength(1);
    expect(parseLateCounts(region, "2")!["30"]).toBe(2);
  });
});

describe("reconciliation against the source's own summary", () => {
  it("reads the summary counts per bureau", () => {
    expect(parsed.summary.TU["open accounts"]).toBe("1");
    expect(parsed.summary.EQ["open accounts"]).toBe("2");
    expect(parsed.summary.TU["closed accounts"]).toBe("2");
  });

  it("agrees with the fixture on every check the source makes possible", () => {
    const checks = reconcile(parsed);
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(deriveQuality(checks)).toBe("complete");
  });

  it("reports the passing checks too, not only the failures", () => {
    const checks = reconcile(parsed);
    expect(checks.filter((c) => c.checkKey === "accounts")).toHaveLength(3);
    expect(checks.some((c) => c.checkKey === "public_records")).toBe(true);
    expect(checks.some((c) => c.checkKey === "inquiries")).toBe(true);
    expect(checks.some((c) => c.checkKey === "scores")).toBe(true);
    expect(checks.some((c) => c.checkKey.startsWith("section:"))).toBe(true);
  });

  /* Format drift: a parser silently returning fewer accounts is the dangerous
     failure, because a missing tradeline looks like an account the consumer
     does not have. */
  it("goes PARTIAL when an account goes missing, and names the shortfall", () => {
    const dropped = fixture.replace(/<div class="account" data-fixture-case="differ"[\s\S]*?<!-- ─── ACCOUNT 3/, "<!-- ─── ACCOUNT 3");
    const checks = reconcile(parseSmartCreditHtml(dropped));
    expect(deriveQuality(checks)).toBe("partial");
    const short = checks.find((c) => c.checkKey === "accounts" && !c.ok)!;
    expect(short.stated).toBeGreaterThan(short.parsed);
  });

  /* A missing SECTION is worse than a short count: the comparison could not
     be made at all. */
  it("goes REVIEW REQUIRED when a required section is missing", () => {
    const noSummary = fixture.replace('id="summary"', 'id="gone"');
    const checks = reconcile(parseSmartCreditHtml(noSummary));
    expect(deriveQuality(checks)).toBe("review_required");
  });
});

describe("the document is treated as inert data", () => {
  it("reads a document containing a script without running or reporting it", () => {
    const hostile = fixture.replace("<section id=\"summary\">",
      "<script>window.__pwned = true;</script><section id=\"summary\">");
    const out = parseSmartCreditHtml(hostile);
    expect(out.items).toHaveLength(5);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/__pwned/);
  });

  it("returns a warning rather than throwing on a document it cannot read", () => {
    const out = parseSmartCreditHtml("<html><body><p>Not a credit report.</p></body></html>");
    expect(out.items).toEqual([]);
    expect(out.warnings.join(" ")).toMatch(/no account blocks/i);
  });
});


describe("what the format does not expose", () => {
  const facts = completenessFacts(parsed);
  const fact = (k: string) => facts.find((f) => f.fieldKey === k);

  /* The correction that matters most: SmartCredit exposing no DOFD is a fact
     about SmartCredit. It is never evidence that a bureau omitted the field. */
  it("records DOFD as not exposed by the provider, never as a bureau omission", () => {
    const dofd = fact("dofd")!;
    expect(dofd.state).toBe("not_exposed_by_provider");
    expect(dofd.bureau).toBeUndefined();
    expect(dofd.reason).toMatch(/says nothing about whether a bureau reports it/i);
  });

  it("records the score model, inquiry type and type detail the same way", () => {
    for (const k of ["score_model", "inquiry_type", "account_type_detail"]) {
      expect(fact(k)!.state).toBe("not_exposed_by_provider");
    }
  });

  it("records unattributed columns as ambiguous, not as blank or failed", () => {
    const amb = facts.filter((f) => f.state === "ambiguous");
    expect(amb.length).toBeGreaterThan(0);
    for (const f of amb) expect(f.reason).toMatch(/did not say which bureau/i);
  });

  it("gives every non-present fact a reason a reviewer can act on", () => {
    for (const f of facts) {
      expect(f.state).not.toBe("present");
      expect(f.reason && f.reason.length > 10).toBe(true);
    }
  });

  it("records a bureau the document never names as not present, not as blank", () => {
    const oneBureau = parseSmartCreditHtml(fixture.replace(/bg-equifax/g, "bg-experian"));
    const eq = completenessFacts(oneBureau).find((f) => f.bureau === "EQ" && f.fieldKey === "tradelines");
    expect(eq?.state).toBe("bureau_not_present");
  });
});
