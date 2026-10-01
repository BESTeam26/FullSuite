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
import { MemoryRouter } from "react-router-dom";
import type { PartnerActionNeeded } from "@/lib/data/use-partner-portal-actions";

let actions: PartnerActionNeeded[];
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
    useMyPartnerActionsNeeded: () => ({ data: actions, isLoading: false }),
    useRespondToPartnerAction: () => ({ mutateAsync: respondMutate, isPending: false }),
    useMyPartnerReview: () => ({ mutateAsync: reviewMutate, isPending: false }),
  };
});

const { PortalActionNeeded } = await import("./PortalActionNeeded");

const action = (over: Partial<PartnerActionNeeded>): PartnerActionNeeded => ({
  kind: "partner_confirmation", source: "action", sourceId: "a1", title: "Confirm the reimport",
  detail: null, clientName: "Bryan Rodriguez", requestedAt: "2026-09-12T00:00:00Z", dueOn: null, href: null, ...over,
});

describe("what the partner is asked, and how they answer", () => {
  beforeEach(() => {
    respondMutate.mockClear();
    reviewMutate.mockClear();
    toast.mockClear();
  });

  it("offers Confirm for a CreditOps confirmation", () => {
    actions = [action({})];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("offers Approve and Request changes for a content approval", () => {
    actions = [action({ kind: "content_approval", title: "October carousel", clientName: null })];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("sends an approval through my_partner_review, not the CreditOps path", () => {
    /* The whole reason this test exists: the CreditOps call would mark the
       item completed and leave the work item exactly where it was. */
    actions = [action({ kind: "content_approval" })];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(reviewMutate).toHaveBeenCalledWith({ id: "a1", approved: true, comment: "" });
    expect(respondMutate).not.toHaveBeenCalled();
  });

  it("refuses Request changes with nothing written", () => {
    actions = [action({ kind: "content_approval" })];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(reviewMutate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tell us what to change" }));
  });

  it("sends the comment with a changes request", () => {
    actions = [action({ kind: "campaign_approval" })];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    fireEvent.change(screen.getByLabelText("Your response"), { target: { value: "Swap the headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(reviewMutate).toHaveBeenCalledWith({ id: "a1", approved: false, comment: "Swap the headline" });
  });

  it("says so when there is nothing to do", () => {
    actions = [];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});

/* The doctrine's derived kinds are acted on where they live. */
describe("the kinds that are not an ask BES typed", () => {
  it("links an unsigned agreement to the signing page and a past-due invoice to Billing", () => {
    actions = [
      action({ kind: "signature", source: "signature_request", sourceId: "s1", title: "Service Agreement", href: "/sign/tok", dueOn: "2026-10-15" }),
      action({ kind: "billing", source: "invoice", sourceId: "i1", title: "Invoice INV-000183 is past due", href: "/partner/billing" }),
      action({ kind: "project_approval", source: "requirement", sourceId: "r1", title: "Logo files", href: "/partner/services" }),
    ];
    render(<MemoryRouter><PortalActionNeeded /></MemoryRouter>);
    expect(screen.getByText("Agreement to sign")).toBeTruthy();
    expect(screen.getByRole("link", { name: /review and sign/i }).getAttribute("href")).toBe("/sign/tok");
    expect(screen.getByRole("link", { name: /view invoice/i }).getAttribute("href")).toBe("/partner/billing");
    expect(screen.getByRole("link", { name: /view project/i }).getAttribute("href")).toBe("/partner/services");
    expect(screen.queryByRole("button", { name: /^review$/i })).toBeNull();
  });
});

