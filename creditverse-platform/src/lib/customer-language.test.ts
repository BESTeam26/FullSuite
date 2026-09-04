import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Customer-facing language: the product says Organization (or Company), never Sub-Account. */
const walk = (dir: string, out: string[] = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "_archive" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/database\.types|\.test\./.test(name)) out.push(p);
  }
  return out;
};

describe("customer-facing language", () => {
  it("contains no 'Sub-Account' wording in source or UI strings", () => {
    const offenders = walk(join(process.cwd(), "src")).filter((p) => /sub-account/i.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
