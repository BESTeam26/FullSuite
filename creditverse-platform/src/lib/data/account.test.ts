import { describe, expect, it } from "vitest";
import { avatarProblem, passwordProblem, profileProblem, type ProfileEdits } from "./account";

const base: ProfileEdits = {
  fullName: "Dee Gallardo",
  preferredName: "Dee",
  title: "Owner",
  phone: "",
  birthMonth: null,
  birthDay: null,
  birthdayVisible: false,
};

describe("passwordProblem", () => {
  it("requires the minimum length and a matching confirmation", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least/);
    expect(passwordProblem("long-enough-1", "different")).toBe("The two entries do not match.");
    expect(passwordProblem("long-enough-1", "long-enough-1")).toBeNull();
  });
});

describe("profileProblem", () => {
  it("accepts a complete profile and an empty birthday", () => {
    expect(profileProblem(base)).toBeNull();
    expect(profileProblem({ ...base, birthMonth: 3, birthDay: 14 })).toBeNull();
  });

  it("refuses a half birthday, an empty name and a bad phone", () => {
    expect(profileProblem({ ...base, birthMonth: 3 })).toMatch(/both a month and a day/);
    expect(profileProblem({ ...base, fullName: "  " })).toMatch(/full name/);
    expect(profileProblem({ ...base, phone: "call me" })).toMatch(/phone number/);
    expect(profileProblem({ ...base, phone: "+1 (512) 555-0134" })).toBeNull();
  });
});

describe("avatarProblem", () => {
  const file = (type: string, size: number) => ({ type, size }) as File;
  it("accepts common image types under the size cap", () => {
    expect(avatarProblem(file("image/png", 1000))).toBeNull();
    expect(avatarProblem(file("image/webp", 1000))).toBeNull();
    expect(avatarProblem(file("application/pdf", 1000))).toMatch(/PNG, JPG or WEBP/);
    expect(avatarProblem(file("image/png", 5 * 1024 * 1024))).toMatch(/2 MB/);
  });
});
