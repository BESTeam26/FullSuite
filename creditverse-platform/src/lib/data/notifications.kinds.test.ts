import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import type { NotificationKind } from "./notifications";

/**
 * The database's `notifications_kind_check` and the frontend's
 * `NotificationKind` are two statements of one vocabulary. A value the union
 * does not carry renders with `KIND_ICON[kind]` undefined — a crash, not a
 * fallback. So the constraint in the migrations IS the fixture.
 *
 * The NEWEST migration that declares the constraint wins, found by scanning
 * the directory rather than by naming a file. Naming one is how this test
 * would go stale silently: 0218 replaced the list 0061 wrote, and a test
 * pinned to 0061 would have kept passing against a vocabulary four values
 * out of date.
 */
const CHECK = /alter table public\.notifications\s+add constraint notifications_kind_check\s+check \(kind in \(([^)]*)\)\)/i;

function kindsFromNewestMigration(): { file: string; kinds: string[] } {
  const dir = "supabase/migrations";
  const found = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, match: readFileSync(`${dir}/${f}`, "utf8").match(CHECK) }))
    .filter((x) => x.match !== null);
  if (found.length === 0) throw new Error("no notifications_kind_check found in any migration");
  const newest = found[found.length - 1];
  return {
    file: newest.file,
    kinds: [...newest.match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
  };
}

describe("notification kinds", () => {
  it("the union carries every kind the database may write", () => {
    /* Assigning each declared value is the assertion: a kind the union does
       not have fails to compile, and a kind the database does not have fails
       the comparison below. */
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
    const { file, kinds } = kindsFromNewestMigration();
    expect(kinds.sort(), `newest constraint is in ${file}`).toEqual(Object.keys(declared).sort());
  });

  it("finds the constraint in a migration later than the one that created the table", () => {
    /* Guards the scan itself: if the regex stopped matching, the test above
       would compare against the ORIGINAL four-value list and pass for the
       wrong reason. */
    const { file } = kindsFromNewestMigration();
    expect(file > "20260904000500_notifications.sql").toBe(true);
  });
});
