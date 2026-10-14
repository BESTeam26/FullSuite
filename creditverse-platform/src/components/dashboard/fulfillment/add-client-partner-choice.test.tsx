/**
 * CreditOps Add Client from the Main Client List (2026-10-12).
 *
 * The list has no partner in context, so the dialog must ask for one. The
 * CreditOps wrapper never passed the partner list through, so the choice was
 * never drawn and Save threw before writing — silently. Its default status
 * was also "Onboarding", retired from Dee's list on 2026-09-22, so the field
 * showed blank.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

type Captured = {
  partnerOptions?: { scopeId: string; name: string; mode: string }[];
  statusOptions: readonly string[];
  defaultStatus: string;
  buildPayload: (
    common: { name: string; email: string; status: string; assignee: string },
    chosen?: { scopeId: string; name: string; mode: string },
  ) => Record<string, unknown>;
};
let captured: Captured | undefined;

vi.mock("@/lib/data/use-workforce", () => ({ useWorkforce: () => ({ data: undefined }) }));
vi.mock("@/lib/data/use-teams", () => ({ useTeams: () => ({ teams: [], mustChooseTeam: false, defaultTeamId: null }) }));
vi.mock("@/lib/fulfillment/creditops-client-store", () => ({ useCreditOpsStore: () => ({}), ELIGIBLE_ASSIGNEES: ["Unassigned"] }));
vi.mock("./OpsAddClientModal", () => ({
  OpsAddClientModal: (props: Captured) => { captured = props; return null; },
}));

import { AddClientModal } from "./AddClientModal";

const common = { name: "Jane Smith", email: "jane@example.com", status: "New Client", assignee: "Unassigned" };
const outsourcing = { scopeId: "11111111-1111-1111-1111-111111111111", name: "Vanquish Ventures", mode: "outsourcing_only" };
const saas = { scopeId: "22222222-2222-2222-2222-222222222222", name: "Credit Org", mode: "saas_pulled" };

describe("CreditOps Add Client with no partner in context", () => {
  it("offers the partner choice it is given", () => {
    render(<AddClientModal open onClose={() => {}} partner={undefined} partnerOptions={[outsourcing, saas]} />);
    expect(captured?.partnerOptions).toEqual([outsourcing, saas]);
  });

  it("defaults to a status that is in the workflow list", () => {
    render(<AddClientModal open onClose={() => {}} partner={undefined} />);
    expect(captured?.statusOptions).toContain(captured?.defaultStatus);
  });

  it("files an outsourcing client under the partner chosen in the dialog", () => {
    render(<AddClientModal open onClose={() => {}} partner={undefined} partnerOptions={[outsourcing]} />);
    const payload = captured!.buildPayload(common, outsourcing);
    expect(payload).toMatchObject({
      mode: "outsourcing_only",
      outsourcingGroupId: outsourcing.scopeId,
      outsourcingGroupName: "Vanquish Ventures",
    });
  });

  it("files a SaaS client under the chosen organization, with auto-sync from its mode", () => {
    render(<AddClientModal open onClose={() => {}} partner={undefined} partnerOptions={[saas]} />);
    const payload = captured!.buildPayload(common, saas);
    expect(payload).toMatchObject({
      mode: "saas_pulled",
      organizationId: saas.scopeId,
      organizationName: "Credit Org",
      autoSync: true,
    });
  });

  it("still refuses to build a record when no partner is known", () => {
    render(<AddClientModal open onClose={() => {}} partner={undefined} />);
    expect(() => captured!.buildPayload(common)).toThrow(/partner/i);
  });
});
