/**
 * The Add Client dialogs are mounted with their list page. Their roster
 * (members, teams, this week's time) is asked for only while the dialog is
 * open — it was three requests on every CreditOps open (2026-10-03).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const workforceCalls: (boolean | undefined)[] = [];
vi.mock("@/lib/data/use-workforce", () => ({
  useWorkforce: (o: { enabled?: boolean } = {}) => { workforceCalls.push(o.enabled); return { data: undefined }; },
}));
vi.mock("@/lib/data/use-teams", () => ({ useTeams: () => ({ teams: [], mustChooseTeam: false, defaultTeamId: null }) }));
vi.mock("@/lib/fulfillment/creditops-client-store", () => ({ useCreditOpsStore: () => ({}), ELIGIBLE_ASSIGNEES: ["Unassigned"] }));
vi.mock("@/lib/fulfillment/fundingops-client-store", async (orig) => ({ ...(await orig<object>()), useFundingOpsStore: () => ({}) }));
vi.mock("./OpsAddClientModal", () => ({ OpsAddClientModal: () => null }));

import { AddClientModal } from "./AddClientModal";
import { FundingAddClientModal } from "./FundingAddClientModal";

beforeEach(() => { workforceCalls.length = 0; });

describe("Add Client dialogs load the roster only when open", () => {
  it("CreditOps: closed asks for nothing, open asks for the roster", () => {
    const { rerender } = render(<AddClientModal open={false} onClose={() => {}} partner={null as never} />);
    expect(workforceCalls.at(-1)).toBe(false);
    rerender(<AddClientModal open onClose={() => {}} partner={null as never} />);
    expect(workforceCalls.at(-1)).toBe(true);
  });

  it("FundingOps: closed asks for nothing", () => {
    render(<FundingAddClientModal open={false} onClose={() => {}} partner={null as never} />);
    expect(workforceCalls.at(-1)).toBe(false);
  });
});
