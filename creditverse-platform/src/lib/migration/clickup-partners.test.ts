import { describe, expect, it } from "vitest";
import {
  billingStatusFor,
  clickupNumber,
  credentialNoteFor,
  healthFor,
  matchCandidates,
  nameSimilarity,
  normalizeName,
  partnerLifecycleFor,
  paymentChannelFor,
  proposePartnerImport,
  scrubCredentials,
  servicesFor,
  type ClickUpPartnerRow,
} from "./clickup-partners";

const row = (over: Partial<ClickUpPartnerRow> = {}): ClickUpPartnerRow => ({
  taskId: "t1",
  name: "Example Partner",
  status: "active partner creditops",
  tags: ["active", "creditops"],
  owner: "Jane Doe",
  assignedTeamIndex: 1,
  saasPlanIndex: null,
  billingStatusIndex: 0,
  moodIndex: 1,
  paymentMethodIndex: 0,
  mrrUsd: 625,
  activeClients: 536,
  startDateMs: null,
  description: null,
  ...over,
});

describe("ClickUp sends numbers as strings", () => {
  it("reads the shapes the live list actually returns", () => {
    expect(clickupNumber("625")).toBe(625);
    expect(clickupNumber("536")).toBe(536);
    expect(clickupNumber(625)).toBe(625);
    expect(clickupNumber("$1,250")).toBe(1250);
  });

  it("never turns an unrecorded amount into zero — zero is a commercial claim", () => {
    expect(clickupNumber(undefined)).toBeNull();
    expect(clickupNumber(null)).toBeNull();
    expect(clickupNumber("")).toBeNull();
    expect(clickupNumber("n/a")).toBeNull();
    expect(clickupNumber(Infinity)).toBeNull();
  });

  it("keeps a real zero, which is different from absent", () => {
    expect(clickupNumber("0")).toBe(0);
  });
});

describe("lifecycle is not service", () => {
  it("maps every ClickUp status the list defines", () => {
    expect(partnerLifecycleFor("new partner")).toBe("new");
    expect(partnerLifecycleFor("onboarding")).toBe("onboarding");
    expect(partnerLifecycleFor("active partner creditops")).toBe("active");
    expect(partnerLifecycleFor("active partner full")).toBe("active");
    expect(partnerLifecycleFor("active partner bes crm")).toBe("active");
    expect(partnerLifecycleFor("on hold")).toBe("on_hold");
    expect(partnerLifecycleFor("cancelled / archived")).toBe("archived");
  });

  it("never guesses an unknown status into active", () => {
    expect(partnerLifecycleFor("something Dee added later")).toBe("new");
  });

  it("reads the service from the status and the tags, and unions them", () => {
    expect(servicesFor("active partner creditops", ["active"])).toEqual(["creditops"]);
    expect(servicesFor("active partner bes crm", ["bes crm", "active"])).toEqual(["bes_crm"]);
    expect(servicesFor("active partner full", ["creditops", "bes crm"])).toEqual(["bes_crm", "creditops"]);
    expect(servicesFor("active partner creditops", ["talentops"])).toEqual(["creditops", "talentops"]);
  });

  it("returns NO service for `full` on its own — that is a question, not a default", () => {
    expect(servicesFor("active partner full", ["active"])).toEqual([]);
  });
});

describe("dropdowns arrive as an order index, not a label", () => {
  it("resolves each option list", () => {
    expect(healthFor(0)).toBe("happy");
    expect(healthFor(3)).toBe("at_risk");
    expect(healthFor(null)).toBeNull();
    expect(billingStatusFor(2)).toBe("overdue");
    expect(paymentChannelFor(3)).toBe("AUTHORIZE_NET");
    /* An index the option list does not have must not become a real channel. */
    expect(paymentChannelFor(9)).toBe("UNKNOWN");
    expect(paymentChannelFor(null)).toBe("UNKNOWN");
  });
});

