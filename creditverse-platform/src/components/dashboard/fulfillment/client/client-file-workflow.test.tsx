/**
 * The CreditOps client file answers Dee's four questions and offers only the
 * controls this person may use (2026-10-03):
 *   header — client, partner, round, credit status, current work, assigned,
 *   due/SLA, NEXT ACTION; Complete Work · Report Blocker · More.
 *   View mode (not your department) — More only: you can see, not act.
 *   Blocker — what is STORED, never a screen-local guess.
 *   Checklist — only when one exists; only custom steps can be removed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let blocker: { reason: string; since: string | null } | null = null;
let checklist: { id: string; label: string; done: boolean; doneAt: null; sort: number; isCustom: boolean }[] = [];
let canWork = true;

vi.mock("@/lib/data/use-client-work-detail", () => ({
  CUSTOM_STEP_SORT: 1000,
  useWorkBlocker: () => ({ data: blocker, isError: false, isPending: false }),
  useWorkChecklist: () => ({ data: checklist, isError: false }),
  useChecklistActions: () => ({ add: { mutate: vi.fn() }, toggle: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }),
  reportWorkBlocker: vi.fn(),
}));
vi.mock("@/lib/fulfillment/creditops-access", () => ({ useCreditOpsAccess: () => ({ canLogDepartment: () => canWork }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/dashboard/fulfillment/ClientWorkflowActions", () => ({ ClientWorkflowActions: () => null }));
vi.mock("./ClientNotesCard", () => ({ ClientNotesCard: () => null }));
vi.mock("@/lib/data/use-department-roster", () => ({ useDepartmentRoster: () => [] }));

import { ClientFileHeader } from "./ClientFileHeader";
import { ClientWorkTab } from "./ClientWorkTab";

const client = {
  id: "c1", name: "Jordan Reyes", email: "j@example.test", mode: "outsourcing_only", status: "Round 1 Sent",
  round: "Round 1", lifecycle: "active", outsourcingGroupId: "g1", outsourcingGroupName: "Vanquish Ventures",
  openItems: 0, lastActivity: "1d ago", createdAt: "2026-09-01", dueAt: null, slaHoursRemaining: 30,
} as never;
const current = { department: "Dispute", status: "READY FOR ROUND 1", assignee: "Alvaro", assigneeId: "a1", updatedAt: "2026-10-01" } as never;
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const header = (overrides: Record<string, unknown> = {}) => wrap(
  <ClientFileHeader client={client} current={current} canWork canManage={false} onBack={() => {}}
    onCompleteWork={() => {}} onStatusChange={async () => {}} onAssigneeChange={async () => {}}
    onDueChange={async () => {}} onDueClear={async () => {}} nextAction="Mail round 2 letters"
    onReportBlocker={() => {}} {...overrides} />);

beforeEach(() => { blocker = null; checklist = []; canWork = true; });

describe("the client header", () => {
  it("answers where, what next, who and when, with Complete Work · Report Blocker · More", () => {
    header();
    expect(screen.getByText("Vanquish Ventures")).toBeTruthy();
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(screen.getByText("Round 1 Sent")).toBeTruthy();
    expect(screen.getByText("Mail round 2 letters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Complete Work" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Report blocker/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
  });

  it("in view mode offers neither Complete Work nor Report Blocker — only More", () => {
    header({ canWork: false });
    expect(screen.queryByRole("button", { name: "Complete Work" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Report blocker/ })).toBeNull();
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
  });

  it("says nothing about a next action nobody wrote", () => {
    header({ nextAction: null });
    expect(screen.queryByText("Next action")).toBeNull();
  });
});

describe("the Work tab", () => {
  const work = () => wrap(<ClientWorkTab client={client} clientId="c1" current={current} onCompleteWork={() => {}} />);

  it("shows a STORED blocker — the state survives a reload", () => {
    blocker = { reason: "Waiting on the client's ID", since: "2026-10-02" };
    work();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Waiting on the client's ID")).toBeTruthy();
  });

  it("says workable when nothing is stored", () => {
    work();
    expect(screen.getByText("Workable")).toBeTruthy();
  });

  it("shows no checklist box when none exists — only a small add link for a worker", () => {
    work();
    expect(screen.queryByText(/Checklist/)).toBeNull();
    expect(screen.getByText(/Add a step/)).toBeTruthy();
  });

  it("shows nothing at all about a checklist to someone who does not work the department", () => {
    canWork = false;
    work();
    expect(screen.queryByText(/Add a step/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete Work" })).toBeNull();
  });

  it("lets only custom steps be removed", () => {
    checklist = [
      { id: "s1", label: "Pull the credit report", done: false, doneAt: null, sort: 1, isCustom: false },
      { id: "s2", label: "Call the bureau twice", done: false, doneAt: null, sort: 1000, isCustom: true },
    ];
    work();
    expect(screen.getByText("Checklist (0/2)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Pull the credit report" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Call the bureau twice" })).toBeTruthy();
  });
});
