/**
 * The partner's two kinds of answer.
 *
 * A CreditOps confirmation has one — yes — and returns the client to the
 * workflow step that asked. A marketing approval has two, and they are
 * different database calls: answering a marketing approval through the
 * CreditOps path would mark it completed and move the work nowhere.
 *
 * Who may answer which item is the database's, proved in
 * `marketing-module-probe.mjs` (one partner cannot answer another's). These
 * cover which call the screen makes, and that "request changes" cannot be sent
 * with nothing in it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PartnerActionItem } from "@/lib/data/use-partner-portal-actions";

let actions: PartnerActionItem[];
const respondMutate = vi.fn().mockResolvedValue(undefined);
const reviewMutate = vi.fn().mockResolvedValue(undefined);
const toast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/data/use-partner-portal-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/use-partner-portal-actions")>(
    "@/lib/data/use-partner-portal-actions",
  );
  return {
    ...actual,
    useMyPartnerActions: () => ({ data: actions, isLoading: false }),
    useRespondToPartnerAction: () => ({ mutateAsync: respondMutate, isPending: false }),
    useMyPartnerReview: () => ({ mutateAsync: reviewMutate, isPending: false }),
  };
});

const { PortalActionNeeded } = await import("./PortalActionNeeded");

const action = (over: Partial<PartnerActionItem>): PartnerActionItem => ({
  id: "a1", kind: "partner_confirmation", title: "Confirm the reimport",
  detail: null, status: "open", clientName: "Bryan Rodriguez",
  requestedByName: "Dee", requestedAt: "2026-09-12T00:00:00Z",
  respondedAt: null, response: null, ...over,
});

describe("what the partner is asked, and how they answer", () => {
  beforeEach(() => {
    respondMutate.mockClear();
    reviewMutate.mockClear();
    toast.mockClear();
  });

  it("offers Confirm for a CreditOps confirmation", () => {
    actions = [action({})];
    render(<PortalActionNeeded />);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("offers Approve and Request changes for a content approval", () => {
    actions = [action({ kind: "content_approval", title: "October carousel", clientName: null })];
    render(<PortalActionNeeded />);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("sends an approval through my_partner_review, not the CreditOps path", () => {
    /* The whole reason this test exists: the CreditOps call would mark the
       item completed and leave the work item exactly where it was. */
    actions = [action({ kind: "content_approval" })];
    render(<PortalActionNeeded />);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(reviewMutate).toHaveBeenCalledWith({ id: "a1", approved: true, comment: "" });
    expect(respondMutate).not.toHaveBeenCalled();
  });

  it("refuses Request changes with nothing written", () => {
    actions = [action({ kind: "content_approval" })];
    render(<PortalActionNeeded />);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(reviewMutate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tell us what to change" }));
  });

  it("sends the comment with a changes request", () => {
    actions = [action({ kind: "campaign_approval" })];
    render(<PortalActionNeeded />);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.change(screen.getByLabelText("Your response"), { target: { value: "Swap the headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(reviewMutate).toHaveBeenCalledWith({ id: "a1", approved: false, comment: "Swap the headline" });
  });

  it("says so when there is nothing to do", () => {
    actions = [];
    render(<PortalActionNeeded />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});