describe("credentials are never migrated", () => {
  /* Synthetic, and shaped like the real ones. No live secret appears in this
     repository — which is the rule the file under test exists to enforce. */
  const doc = [
    "# Access list",
    "## DisputeFox",
    "Email: someone@example.test",
    "Password: NotARealSecret1!",
    "## LetterStream",
    "USERNAME: exampledisputeteam_",
    "PASSWORD: AlsoNotReal2$",
    "Security code goes to: accounts@example.test",
    "",
    "## Scope of work",
    "Full dispute fulfilment, pre-round setup, CFPB escalation.",
  ].join("\n");

  it("withholds the secret lines and keeps the operational content", () => {
    const { safeText, finding } = scrubCredentials(doc);
    expect(safeText).not.toContain("NotARealSecret1!");
    expect(safeText).not.toContain("AlsoNotReal2$");
    expect(safeText).toContain("Full dispute fulfilment");
    expect(safeText).toContain("someone@example.test");
    expect(finding.present).toBe(true);
    expect(finding.strippedLines).toBe(3);
    expect(finding.platforms).toContain("DisputeFox");
    expect(finding.platforms).toContain("LetterStream");
  });

  it("strips a blanked credential too — an empty slot invites a refill", () => {
    const { finding } = scrubCredentials("Password: N/A\nPassword: Pending for Activation");
    expect(finding.strippedLines).toBe(2);
  });

  it("keeps a heading that only names the section", () => {
    const { safeText } = scrubCredentials("## Passwords\nNothing sensitive on this line.");
    expect(safeText).toContain("## Passwords");
    expect(safeText).toContain("Nothing sensitive");
  });

  it("finds nothing in a description that has nothing", () => {
    const { safeText, finding } = scrubCredentials("Using our GHL. VIP client, wife hands-on.");
    expect(finding.present).toBe(false);
    expect(finding.platforms).toEqual([]);
    expect(safeText).toContain("VIP client");
  });

  it("treats an empty description as empty rather than as a finding", () => {
    expect(scrubCredentials(null).finding.present).toBe(false);
    expect(scrubCredentials("   ").finding.present).toBe(false);
  });

  it("writes a note that names the platform and the location, never the value", () => {
    const { finding } = scrubCredentials(doc);
    const note = credentialNoteFor(row({ taskId: "86eyp81yj" }), finding)!;
    expect(note).toContain("CREDENTIAL_MIGRATION_REQUIRED");
    expect(note).toContain("DisputeFox");
    expect(note).toContain("86eyp81yj");
    expect(note).not.toContain("NotARealSecret1!");
    expect(note).not.toContain("AlsoNotReal2$");
  });

  it("writes no note when there is nothing to migrate", () => {
    expect(credentialNoteFor(row(), scrubCredentials(null).finding)).toBeNull();
  });
});

describe("identity reconciliation", () => {
  it("normalises away company suffixes and bracketed asides", () => {
    expect(normalizeName("Wavy One Solutions, LLC")).toBe("wavy one");
    expect(normalizeName("Kenneth Winfield (upwork)")).toBe("kenneth winfield");
    expect(normalizeName("K&A Consultants")).toBe("k a");
  });

  it("scores the variants the two sources actually disagree on", () => {
    expect(nameSimilarity("Credit Cure", "CreditCure")).toBeLessThan(1);
    expect(nameSimilarity("BizHub Financial", "Bizhub")).toBeGreaterThan(0.4);
    expect(nameSimilarity("K&A Consultants", "K&A Consulting")).toBe(1);
  });

  it("finds the BES record that is named after the OWNER, not the company", () => {
    /* This is the case in the live data: ClickUp has "Wavy One Solutions",
       BES has "Quentin Grays". Company-name matching alone finds nothing. */
    const c = matchCandidates(
      row({ name: "Wavy One Solutions", owner: "Quentin Grays" }),
      [{ id: "p1", name: "Quentin Grays", primaryContact: null }],
    );
    expect(c).toHaveLength(1);
    expect(c[0].confidence).toBe(1);
    expect(c[0].evidence.join(" ")).toContain("OWNER");
  });

  it("proposes nothing when nothing resembles the row", () => {
    expect(matchCandidates(row({ name: "Brand New Partner", owner: "Nobody Known" }),
      [{ id: "p1", name: "Quentin Grays", primaryContact: null }])).toEqual([]);
  });
});

describe("the proposal", () => {
  const existing = [
    { id: "p1", name: "Quentin Grays", primaryContact: null },
    { id: "p2", name: "Kevin Hernandez", primaryContact: null },
  ];

  it("creates a partner nothing matches", () => {
    const [p] = proposePartnerImport([row({ name: "ZackCredit", owner: "Zack Nabhan" })], existing);
    expect(p.action).toBe("create");
    expect(p.match).toBeNull();
    expect(p.lifecycle).toBe("active");
    expect(p.services).toEqual(["creditops"]);
  });

  it("reconciles a confident match instead of standing a duplicate beside it", () => {
    const [p] = proposePartnerImport(
      [row({ name: "Wavy One Solutions", owner: "Quentin Grays" })], existing);
    expect(p.action).toBe("reconcile");
    expect(p.match?.partnerName).toBe("Quentin Grays");
  });

  it("converts money to cents and never invents it", () => {
    const [withMrr] = proposePartnerImport([row({ mrrUsd: 625 })], []);
    expect(withMrr.mrrCents).toBe(62_500);
    const [without] = proposePartnerImport([row({ mrrUsd: null })], []);
    expect(without.mrrCents).toBeNull();
    expect(without.warnings.join(" ")).toContain("revenue tracker is authoritative");
  });

  it("asks Dee what an `active partner full` with no service tag actually buys", () => {
    const [p] = proposePartnerImport([row({ status: "active partner full", tags: ["active"] })], []);
    expect(p.services).toEqual([]);
    expect(p.warnings.join(" ")).toContain("must say what this partner buys");
  });

  it("carries the credential flag and the note, and no secret", () => {
    const [p] = proposePartnerImport(
      [row({ description: "DisputeFox\nPassword: NotARealSecret1!" })], []);
    expect(p.credentialMigrationRequired).toBe(true);
    expect(p.credentialNote).toContain("CREDENTIAL_MIGRATION_REQUIRED");
    expect(p.safeNotes).not.toContain("NotARealSecret1!");
    expect(JSON.stringify(p)).not.toContain("NotARealSecret1!");
  });

  it("never returns the raw description on any path", () => {
    const [p] = proposePartnerImport([row({ description: "Password: NotARealSecret1!" })], []);
    expect(Object.keys(p)).not.toContain("description");
  });
});
