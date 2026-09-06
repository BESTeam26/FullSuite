import { describe, expect, it } from "vitest";
import { gettingStartedProgress, gettingStartedSteps, type GettingStartedState } from "./getting-started";

const empty: GettingStartedState = {
  enabledModules: ["creditOps", "fundingOps"],
  brandingSet: false,
  teammates: 0,
  clients: 0,
  creditReports: 0,
  letterTemplates: 0,
  kpisChosen: 0,
  fundingFiles: 0,
};

describe("gettingStartedSteps", () => {
  it("lists module steps only for enabled modules", () => {
    const keys = gettingStartedSteps({ ...empty, enabledModules: ["creditOps"] }).map((s) => s.key);
    expect(keys).toEqual(["branding", "team", "client", "report", "letters", "kpis"]);
    expect(gettingStartedSteps({ ...empty, enabledModules: [] }).map((s) => s.key)).toEqual(["branding", "team", "kpis"]);
  });

  it("marks a step done only when the record exists", () => {
    const steps = gettingStartedSteps({ ...empty, brandingSet: true, clients: 2, fundingFiles: 1 });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({ branding: true, team: false, client: true, report: false, letters: false, funding: true, kpis: false });
  });

  it("reports progress and completion", () => {
    const all = gettingStartedSteps({ ...empty, brandingSet: true, teammates: 1, clients: 1, creditReports: 1, letterTemplates: 1, kpisChosen: 1, fundingFiles: 1 });
    expect(gettingStartedProgress(all)).toEqual({ done: 7, total: 7, complete: true });
    expect(gettingStartedProgress(gettingStartedSteps(empty)).complete).toBe(false);
  });

  it("links settings steps to their section", () => {
    const steps = gettingStartedSteps(empty);
    expect(steps.find((s) => s.key === "letters")?.href).toBe("/app/settings?section=letters");
  });
});
