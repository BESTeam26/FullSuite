import { describe, expect, it } from "vitest";
import {
  gettingStartedProgress,
  gettingStartedSteps,
  memberFirstRunSteps,
  type GettingStartedState,
} from "./getting-started";

const empty: GettingStartedState = {
  enabledModules: ["creditOps", "fundingOps"],
  brandingSet: false,
  teammates: 0,
  clients: 0,
  creditReports: 0,
  letterTemplates: 0,
  kpisChosen: 0,
  fundingFiles: 0,
  hubChoices: 0,
  automations: 0,
};

describe("gettingStartedSteps", () => {
  it("lists module steps only for enabled modules", () => {
    const keys = gettingStartedSteps({ ...empty, enabledModules: ["creditOps"] }).map((s) => s.key);
    expect(keys).toEqual(["branding", "team", "hub", "client", "report", "letters", "kpis", "automations"]);
    expect(gettingStartedSteps({ ...empty, enabledModules: [] }).map((s) => s.key)).toEqual([
      "branding", "team", "hub", "kpis", "automations",
    ]);
  });

  it("marks a step done only when the record exists", () => {
    const steps = gettingStartedSteps({ ...empty, brandingSet: true, clients: 2, fundingFiles: 1, hubChoices: 3 });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({
      branding: true, team: false, hub: true, client: true, report: false,
      letters: false, funding: true, kpis: false, automations: false,
    });
  });

  it("reports progress and completion, ignoring the optional suggestions", () => {
    const all = gettingStartedSteps({
      ...empty, brandingSet: true, teammates: 1, clients: 1, creditReports: 1,
      letterTemplates: 1, kpisChosen: 1, fundingFiles: 1, hubChoices: 1,
    });
    /* automations is a suggestion and is left undone: the guide still finishes. */
    expect(all.find((s) => s.key === "automations")?.done).toBe(false);
    expect(gettingStartedProgress(all)).toEqual({ done: 8, total: 8, complete: true });
    expect(gettingStartedProgress(gettingStartedSteps(empty)).complete).toBe(false);
  });

  it("counts a hub decision either way — switching something off is still a decision", () => {
    expect(gettingStartedSteps({ ...empty, hubChoices: 1 }).find((s) => s.key === "hub")?.done).toBe(true);
  });

  it("links settings steps to their section", () => {
    const steps = gettingStartedSteps(empty);
    expect(steps.find((s) => s.key === "letters")?.href).toBe("/app/settings?section=letters");
  });
});

describe("memberFirstRunSteps", () => {
  const nothing = { avatarSet: false, phoneSet: false, preferredNameSet: false, birthdayShared: false };

  it("asks an invited person only about their own profile", () => {
    expect(memberFirstRunSteps(nothing).map((s) => s.key)).toEqual(["photo", "contact", "birthday"]);
    for (const step of memberFirstRunSteps(nothing)) {
      expect(step.href).toBe("/app/settings?section=account");
    }
  });

  it("finishes once the photo and phone are there — the birthday is never required", () => {
    const steps = memberFirstRunSteps({ ...nothing, avatarSet: true, phoneSet: true });
    expect(gettingStartedProgress(steps)).toEqual({ done: 2, total: 2, complete: true });
  });

  it("stops asking for a preferred name once one is set", () => {
    const before = memberFirstRunSteps(nothing).find((s) => s.key === "contact")!.detail;
    const after = memberFirstRunSteps({ ...nothing, preferredNameSet: true }).find((s) => s.key === "contact")!.detail;
    expect(before).toContain("name you actually go by");
    expect(after).not.toContain("name you actually go by");
  });
});
