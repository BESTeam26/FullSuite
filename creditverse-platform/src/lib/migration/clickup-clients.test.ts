/**
 * The ClickUp card parser, against the real pilot cards.
 *
 * Every case below is a card that exists in list 901821115879 — the shapes BES
 * actually typed, not shapes I imagined. The values are altered where they are
 * secret: the SSNs and passwords here are fabricated, because a test file is
 * committed and a real one would be a leak. The STRUCTURE is verbatim, which
 * is what the parser gets wrong if anything does.
 */
import { describe, expect, it } from "vitest";
import {
  isAttachmentReceipt,
  isAutomationNoise,
  mergeCards,
  normaliseState,
  parseClientCard,
  parseSsn,
  parseUsDate,
  scrubSecrets,
} from "../../../supabase/functions/_shared/clickup-clients";

describe("the small readers refuse what they cannot read", () => {
  it("reads US dates, including two-digit years", () => {
    expect(parseUsDate("2/06/2001")).toBe("2001-02-06");
    expect(parseUsDate("06/09/1966")).toBe("1966-06-09");
    expect(parseUsDate("9/8/26")).toBe("2026-09-08");
  });

  it("returns null rather than a plausible wrong date", () => {
    /* 31 February would roll into March if it were built with a Date and not
       checked — a birth date that is off by a day is worse than a missing one. */
    expect(parseUsDate("02/31/2001")).toBeNull();
    expect(parseUsDate("13/01/2001")).toBeNull();
    expect(parseUsDate("not a date")).toBeNull();
    expect(parseUsDate(null)).toBeNull();
  });

  it("takes an SSN however it was punctuated, and only if it is nine digits", () => {
    expect(parseSsn("766-01-8351")).toBe("766018351");
    expect(parseSsn("766018351")).toBe("766018351");
    expect(parseSsn("7660183")).toBeNull();
    expect(parseSsn("766-01-83512")).toBeNull();
  });

  it("expands state names and leaves codes alone", () => {
    expect(normaliseState("Florida")).toBe("FL");
    expect(normaliseState("FL")).toBe("FL");
    expect(normaliseState("fl")).toBe("FL");
    expect(normaliseState("Puerto Rico")).toBe("Puerto Rico");
  });
});

describe("comments that are not notes", () => {
  it("knows an upload receipt from a note", () => {
    expect(isAttachmentReceipt("DL.jpg\nPOA.jpg\nSSN.jpg\n")).toBe(true);
    expect(isAttachmentReceipt("image.png\n")).toBe(true);
    /* A filename WITH a note beside it is a note. */
    expect(isAttachmentReceipt("image.png\n206795472 - INQ\n")).toBe(false);
    expect(isAttachmentReceipt("List of Open Account\nCapital One Bank USA")).toBe(false);
  });

  it("knows ClickUp's own automation", () => {
    const nag = "@assignees This client has been in the Processing Stage for 5 days, and must be completed today.";
    expect(isAutomationNoise(-1, nag)).toBe(true);
    expect(isAutomationNoise(43672682, nag)).toBe(true);
    expect(isAutomationNoise(43672682, "CREATED CFPB LOGINS 9/8/26")).toBe(false);
  });
});

describe("a description card", () => {
  const card = [
    "Bryan Rodriguez - R2",
    "8004 SW 149TH AVE APT C418",
    "MIAMI, FL 33193-1481",
    "DOB: 2/06/2001",
    "SSN:111223333",
    "",
    "Cell:(305) 877-5705",
    "Email:Bryanro002@icloud.com",
    "",
    "Equifax Data Breach: NO",
    "NPD Data Breach: NO",
  ].join("\n");
  const p = parseClientCard(card, "description");

  it("takes the name and drops the round marker from it", () => {
    expect(p.fullName).toBe("Bryan Rodriguez");
    expect(p.firstName).toBe("Bryan");
    expect(p.lastName).toBe("Rodriguez");
  });

  it("reads the identity fields", () => {
    expect(p.dateOfBirth).toBe("2001-02-06");
    expect(p.ssn).toBe("111223333");
    expect(p.phone).toBe("(305) 877-5705");
    expect(p.email).toBe("Bryanro002@icloud.com");
  });

  it("splits the address into structure", () => {
    expect(p.address).toEqual({
      line1: "8004 SW 149TH AVE APT C418",
      city: "MIAMI",
      state: "FL",
      postalCode: "33193-1481",
    });
  });

  it("reads both breach flags, including the NO", () => {
    /* NO must become false, not null: "we asked and the answer was no" is not
       the same as "nobody asked". */
    expect(p.breachEquifax).toBe(false);
    expect(p.breachNpd).toBe(false);
  });

  it("has nothing to review", () => {
    expect(p.needsReview).toEqual([]);
  });
});

