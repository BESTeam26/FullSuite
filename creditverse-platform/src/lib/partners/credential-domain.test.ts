import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byPlatform,
  credentialHref,
  looksLikeASecret,
  rotationState,
  SECRET_PATTERN,
} from "./credential-domain";

describe("rotationState", () => {
  const today = new Date(2026, 8, 8); // 8 September 2026

  it("says nothing when no date is set", () => {
    expect(rotationState(null, today)).toBe("none");
    expect(rotationState("not a date", today)).toBe("none");
  });

  it("calls a past date overdue", () => {
    expect(rotationState("2026-09-07", today)).toBe("overdue");
    expect(rotationState("2025-01-01", today)).toBe("overdue");
  });

  it("calls today and the coming week due soon", () => {
    expect(rotationState("2026-09-08", today)).toBe("due-soon");
    expect(rotationState("2026-09-15", today)).toBe("due-soon");
  });

  it("calls anything further out scheduled", () => {
    expect(rotationState("2026-09-16", today)).toBe("scheduled");
    expect(rotationState("2027-01-01", today)).toBe("scheduled");
  });

  it("compares whole days, so the hour of checking cannot change the answer", () => {
    const lateEvening = new Date(2026, 8, 8, 23, 59);
    const earlyMorning = new Date(2026, 8, 8, 0, 1);
    expect(rotationState("2026-09-08", lateEvening)).toBe("due-soon");
    expect(rotationState("2026-09-08", earlyMorning)).toBe("due-soon");
  });
});

describe("looksLikeASecret", () => {
  it.each([
    "the password is hunter2",
    "Pass Word: abc",
    "passcode 4417",
    "pwd = letmein",
    "api_key sk-abc",
    "API KEY",
    "secret key below",
    "security code 883921",
    "bearer eyJhbGciOiJIUzI1",
  ])("warns about %j", (text) => {
    expect(looksLikeASecret(text)).toBe(true);
  });

  it.each([
    "code goes to accounts@dispute-me.com",
    "Kierra uses this for uploads",
    "shared mailbox, ask Ops",
    "",
    null,
    undefined,
    // "password" inside an ordinary word must not trip it.
    "passing this to the QA team",
  ])("stays quiet about %j", (text) => {
    expect(looksLikeASecret(text)).toBe(false);
  });

  /* The database refuses on the same pattern. If they drift, the interface
     warns about text the database accepts, or stays quiet about text it
     rejects — and the person finds out only when saving fails. */
  it("matches the pattern the database enforces", () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        "../../../supabase/migrations/20260908004800_partner_credential_vault.sql",
      ),
      "utf8",
    );
    const inSql = sql.match(/~\*\s*'([^']+)'/)?.[1];
    expect(inSql).toBeTruthy();
    // Postgres writes it without delimiters or flags; compare the body.
    expect(SECRET_PATTERN.source).toBe(inSql);
  });
});

describe("credentialHref", () => {
  it("leaves a full address alone", () => {
    expect(credentialHref("https://app.disputefox.com")).toBe(
      "https://app.disputefox.com/",
    );
  });

  it("adds a scheme to a bare host, so it is not read as a BES path", () => {
    expect(credentialHref("app.disputefox.com")).toBe("https://app.disputefox.com/");
    expect(credentialHref("  app.gohighlevel.com/login  ")).toBe(
      "https://app.gohighlevel.com/login",
    );
  });

  it("refuses a scheme that is not http or https", () => {
    expect(credentialHref("javascript:alert(1)")).toBeNull();
    expect(credentialHref("data:text/html,<script>")).toBeNull();
    expect(credentialHref("file:///etc/passwd")).toBeNull();
  });

  it("returns nothing for empty input", () => {
    expect(credentialHref(null)).toBeNull();
    expect(credentialHref("   ")).toBeNull();
  });
});

describe("byPlatform", () => {
  const order = ["disputefox", "gohighlevel", "email"];
  const items = [
    { platformKey: "email", label: "Ops mailbox" },
    { platformKey: "disputefox", label: "Main DF login" },
    { platformKey: "gohighlevel", label: "Agency" },
    { platformKey: "disputefox", label: "Backup DF" },
  ];

  it("groups by platform in catalogue order", () => {
    expect(byPlatform(items, order).map((g) => g.platformKey)).toEqual([
      "disputefox",
      "gohighlevel",
      "email",
    ]);
  });

  it("sorts entries within a platform by label", () => {
    const df = byPlatform(items, order)[0];
    expect(df.items.map((i) => i.label)).toEqual(["Backup DF", "Main DF login"]);
  });

  it("puts an unknown platform last rather than dropping it", () => {
    const withUnknown = [...items, { platformKey: "zzz_new", label: "New tool" }];
    const keys = byPlatform(withUnknown, order).map((g) => g.platformKey);
    expect(keys[keys.length - 1]).toBe("zzz_new");
  });

  it("returns nothing for no credentials", () => {
    expect(byPlatform([], order)).toEqual([]);
  });
});
