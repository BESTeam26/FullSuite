/**
 * The client card's three editable fields, across the four views.
 *
 * Dee, 2026-09-21, choosing how a client should open: like a ClickUp task.
 * On a task you set the status, the owner and the date from the card. On a
 * CreditOps client those three are governed differently from each other, and
 * this file pins which is which so a later tidy-up cannot quietly widen one:
 *
 *   status    the department currently holding the file, and only its people
 *   assignee  the same
 *   due date  derived by the SLA engine; overriding it needs `ops.manage`
 *             and a written reason
 *
 * The header is presentational — the database refuses on its own — so these
 * are about what an agent is OFFERED, not about what they could force.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientFileHeader } from "./client/ClientFileHeader";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";

vi.mock("@/lib/data/use-department-roster", () => ({
  useDepartmentRoster: () => [
    { id: "u1", name: "Jet Manugas", email: "jet@example.com", isLead: false, activeFiles: 3 },
  ],
}));

const client = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Bryan Rodriguez",
  email: "b@example.com",
  mode: "outsourcing_only",
  autoSync: false,
  status: "For Complaints",
  round: "Round 2",
  openItems: 0,
  lastActivity: "2026-09-21",
  createdAt: "2026-09-01",
  lifecycle: "active",
  slaHoursRemaining: -8,
  dueAt: "2026-07-24T00:00:00.000Z",
} as unknown as FulfillmentClient;

const current = {
  department: "Dispute",
  status: "READY FOR PROCESSING",
  assignee: "Jet Manugas",
  assigneeId: "u1",
  updatedAt: "2026-09-21T00:00:00.000Z",
} as DepartmentStatus;

const noop = async () => undefined;

const show = (over: { canWork?: boolean; canManage?: boolean } = {}) =>
  render(
    <ClientFileHeader
      client={client}
      current={current}
      canWork={over.canWork ?? true}
      canManage={over.canManage ?? true}
      onBack={() => undefined}
      onCompleteWork={() => undefined}
      onStatusChange={noop}
      onAssigneeChange={noop}
      onDueChange={noop}
      onDueClear={noop}
    />,
  );

describe("somebody who works the department holding the file", () => {
  it("can change the status from the card itself", () => {
    show();
    expect(screen.getByRole("button", { name: /Dispute work status — click to change/ })).toBeInTheDocument();
  });

  it("can reassign it from the card itself", () => {
    show();
    expect(screen.getByRole("button", { name: /Dispute assignee — click to change/ })).toBeInTheDocument();
  });

  it("still sees the department beside the status, so the card says where it is", () => {
    show();
    expect(screen.getByText("Dispute")).toBeInTheDocument();
    expect(screen.getByText("READY FOR PROCESSING")).toBeInTheDocument();
  });
});

describe("somebody who does not work that department", () => {
  /* VIEW MODE (the consolidation audit, section D). The controls are ABSENT,
     not disabled — an offer nobody can accept is worse than no offer. */
  it("reads the status and cannot change it", () => {
    show({ canWork: false });
    expect(screen.queryByRole("button", { name: /work status/ })).toBeNull();
    /* Both facts are readable. Asserted separately rather than as one string:
       the header lays the department above its status now (Dee's mockup,
       2026-09-24), and "Dispute · READY FOR PROCESSING" was testing the
       punctuation between them rather than the rule, which is that a person
       who does not work the department can READ it and not change it. */
    expect(screen.getByText("Dispute")).toBeInTheDocument();
    expect(screen.getByText("READY FOR PROCESSING")).toBeInTheDocument();
  });

  it("reads the assignee and cannot change it", () => {
    show({ canWork: false });
    expect(screen.queryByRole("button", { name: /assignee/ })).toBeNull();
    expect(screen.getByText("Jet Manugas")).toBeInTheDocument();
  });
});

describe("the due date is the SLA engine's, not a free field", () => {
  it("is adjustable only with management authority, and says it is an adjustment", () => {
    show({ canManage: true });
    expect(screen.getByRole("button", { name: /Due date — click to adjust/ })).toBeInTheDocument();
  });

  it("is plain text for an agent, however much of the file they work", () => {
    /* An agent works the department AND still cannot move the date: the two
       permissions are separate on purpose, because the date is a commitment
       to the partner rather than a property of the task. */
    show({ canWork: true, canManage: false });
    expect(screen.queryByRole("button", { name: /Due date/ })).toBeNull();
    /* Still shown, just not touchable — a date you cannot see is worse than
       one you cannot change. Matched loosely because the rendered month and
       day follow the reader's own locale. */
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