describe("credential blocks, which have no fields in ClickUp at all", () => {
  it("reads a monitoring block", () => {
    const p = parseClientCard(
      ["Ivan Garcia", "1191 Northwest 18th Street", "Homestead, Florida 33030",
       "SSN:111223333", "DOB:06/09/1966", "", "MFSN", "ivang130@example.test", "pw-not-real"].join("\n"),
      "description",
    );
    expect(p.credentials).toEqual([
      { provider: "MyFreeScoreNow", username: "ivang130@example.test", secret: "pw-not-real", source: "description" },
    ]);
    expect(p.address?.state).toBe("FL");
  });

  it("reads a CFPB block, header date and all", () => {
    const p = parseClientCard(
      ["Sonia Colon", "438 Griswold Drive", "Lake Worth, Florida 33461", "SSN:111223333",
       "CREATED CFPB LOGINS 9/10/26", "dums.example@outlook.test", "pw-not-real"].join("\n"),
      "description",
    );
    expect(p.credentials[0].provider).toBe("CFPB");
    expect(p.credentials[0].username).toBe("dums.example@outlook.test");
  });

  it("flags a one-line block instead of guessing which line is the password", () => {
    const p = parseClientCard(["Someone", "MFSN", "only-one-line"].join("\n"), "description");
    expect(p.credentials).toEqual([]);
    expect(p.needsReview[0]).toMatch(/one line only/);
  });

  it("does not swallow the next labelled field into a credential", () => {
    const p = parseClientCard(["Someone", "MFSN", "user@example.test", "pw", "DOB:01/02/1990"].join("\n"), "description");
    expect(p.credentials[0].secret).toBe("pw");
    expect(p.dateOfBirth).toBe("1990-01-02");
  });
});

describe("merging the description with its comments", () => {
  const description = parseClientCard(
    ["Bryan Rodriguez - R2", "8004 SW 149TH AVE APT C418", "MIAMI, FL 33193-1481",
     "DOB: 2/06/2001", "SSN:111223333", "Cell:(305) 877-5705", "Email:Bryanro002@icloud.com"].join("\n"),
    "description",
  );
  const legacyComment = parseClientCard(
    ["Bryan Rodriguez", "10963 Southwest 69th Terrace", "Miami, Florida 33173", "",
     "SMS (305) 877-5705", "SSN:111223333", "Started:07/24/2026", "Created:07/24/2026",
     "DOB:02/06/2001", "ID:3825596", "Email:Bryanro002@icloud.com", "",
     "MFSN", "bryanro002@example.test", "pw-not-real"].join("\n"),
    "comment 90180252887263",
  );
  const merged = mergeCards(description, [legacyComment]);

  it("keeps the description's address — Dee's ruling", () => {
    expect(merged.address?.line1).toBe("8004 SW 149TH AVE APT C418");
    expect(merged.address?.postalCode).toBe("33193-1481");
  });

  it("takes from the comment only what the description lacked", () => {
    /* This is the whole reason comments are read: the legacy id, the start
       date and the monitoring login exist NOWHERE else on Bryan's card. */
    expect(merged.legacyClientId).toBe("3825596");
    expect(merged.startedOn).toBe("2026-07-24");
    expect(merged.credentials.map((c) => c.provider)).toEqual(["MyFreeScoreNow"]);
  });

  it("raises two different passwords for one provider rather than picking", () => {
    const other = parseClientCard(["X", "MFSN", "user@example.test", "a-different-pw"].join("\n"), "comment 2");
    const m = mergeCards(description, [legacyComment, other]);
    expect(m.needsReview.some((r) => /Two different MyFreeScoreNow passwords/.test(r))).toBe(true);
  });
});

describe("what goes on the timeline carries no secret", () => {
  it("replaces the values that went to the vault", () => {
    const text = "MFSN\nuser@example.test\npw-not-real\nSSN:111-22-3333";
    const out = scrubSecrets(text, ["pw-not-real"]);
    expect(out).not.toContain("pw-not-real");
    expect(out).not.toContain("111-22-3333");
    expect(out).toContain("user@example.test");
  });

  it("catches an SSN even when it was never captured as a field", () => {
    expect(scrubSecrets("ref 111-22-3333 on file", [])).not.toContain("111-22-3333");
    expect(scrubSecrets("SSN:111223333", [])).not.toContain("111223333");
  });

  it("leaves a short string alone rather than shredding the note", () => {
    /* A two-character "password" would otherwise replace every occurrence of
       those letters in the note. */
    expect(scrubSecrets("the account is at Capital One", ["at"])).toContain("Capital One");
  });
});
