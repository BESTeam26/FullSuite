import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { NotificationKind } from "./notifications";

/**
 * The database's `notifications_kind_check` and the frontend's
 * `NotificationKind` are two statements of one vocabulary. 0218 added four
 * values, and a value the union does not carry renders with `KIND_ICON[kind]`
 * undefined — a crash, not a fallback. So the check constraint in the newest
 * migration that declares it IS the test fixture.
 */
const MIGRATION =
  "supabase/migrations/20260908004100_operational_notifications.sql";

const kindsFromMigration = (): string[] => {
  const sql = readFileSync(MIGRATION, "utf8");
  const m = sql.match(/check \(kind in \(([^)]*)\)\)/);
  if (!m) throw new Error("no kind check constraint found in " + MIGRATION);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

describe("notification kinds", () => {
  it("the union carries every kind the database may write", () => {
    /* Assigning each database value to the union is the assertion: an
       unlisted one fails to compile. */
    const declared: Record<NotificationKind, true> = {
      assigned: true,
      unassigned: true,
      note: true,
      status: true,
      mention: true,
      dm: true,
      handoff: true,
      attention: true,
      announcement: true,
    };
    expect(kindsFromMigration().sort()).toEqual(Object.keys(declared).sort());
  });
});
