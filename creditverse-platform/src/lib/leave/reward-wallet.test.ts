import { describe, expect, it } from "vitest";
import { rewardWallet, stateOf } from "./reward-wallet";
import type { RewardCredit } from "@/lib/data/reward-credits";

const TODAY = "2026-09-19";

const credit = (over: Partial<RewardCredit> & { id: string }): RewardCredit => ({
  userId: "u1", kind: "attendance", label: "Q3 2026 Attendance Champion", days: 1,
  issuedOn: "2026-09-01", expiresOn: "2026-11-30", election: null,
  consumedAt: null, consumedFor: null, extendedFrom: null, extendReason: null, ...over,
});

describe("whether a credit can still be spent", () => {
  it("is available when it is neither used nor expired", () => {
    expect(stateOf(credit({ id: "c1" }), TODAY)).toBe("available");
  });

  it("is used once it has been consumed", () => {
    expect(stateOf(credit({ id: "c1", consumedAt: "2026-09-10T00:00:00Z" }), TODAY)).toBe("used");
  });

  it("is expired the day after it expires, not on the day", () => {
    /* "Valid September 1–30" means the 30th still works. */
    expect(stateOf(credit({ id: "c1", expiresOn: TODAY }), TODAY)).toBe("available");
    expect(stateOf(credit({ id: "c1", expiresOn: "2026-09-18" }), TODAY)).toBe("expired");
  });

  it("counts a used credit as used even after its expiry passes", () => {
    expect(stateOf(credit({ id: "c1", expiresOn: "2026-01-01", consumedAt: "2025-12-30T00:00:00Z" }), TODAY))
      .toBe("used");
  });
});

describe("the wallet", () => {
  const wallet = () => rewardWallet([
    credit({ id: "b1", kind: "birthday", label: "Birthday Reward 2026", expiresOn: "2026-09-30" }),
    credit({ id: "a1", expiresOn: "2026-10-15" }),
    credit({ id: "a2", expiresOn: "2026-12-01" }),
    credit({ id: "u1", consumedAt: "2026-08-01T00:00:00Z" }),
    credit({ id: "x1", expiresOn: "2026-06-01" }),
  ], { today: TODAY });

  it("counts spendable days by where they came from", () => {
    const w = wallet();
    expect(w.birthdayDays).toBe(1);
    expect(w.attendanceDays).toBe(2);
    expect(w.totalDays).toBe(3);
  });

  it("does not count used or expired credits as spendable", () => {
    const w = wallet();
    expect(w.used.map((c) => c.id)).toEqual(["u1"]);
    expect(w.expired.map((c) => c.id)).toEqual(["x1"]);
    expect(w.available.map((c) => c.id)).not.toContain("u1");
  });

  it("puts the credit that dies first at the top", () => {
    /* The one to spend next is the one closest to expiring, not the newest. */
    expect(wallet().available.map((c) => c.id)).toEqual(["b1", "a1", "a2"]);
    expect(wallet().nextExpiry).toBe("2026-09-30");
  });

  it("surfaces the live birthday credit, because it drives the election", () => {
    expect(wallet().birthday?.id).toBe("b1");
  });

  it("offers no birthday election once it has been used", () => {
    const w = rewardWallet([
      credit({ id: "b1", kind: "birthday", consumedAt: "2026-09-05T00:00:00Z", election: "work_premium" }),
    ], { today: TODAY });
    expect(w.birthday).toBeNull();
    expect(w.birthdayDays).toBe(0);
  });

  it("is empty rather than broken when nothing has been earned", () => {
    const w = rewardWallet([], { today: TODAY });
    expect(w.totalDays).toBe(0);
    expect(w.nextExpiry).toBeNull();
    expect(w.birthday).toBeNull();
  });
});
