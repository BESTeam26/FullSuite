/**
 * The Organization Hub, on the interface side.
 *
 * Three layers decide whether a person sees a module (CLAUDE.md rule 18):
 * the package is entitled, the organization switched the module on, and the
 * person's role allows it. The first two arrive from the database in one call
 * (`organization_hub`); the third is the usual permission check. This module
 * holds the pure composition rule and the wiring from a module to the screen
 * that already implements it — no module has an engine of its own.
 */
import type { PermissionKeyName } from "@/lib/auth/use-permission";

export type HubPackage = "hubCore" | "hubOperations" | "hubPerformance" | "hubAi";

export const HUB_PACKAGE_LABELS: Record<HubPackage, string> = {
  hubCore: "Hub Core",
  hubOperations: "Hub Operations",
  hubPerformance: "Hub Performance",
  hubAi: "Hub AI",
};

/** What a customer is told when a package is not part of their subscription. */
export const HUB_PACKAGE_PITCH: Record<HubPackage, string> = {
  hubCore: "The company basics: announcements, people, knowledge and files.",
  hubOperations: "Run the company day to day: calendar, requests, forms and department boards.",
  hubPerformance: "Measure and coach: KPIs, goals, productivity, End of Day and training.",
  hubAi: "Ask the company's own knowledge. Usage is billed as AI credits.",
};

export interface HubModuleRow {
  key: string;
  package: HubPackage;
  label: string;
  description: string;
  alwaysOn: boolean;
  status: "available" | "planned";
  backedBy: string;
  sort: number;
  /** The organization's subscription includes the package. */
  entitled: boolean;
  /** The organization switched it on (or it is always on). */
  enabled: boolean;
  /** Entitled, enabled, and the screen exists. */
  active: boolean;
}

/** Where a module lives, and what a person needs to open it. */
export interface HubModuleRoute {
  href: string;
  /** Any one of these permissions opens it; absent means everyone may. */
  permission?: PermissionKeyName | readonly PermissionKeyName[];
}

/**
 * Each module points at a screen that already exists. A module with no entry
 * here has no screen yet and is never put in the navigation, whatever the
 * registry says.
 */
export const HUB_MODULE_ROUTES: Record<string, HubModuleRoute> = {
  home: { href: "/app" },
  announcements: { href: "/app/announcements" },
  people: { href: "/app/people" },
  departments: { href: "/app/teams" },
  my_work: { href: "/app/my-work" },
  knowledge: { href: "/app/education" },
  files: { href: "/app/files" },
  tools: { href: "/app/tools" },
  calendar: { href: "/app/calendar" },
  dept_spaces: { href: "/app/workspaces", permission: "workspaces.manage" },
  ops_dashboard: { href: "/app/reporting", permission: "reports.view" },
  kpis: { href: "/app/reporting", permission: "reports.view" },
  productivity: { href: "/app/reporting", permission: "reports.view" },
  eod: { href: "/app/eod" },
  assistant: { href: "/app/assistant" },
};

export interface VisibleHubModule extends HubModuleRow {
  route: HubModuleRoute;
}

/**
 * The modules to put in the navigation: active, with a screen, and permitted.
 * `can` is the caller's permission test, so this stays pure and testable.
 */
export function visibleHubModules(
  rows: HubModuleRow[],
  can: (key: PermissionKeyName | readonly PermissionKeyName[]) => boolean,
): VisibleHubModule[] {
  return rows
    .filter((r) => r.active)
    .map((r) => ({ row: r, route: HUB_MODULE_ROUTES[r.key] }))
    .filter((x): x is { row: HubModuleRow; route: HubModuleRoute } => !!x.route)
    .filter((x) => !x.route.permission || can(x.route.permission))
    .sort((a, b) => a.row.sort - b.row.sort)
    .map((x) => ({ ...x.row, route: x.route }));
}

/** Packages the organization does not own, for the upgrade note in settings. */
export function upgradablePackages(rows: HubModuleRow[]): HubPackage[] {
  const owned = new Set(rows.filter((r) => r.entitled).map((r) => r.package));
  const all = new Set(rows.map((r) => r.package));
  return [...all].filter((p) => !owned.has(p)).sort();
}

/** Rows grouped by package, in registry order — how settings lists them. */
export function groupByPackage(rows: HubModuleRow[]): [HubPackage, HubModuleRow[]][] {
  const order: HubPackage[] = ["hubCore", "hubOperations", "hubPerformance", "hubAi"];
  return order
    .map((p) => [p, rows.filter((r) => r.package === p).sort((a, b) => a.sort - b.sort)] as [HubPackage, HubModuleRow[]])
    .filter(([, list]) => list.length > 0);
}

/** Why a module is not showing, in words a customer can act on. */
export function moduleState(row: HubModuleRow): "on" | "off" | "not-entitled" | "coming" {
  if (!row.entitled) return "not-entitled";
  if (row.status !== "available") return "coming";
  return row.enabled ? "on" : "off";
}
