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
const accounts = () => parsed.items.filter((i) => i.kind === "Account");

describe("one tradeline is one item", () => {
  it("returns one item per account block, not one per field label", () => {
    expect(accounts()).toHaveLength(5);
  });

  it("keeps records and enquiries out of the account count", () => {
    expect(parsed.items.filter((i) => i.kind === "Public Record")).toHaveLength(1);
    expect(parsed.items.filter((i) => i.kind === "Inquiry")).toHaveLength(2);
    expect(parsed.items).toHaveLength(8);
  });

  /* The bug this whole milestone exists to prevent: an import preview of
     hundreds of rows named after field labels. */
  it("never emits a field label as an item", () => {
    const names = parsed.items.map((i) => i.name.toLowerCase());
    for (const label of ["last verified", "dispute status", "last payment", "payment frequency", "account rating", "creditor type"]) {
      expect(names).not.toContain(label);
    }
  });

  it("names each account after its creditor", () => {
    expect(accounts().map((i) => i.name)).toEqual([
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

/* The status stored is the PROVIDER'S CODE — `C`, `1`, `U` — not the glyph it
   prints beside it. The code is the provider's own vocabulary from its own
   legend, it survives a restyle, and it keeps `U` ("the bureau reported
   nothing this month", which the provider declares with a BLANK badge)
   distinguishable from a cell that carries nothing at all. */
describe("payment history carries its own dates", () => {
  it("pairs each status with the month and year the grid labels it", () => {
    const region = fixture.slice(fixture.indexOf("NORTHWIND"), fixture.indexOf("MERIDIAN"));
    expect(parseHistory(region, "2")).toEqual([
      { year: 2026, month: 3, status: "C" },
      { year: 2026, month: 2, status: "C" },
      { year: 2026, month: 1, status: "C" },
      { year: 2025, month: 12, status: "C" },
    ]);
  });

  /* A gap is an ABSENT entry, not a shifted one. January is missing from the
     fixture's second account, and February must stay February. */
  it("leaves a gap absent rather than shifting the months", () => {
    const region = fixture.slice(fixture.indexOf("MERIDIAN"), fixture.indexOf("HALCYON"));
    const history = parseHistory(region, "2");
    expect(history).toEqual([
      { year: 2026, month: 3, status: "C" },
      { year: 2026, month: 2, status: "1" },
      { year: 2025, month: 12, status: "C" },
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
    expect(parseHistory(region, "2").filter((h) => h.status === "1")).toHaveLength(1);
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
    /* Only the checks that actually COMPARED something can pass or fail. The
       summary's two-year inquiry figure is not the population the inquiry
       listing shows, so it is recorded and not compared — see the scope
       tests below. */
    const failed = checks.filter((c) => !c.ok && c.comparable !== false);
    expect(failed).toEqual([]);
    expect(deriveQuality(checks)).toBe("complete");
  });

  it("reports the passing checks too, not only the failures", () => {
    const checks = reconcile(parsed);
    expect(checks.filter((c) => c.checkKey === "accounts")).toHaveLength(3);
    expect(checks.some((c) => c.checkKey === "public_records")).toBe(true);
    /* The window is part of the key, so a two-year figure and a three-year
       one cannot collide on `report_reconciliation`'s uniqueness constraint. */
    expect(checks.some((c) => c.checkKey === "inquiries@2_years")).toBe(true);
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
    expect(out.items.filter((i) => i.kind === "Account")).toHaveLength(5);
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

/**
 * S-15 and S-16. One record is one item; one enquiry is one item. Not
 * tradelines, and not one item per field label — the failure mode that turned
 * an import preview into hundreds of rows named "Last Verified".
 */
describe("public records", () => {
  const record = () => parsed.items.find((i) => i.kind === "Public Record")!;

  it("produces ONE item for the whole section", () => {
    expect(parsed.items.filter((i) => i.kind === "Public Record")).toHaveLength(1);
    expect(record().kind).toBe("Public Record");
  });

  it("never emits a field label as an item", () => {
    const names = parsed.items.map((i) => i.name.toLowerCase());
    for (const label of ["type", "status", "court", "liability", "asset amount", "exempt amount", "reference#", "closing date"]) {
      expect(names).not.toContain(label);
    }
  });

  it("takes the bureau from the section's declared header, not a position", () => {
    expect(record().bureaus.sort()).toEqual(["EX", "TU"]);
    expect(record().bureauValues!.map((v) => v.bureau).sort()).toEqual(["EX", "TU"]);
  });

  it("maps every field the source states, verbatim", () => {
    const tu = record().bureauValues!.find((v) => v.bureau === "TU")!;
    expect(tu).toMatchObject({
      account_type: "Chapter 7 Bankruptcy",
      status: "Discharged",
      filed_on: "04/2019",
      reference_number: "19-40771",
      date_closed: "09/2019",
      court: "US BKPT CT OH FERNDALE",
      liability_cents: 4120000,
      asset_cents: 200000,
      exempt_cents: 200000,
    });
  });

  /* Two bureaus naming the same court differently is a fact worth keeping. */
  it("keeps each bureau's own wording rather than normalising it", () => {
    const ex = record().bureauValues!.find((v) => v.bureau === "EX")!;
    const tu = record().bureauValues!.find((v) => v.bureau === "TU")!;
    expect(ex.court).toBe("U.S. Bankruptcy Court");
    expect(tu.court).toBe("US BKPT CT OH FERNDALE");
  });

  /* The filing date is what § 1681c(a)(1)'s ten years runs from. It must never
     be stored where an account's opening date lives. */
  it("keeps the filing date out of open_date", () => {
    const tu = record().bureauValues!.find((v) => v.bureau === "TU")!;
    expect(tu.filed_on).toBe("04/2019");
    expect(tu.open_date).toBeUndefined();
    expect(record().openDate).toBeUndefined();
  });

  it("is not treated as a tradeline: no balance, no limit, no delinquency date", () => {
    expect(record().balanceCents).toBeNull();
    expect(record().creditLimitCents).toBeNull();
    expect(record().dofd).toBeUndefined();
  });

  /* Stored as the two strings the source printed. Nothing about what the
     discharge covered, or which tradelines it should have touched. */
  it("reads no meaning into the record beyond what the source says", () => {
    const text = JSON.stringify(record()).toLowerCase();
    for (const word of ["reaffirm", "should have", "included in", "violation", "dischargeable"]) {
      expect(text).not.toContain(word);
    }
  });

  it("preserves unattributed columns rather than guessing a bureau", () => {
    const noHeader = fixture.replace(
      /<section id="public-information">[\s\S]*?<dt class="bg-transunion col-start-2">transunion<sup>&reg;<\/sup><\/dt>\s*<dt class="bg-experian col-start-3">experian<sup>&reg;<\/sup><\/dt>\s*<dt class="bg-equifax col-start-4">equifax<sup>&reg;<\/sup><\/dt>/,
      '<section id="public-information">',
    );
    const out = parseSmartCreditHtml(noHeader);
    const pr = out.items.find((i) => i.kind === "Public Record");
    if (pr) {
      expect(pr.bureauValues).toBeUndefined();
      expect(Object.keys(pr.sourceColumns ?? {}).length).toBeGreaterThan(0);
    }
    expect(out.warnings.join(" ")).toMatch(/public records section declares no bureau header/i);
  });
});

describe("inquiries", () => {
  const inquiries = () => parsed.items.filter((i) => i.kind === "Inquiry");

  it("produces ONE item per enquiry", () => {
    expect(inquiries()).toHaveLength(2);
    expect(inquiries().map((i) => i.name)).toEqual(["CALDER MUTUAL AUTO", "NORTHWIND BANK"]);
  });

  it("never emits a field label as an item", () => {
    const names = parsed.items.map((i) => i.name.toLowerCase());
    for (const label of ["creditor name", "date of inquiry", "credit bureau"]) {
      expect(names).not.toContain(label);
    }
  });

  /* The bureau is stated per enquiry here, so attribution is direct. */
  it("takes the bureau from the enquiry's own statement", () => {
    expect(inquiries()[0].bureaus).toEqual(["TU"]);
    expect(inquiries()[1].bureaus).toEqual(["EQ"]);
  });

  it("keeps the enquiry date, on the bureau observation", () => {
    expect(inquiries()[0].bureauValues![0].inquiry_date).toBe("11/04/2025");
    expect(inquiries()[1].bureauValues![0].inquiry_date).toBe("07/22/2025");
  });

  /* THE REFUSAL. SmartCredit does not state hard/soft/promotional/review, so
     the type stays absent — which reads as UNKNOWN. Guessing it from the
     subscriber's name would put a whole healthy file's enquiries into a
     retention rule written for hard ones. */
  it("leaves the inquiry type UNKNOWN, never inferred", () => {
    for (const inquiry of inquiries()) {
      for (const v of inquiry.bureauValues ?? []) {
        expect(v.inquiry_type).toBeUndefined();
      }
    }
  });

  it("records the type as not exposed by this provider", () => {
    const fact = completenessFacts(parsed).find((f) => f.fieldKey === "inquiry_type")!;
    expect(fact.state).toBe("not_exposed_by_provider");
    expect(fact.reason).toMatch(/says nothing about whether a bureau reports it/i);
  });

  it("is not treated as a tradeline", () => {
    for (const inquiry of inquiries()) {
      expect(inquiry.balanceCents).toBeNull();
      expect(inquiry.dofd).toBeUndefined();
    }
  });

  it("skips an enquiry that names no bureau rather than guessing one", () => {
    const noBureau = fixture.replace(/<p class="fw-bold">Credit Bureau<\/p><p>TransUnion<\/p>/, "");
    expect(parseSmartCreditHtml(noBureau).items.filter((i) => i.kind === "Inquiry")).toHaveLength(1);
  });
});

describe("records and enquiries reconcile", () => {
  it("counts the public record against the source's own figure", () => {
    const checks = reconcile(parsed);
    const pr = checks.filter((c) => c.checkKey === "public_records");
    expect(pr.every((c) => c.ok)).toBe(true);
    expect(pr.find((c) => c.bureau === "TU")).toMatchObject({ stated: 1, parsed: 1 });
    expect(pr.find((c) => c.bureau === "EQ")).toMatchObject({ stated: 0, parsed: 0 });
  });

  /* THE SCOPE RULE. The summary counts two years per bureau; the listing
     covers three years across all three. Both figures are kept, and neither
     is compared to the other. */
  it("records the summary's two-year enquiry figure without comparing it to the listing", () => {
    const checks = reconcile(parsed);
    const perBureau = checks.filter((c) => c.checkKey === "inquiries@2_years");
    expect(perBureau.length).toBeGreaterThan(0);
    for (const c of perBureau) {
      expect(c.comparable).toBe(false);
      expect(c.window).toBe("2_years");
      expect(c.stated).toBeDefined();
      expect(c.reason).toMatch(/different periods/i);
    }
  });

  it("reconciles the listing against the total the listing itself states", () => {
    const checks = reconcile(parsed);
    const listing = checks.find((c) => c.checkKey === "inquiries@3_years")!;
    expect(listing).toBeDefined();
    expect(listing.bureau).toBeUndefined();      // all bureaus, so none is named
    expect(listing.window).toBe("3_years");
    expect(listing.comparable).not.toBe(false);  // like-for-like
    expect(listing).toMatchObject({ stated: 2, parsed: 2, ok: true });
  });

  it("keeps a two-year and a three-year figure under different keys", () => {
    /* `report_reconciliation` is unique on (report, bureau, check_key). One
       shared key and the two windows would overwrite each other in the
       database — the conflation, happening in storage. */
    const keys = reconcile(parsed).filter((c) => c.checkKey.startsWith("inquiries"));
    expect(new Set(keys.map((c) => c.checkKey)).size).toBeGreaterThan(1);
  });

  it("goes partial when an enquiry is not read — never 'deleted'", () => {
    const dropped = fixture.replace(/<div class="inquiry">\s*<p class="fw-bold">Creditor Name<\/p><p>CALDER MUTUAL AUTO<\/p>[\s\S]*?<\/div>/, "");
    const checks = reconcile(parseSmartCreditHtml(dropped));
    expect(deriveQuality(checks)).toBe("partial");
    /* Caught by the LISTING'S own total, which is like-for-like. The
       summary's two-year figure could never have caught it. */
    const failed = checks.find((c) => c.checkKey === "inquiries@3_years" && !c.ok)!;
    expect(failed.stated).toBeGreaterThan(failed.parsed);
    expect(failed.reason).toMatch(/unread, not absent/i);
  });

  it("goes partial when the public record is not read", () => {
    const dropped = fixture.replace('id="public-information"', 'id="pr-gone"');
    const checks = reconcile(parseSmartCreditHtml(dropped));
    /* A missing SECTION is worse than a short count. */
    expect(deriveQuality(checks)).toBe("review_required");
  });

  it("still reconciles the account counts, unaffected by the new kinds", () => {
    const accountChecks = reconcile(parsed).filter((c) => c.checkKey === "accounts");
    expect(accountChecks.every((c) => c.ok)).toBe(true);
  });
});
