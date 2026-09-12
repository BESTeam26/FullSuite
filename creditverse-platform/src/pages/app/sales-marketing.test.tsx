/**
 * What the Sales & Marketing module DOES with what it is handed.
 *
 * Who may see a marketing workspace at all is the database's decision, proved
 * against the live database in `supabase/scripts/marketing-module-probe.mjs` —
 * a marketing hire reaches the module, a colleague without the capability
 * reaches nothing. These cover the screen: that partners are listed A→Z, that
 * the module's controls are absent for somebody who may only read, and that
 * the calendar and the task list are two renderings of the same rows rather
 * than two sets of records.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { MarketingWorkItem } from "@/lib/marketing/marketing-domain";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

let canManage: boolean;
let work: MarketingWorkItem[];

const STATUSES: Workspace["statuses"] = [
  { id: "s-todo", key: "todo", label: "To Do", colour: "#64748b", position: 20, canonicalStage: "Assigned", isTerminal: false },
  { id: "s-done", key: "completed", label: "Completed", colour: "#10b981", position: 70, canonicalStage: "Completed", isTerminal: true },
];

const workspace = (over: Partial<Workspace>): Workspace => ({
  id: "w-bes", organizationId: null, agencyId: "a1", name: "BES Internal Marketing",
  description: null, icon: "megaphone", colour: "#7c3aed", partnerGroupId: null,
  module: "sales_marketing", boards: [], statuses: STATUSES, itemTypes: [],
  fields: [{ id: "f-pub", key: "publish_at", label: "Publish Date", fieldType: "date", choices: [], position: 30, archivedAt: null }],
  ...over,
});

const item = (over: Partial<MarketingWorkItem>): MarketingWorkItem => ({
  id: "i1", workspaceId: "w-bes", workspaceName: "BES Internal Marketing",
  partnerGroupId: null, partnerName: null, partnerContactName: null, title: "A task", description: null,
  priority: "Normal", assignedTo: null, assigneeName: null, teamId: null,
  dueAt: null, completedAt: null, createdAt: "2026-09-01T00:00:00Z",
  statusId: "s-todo", statusKey: "todo", statusLabel: "To Do", statusColour: "#64748b",
  statusPosition: 20, isTerminal: false, itemTypeId: null, itemTypeKey: "content",
  itemTypeLabel: "Content", campaignId: null, campaignName: null,
  publishOn: null, channel: null, contentType: null, ...over,
});

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ agencyId: "a1", user: { id: "u1" }, displayName: "Roniel Pena", isAgencyStaff: true }),
}));
vi.mock("@/lib/data/agency-permissions", () => ({
  useAgencyPermissions: () => ({ can: () => canManage, loading: false }),
}));
vi.mock("@/lib/data/use-agency-work", () => ({
  useAgencyMembers: () => ({ data: [{ id: "u1", name: "Roniel Pena", email: "r@bes.test", role: "agency_user" }] }),
  useAgencyTeams: () => ({ data: [] }),
  useChecklist: () => ({ data: [] }),
  useChecklistActions: () => ({ add: {}, toggle: {}, rename: {}, remove: {} }),
}));
vi.mock("@/lib/data/use-marketing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/use-marketing")>("@/lib/data/use-marketing");
  return {
    ...actual,
    useMarketingWorkspaces: () => ({ data: [workspace({}), workspace({ id: "w-apex", name: "Apex — Marketing", partnerGroupId: "g-apex" })], isLoading: false }),
    /* Deliberately NOT alphabetical, so the assertion below tests the sort
       rather than the order the fixture happened to be written in. */
    useMarketingPartners: () => ({ data: [
      { id: "g-zen", name: "Zenith Media", partnerName: null, primaryContactName: "Jesse Roldan", lifecycle: "active", workspaceId: "w-zen" },
      { id: "g-apex", name: "Apex Outsourcing", partnerName: null, primaryContactName: "Parker Cathcart", lifecycle: "active", workspaceId: "w-apex" },
    ].sort((a, b) => a.name.localeCompare(b.name)), isLoading: false }),
    useMarketingWork: () => ({ data: work, isLoading: false, error: null }),
    useMarketingCounters: () => ({ data: {
      activePartners: 2, openTasks: 5, dueToday: 1, overdue: 2,
      contentScheduled: 3, forInternalReview: 1, awaitingPartnerApproval: 4,
    }, isLoading: false }),
    useCampaigns: () => ({ data: [], isLoading: false }),
    useCreateMarketingWork: () => ({ mutateAsync: vi.fn() }),
    useCreateCampaign: () => ({ mutateAsync: vi.fn() }),
    useUpdateCampaign: () => ({ mutate: vi.fn() }),
    useSetWorkCampaign: () => ({ mutate: vi.fn() }),
    useRequestPartnerApproval: () => ({ mutateAsync: vi.fn() }),
  };
});

