import { describe, expect, it } from "vitest";
import {
  groupByPackage,
  moduleState,
  upgradablePackages,
  visibleHubModules,
  type HubModuleRow,
} from "./hub-modules";

const row = (over: Partial<HubModuleRow> & Pick<HubModuleRow, "key" | "package">): HubModuleRow => ({
  label: over.key,
  description: "",
  alwaysOn: false,
  status: "available",
  backedBy: "",
  sort: 100,
  entitled: true,
  enabled: true,
  active: true,
  ...over,
});

const yes = () => true;
const no = () => false;

describe("visibleHubModules", () => {
  it("shows a module only when it is active, has a screen and is permitted", () => {
    const rows = [
      row({ key: "home", package: "hubCore", sort: 10 }),
      row({ key: "announcements", package: "hubCore", sort: 20 }),
      row({ key: "kpis", package: "hubPerformance", sort: 210 }),
    ];
    expect(visibleHubModules(rows, yes).map((m) => m.key)).toEqual(["home", "announcements", "kpis"]);
    // kpis needs reports.view; without it the module drops out.
    expect(visibleHubModules(rows, no).map((m) => m.key)).toEqual(["home", "announcements"]);
  });

  it("drops a module the organization did not buy, even if a row says enabled", () => {
    const rows = [row({ key: "calendar", package: "hubOperations", entitled: false, enabled: true, active: false })];
    expect(visibleHubModules(rows, yes)).toEqual([]);
  });

  it("drops a module the organization switched off", () => {
    const rows = [row({ key: "announcements", package: "hubCore", enabled: false, active: false })];
    expect(visibleHubModules(rows, yes)).toEqual([]);
  });

  it("drops a planned module that has no screen", () => {
    const rows = [row({ key: "requests", package: "hubOperations", status: "planned", active: false })];
    expect(visibleHubModules(rows, yes)).toEqual([]);
  });

  it("ignores an active module with no route wired", () => {
    expect(visibleHubModules([row({ key: "not_a_screen", package: "hubCore" })], yes)).toEqual([]);
  });

  it("orders by the registry's sort", () => {
    const rows = [
      row({ key: "eod", package: "hubPerformance", sort: 240 }),
      row({ key: "home", package: "hubCore", sort: 10 }),
      row({ key: "calendar", package: "hubOperations", sort: 110 }),
    ];
    expect(visibleHubModules(rows, yes).map((m) => m.key)).toEqual(["home", "calendar", "eod"]);
  });
});

describe("moduleState", () => {
  it("names why a module is not showing", () => {
    expect(moduleState(row({ key: "a", package: "hubCore" }))).toBe("on");
    expect(moduleState(row({ key: "a", package: "hubCore", enabled: false }))).toBe("off");
    expect(moduleState(row({ key: "a", package: "hubAi", entitled: false }))).toBe("not-entitled");
    expect(moduleState(row({ key: "a", package: "hubOperations", status: "planned" }))).toBe("coming");
  });

  it("puts the subscription before everything else", () => {
    expect(moduleState(row({ key: "a", package: "hubAi", entitled: false, status: "planned", enabled: true }))).toBe("not-entitled");
  });
});

describe("upgradablePackages and groupByPackage", () => {
  const rows = [
    row({ key: "home", package: "hubCore" }),
    row({ key: "calendar", package: "hubOperations", entitled: false }),
    row({ key: "kpis", package: "hubPerformance", entitled: false }),
  ];

  it("lists the packages that are not owned", () => {
    expect(upgradablePackages(rows)).toEqual(["hubOperations", "hubPerformance"]);
    expect(upgradablePackages([row({ key: "home", package: "hubCore" })])).toEqual([]);
  });

  it("groups in package order and skips empty packages", () => {
    expect(groupByPackage(rows).map(([p]) => p)).toEqual(["hubCore", "hubOperations", "hubPerformance"]);
  });
});
