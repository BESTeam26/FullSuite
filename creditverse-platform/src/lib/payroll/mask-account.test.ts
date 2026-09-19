import { describe, expect, it } from "vitest";
import { maskAccountNumber } from "@/lib/payroll/mask-account";

describe("an account number outside payroll shows its last four digits only", () => {
  it("keeps the tail and hides the rest, spaces ignored", () => {
    expect(maskAccountNumber("4413 6000 1792 4895")).toBe("••••4895");
    expect(maskAccountNumber("09946852340")).toBe("••••2340");
  });
  it("never reveals a short number by masking nothing", () => {
    expect(maskAccountNumber("1234")).toBe("••••");
  });
  it("is nothing for nothing", () => {
    expect(maskAccountNumber(null)).toBeNull();
    expect(maskAccountNumber("  ")).toBeNull();
  });
});