const { SalesMarketing } = await import("./SalesMarketing");

const at = (path: string): ReactElement => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <SalesMarketing />
    </MemoryRouter>
  </QueryClientProvider>
);

describe("Sales & Marketing", () => {
  beforeEach(() => {
    canManage = true;
    work = [];
  });

  it("opens on the dashboard with Dee's seven numbers", () => {
    render(at("/app/marketing"));
    for (const label of [
      "Active Marketing Partners", "Open Tasks", "Due Today", "Overdue",
      "Content Scheduled", "For Internal Review", "Awaiting Partner Approval",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("writes every partner as Business · Person", () => {
    render(at("/app/marketing"));
    const pane = screen.getByRole("navigation", { name: "Sales & Marketing" });
    expect(within(pane).getByRole("button", { name: /Apex Outsourcing · Parker Cathcart/ })).toBeInTheDocument();
    expect(within(pane).getByRole("button", { name: /Zenith Media · Jesse Roldan/ })).toBeInTheDocument();
  });

  it("still sorts on the business, not the person", () => {
    /* The company leads precisely so one person's several businesses file
       under their own names rather than together under the person's. */
    render(at("/app/marketing"));
    const pane = screen.getByRole("navigation", { name: "Sales & Marketing" });
    const names = within(pane).getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.findIndex((n) => n.includes("Zenith")))
      .toBeGreaterThan(names.findIndex((n) => n.includes("Apex")));
  });

  it("lists partners A→Z in the module pane", () => {
    render(at("/app/marketing"));
    const pane = screen.getByRole("navigation", { name: "Sales & Marketing" });
    const names = within(pane).getAllByRole("button").map((b) => b.textContent ?? "");
    const apex = names.findIndex((n) => n.includes("Apex"));
    const zenith = names.findIndex((n) => n.includes("Zenith"));
    expect(apex).toBeGreaterThan(-1);
    expect(zenith).toBeGreaterThan(apex);
  });

  it("keeps BES's own workspace out of the partner list", () => {
    /* Dee: "Do NOT create BES as a fake Partner." An agency-owned workspace
       belongs under BES, not among the companies BES invoices. */
    render(at("/app/marketing"));
    const pane = screen.getByRole("navigation", { name: "Sales & Marketing" });
    expect(within(pane).getByText("BES")).toBeInTheDocument();
    expect(within(pane).getByText("BES Internal Marketing")).toBeInTheDocument();
  });

  it("shows a task on the list and the same task on the calendar", () => {
    /* The point of the whole design: one record, two views. If these ever
       diverge it is because somebody created a second content record. */
    work = [item({ id: "i1", title: "October carousel", publishOn: "2026-10-05" })];
    const { unmount } = render(at("/app/marketing?view=tasks"));
    expect(screen.getByText("October carousel")).toBeInTheDocument();
    unmount();
    render(at("/app/marketing?view=calendar"));
    expect(screen.getByText("October carousel")).toBeInTheDocument();
  });

  it("leaves a task with no publish date off the calendar", () => {
    work = [item({ id: "i1", title: "Unscheduled draft", publishOn: null })];
    render(at("/app/marketing?view=calendar"));
    expect(screen.queryByText("Unscheduled draft")).toBeNull();
  });

  it("offers New task to somebody who may work the module", () => {
    render(at("/app/marketing?view=tasks"));
    expect(screen.getByRole("button", { name: /new task/i })).toBeInTheDocument();
  });

  it("does not offer it to somebody who may only read", () => {
    /* Absent, not disabled. A greyed button says "you are not allowed this",
       which is true and useless — and the database refuses it either way. */
    canManage = false;
    render(at("/app/marketing?view=tasks"));
    expect(screen.queryByRole("button", { name: /new task/i })).toBeNull();
  });

  it("shows a partner's own tabs when a partner workspace is open", () => {
    render(at("/app/marketing?ws=w-apex&partner=g-apex&tab=overview"));
    /* `Business · Person` (Dee, 2026-09-13) — some agents know the company,
       some only ever hear the person's name. */
    expect(screen.getByRole("heading", { name: "Apex Outsourcing · Parker Cathcart" })).toBeInTheDocument();
    /* Scoped to the tab strip: the module pane above carries buttons with the
       same words, and "Tasks" there means every partner's. */
    const tabs = screen.getByRole("navigation", { name: "Workspace views" });
    for (const tab of ["Overview", "Tasks", "Content Calendar", "Campaigns", "Files", "Activity"]) {
      expect(within(tabs).getByRole("button", { name: tab })).toBeInTheDocument();
    }
  });
});
