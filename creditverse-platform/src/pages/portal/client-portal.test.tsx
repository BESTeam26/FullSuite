/**
 * The portal shows a client their own file and nothing else.
 *
 * The access rules are the database's and are proven against the live database
 * separately. These cover what the interface does with what it is handed: a
 * section for a service the client does not have must not appear at all, and
 * an absent value must read as absent rather than as zero or as a blank.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClientPortal from "@/pages/portal/ClientPortal";
import type { PortalHome } from "@/lib/data/client-portal";

let home: PortalHome | null;
let updates: { id: number; action: string; detail: string | null; at: string }[];
let documents: unknown[];
let offers: unknown[];
let diyJourney: unknown;
let diyConsents: { kind: string }[];

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { email: "juno@example.test" } }),
}));

/* DIY is one more thing this client may be doing; these tests are about the
   portal shell, so it is mocked as absent unless a test says otherwise. */
vi.mock("@/lib/data/use-diy", () => ({
  useDiyJourney: () => ({ data: diyJourney, isLoading: false }),
  useDiyConsents: () => ({ data: diyConsents, isLoading: false }),
  useAdvanceDiy: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("@/lib/data/use-client-portal", () => ({
  usePortalHome: () => ({ data: home, isLoading: false }),
  usePortalUpdates: (on: boolean) => ({ data: on ? updates : undefined, isLoading: false }),
  usePortalDocumentRequests: (on: boolean) => ({ data: on ? documents : undefined, isLoading: false }),
  usePortalOffers: (on: boolean) => ({ data: on ? offers : undefined, isLoading: false }),
}));

const base: PortalHome = {
  clientId: "c1", publicId: "CN-4821", fullName: "Juno Logistics",
  organizationName: "Lakeside Partners",
  hasCreditOps: false, creditStatus: null, creditRound: null,
  hasFundingOps: true, fundingStatus: "Offer Received",
  openFundingFiles: 1, openDocumentRequests: 0, presentedOffers: 0, publishedUpdates: 0,
};

beforeEach(() => {
  home = { ...base };
  updates = [];
  documents = [];
  offers = [];
  diyJourney = null;
  diyConsents = [];
});

describe("what the client sees", () => {
  it("leads with who they are and their reference", () => {
    render(<ClientPortal />);
    expect(screen.getByText("Juno Logistics")).toBeInTheDocument();
    expect(screen.getByText("Lakeside Partners")).toBeInTheDocument();
    expect(screen.getByText("Reference CN-4821")).toBeInTheDocument();
  });

  it("shows only the services this client actually has", () => {
    render(<ClientPortal />);
    expect(screen.getByText("Funding")).toBeInTheDocument();
    expect(screen.queryByText("Credit repair")).not.toBeInTheDocument();
  });

  it("shows both when the same client has both", () => {
    home = { ...base, hasCreditOps: true, creditStatus: "In Processing", creditRound: "Round 2" };
    render(<ClientPortal />);
    expect(screen.getByText("Credit repair")).toBeInTheDocument();
    expect(screen.getByText("Funding")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
  });

  it("puts outstanding documents in front of them, because that is the blocker", () => {
    home = { ...base, openDocumentRequests: 3 };
    render(<ClientPortal />);
    expect(screen.getByText("3 documents needed")).toBeInTheDocument();
    expect(screen.getByText("This is what is holding things up.")).toBeInTheDocument();
  });

  it("says nothing about documents when nothing is outstanding", () => {
    render(<ClientPortal />);
    expect(screen.queryByText(/documents? needed/)).not.toBeInTheDocument();
  });

  it("says so plainly when nothing has been published", () => {
    render(<ClientPortal />);
    expect(screen.getByText(/Nothing published yet/)).toBeInTheDocument();
  });

  it("shows a published update when there is one", () => {
    updates = [{ id: 1, action: "Moved to underwriting", detail: "Your file is with the lender.", at: "2026-09-01T10:00:00Z" }];
    render(<ClientPortal />);
    expect(screen.getByText("Moved to underwriting")).toBeInTheDocument();
    expect(screen.getByText("Your file is with the lender.")).toBeInTheDocument();
  });
});

describe("moving around on a phone", () => {
  it("offers the sections along the bottom, where a thumb reaches", () => {
    render(<ClientPortal />);
    const nav = screen.getByRole("navigation", { name: "Portal sections" });
    expect(nav.className).toContain("bottom-0");
    for (const label of ["Home", "Progress", "Documents", "Updates", "Account"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("loads a section only when it is opened", () => {
    documents = [{ id: "d1", documentType: "Bank statement", period: "July 2026", requirement: "required", status: "requested", requestedAt: "2026-08-01T00:00:00Z" }];
    render(<ClientPortal />);
    /* Documents are not fetched while Home is showing. */
    expect(screen.queryByText("Bank statement")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("Bank statement")).toBeInTheDocument();
    expect(screen.getByText("Needed")).toBeInTheDocument();
  });

  it("marks the section you are on", () => {
    render(<ClientPortal />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("tells them where to go to change their details, rather than offering an edit that would not work", () => {
    render(<ClientPortal />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("juno@example.test")).toBeInTheDocument();
    expect(screen.getByText(/message your team/)).toBeInTheDocument();
  });
});

describe("DIY inside the same portal", () => {
  it("is not shown to a client who is not doing it", () => {
    render(<ClientPortal />);
    expect(screen.queryByText("Doing it yourself")).not.toBeInTheDocument();
  });

  it("appears for the same client, without a second identity", () => {
    diyJourney = { clientId: "c1", stage: "consented", roundNumber: 1, identityTheftPathway: false, startedAt: "2026-09-01T00:00:00Z" };
    render(<ClientPortal />);
    expect(screen.getByText("Doing it yourself")).toBeInTheDocument();
    /* Still one person: the header is unchanged. */
    expect(screen.getByText("Juno Logistics")).toBeInTheDocument();
    expect(screen.getByText("Reference CN-4821")).toBeInTheDocument();
  });

  it("names the next step and offers its action", () => {
    diyJourney = { clientId: "c1", stage: "consented", roundNumber: 1, identityTheftPathway: false, startedAt: "2026-09-01T00:00:00Z" };
    render(<ClientPortal />);
    /* Twice on purpose: the call to action, and the same step marked current
       in the map below it. A consumer sees where they are and what to press. */
    expect(screen.getAllByText("Add your credit report")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Upload your report." })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 15")).toBeInTheDocument();
  });

  it("does not ask somebody to consent twice when the consents query is empty", () => {
    /* The stage is proof: the database refuses to leave `enrolled` without a
       consent on record, so a slow query must not re-prompt. */
    diyJourney = { clientId: "c1", stage: "report_added", roundNumber: 1, identityTheftPathway: false, startedAt: "2026-09-01T00:00:00Z" };
    diyConsents = [];
    render(<ClientPortal />);
    expect(screen.queryByText(/Agree how this works before anything else/)).not.toBeInTheDocument();
  });

  it("does hold the gate closed while they are still at enrolment", () => {
    diyJourney = { clientId: "c1", stage: "enrolled", roundNumber: 1, identityTheftPathway: false, startedAt: "2026-09-01T00:00:00Z" };
    diyConsents = [];
    render(<ClientPortal />);
    expect(screen.getByText(/We have no record of your agreement yet/)).toBeInTheDocument();
  });

  it("keeps identity theft as a deliberate, separate route", () => {
    diyJourney = { clientId: "c1", stage: "consented", roundNumber: 1, identityTheftPathway: false, startedAt: "2026-09-01T00:00:00Z" };
    render(<ClientPortal />);
    expect(screen.getByText(/IdentityTheft.gov/)).toBeInTheDocument();
    expect(screen.getByText(/Do not use it for an account that is yours/)).toBeInTheDocument();
  });
});

describe("offers", () => {
  it("shows only what was put in front of them", () => {
    offers = [{ id: "o1", amount: 50000, termText: "12 months", paymentAmount: 1200, paymentFrequency: "weekly", expiresAt: "2026-10-01T00:00:00Z", status: "presented", presentedAt: "2026-09-01T00:00:00Z" }];
    render(<ClientPortal />);
    fireEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByText("$50,000")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
  });

  it("does not imply an offer is coming when none has been presented", () => {
    render(<ClientPortal />);
    fireEvent.click(screen.getByRole("button", { name: "Progress" }));
    expect(screen.getByText(/No offers to look at yet/)).toBeInTheDocument();
  });
});
