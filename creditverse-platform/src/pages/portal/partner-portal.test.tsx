/**
 * The partner's half of one conversation.
 *
 * WHO may read it is the database's decision and is proven against the live
 * database in matrix phase 60 — a contact sees their own partner's channel,
 * not another's, and loses it the moment the contact or the partner is
 * suspended. What these cover is what the SCREEN does with what it is handed:
 * a conversation nobody has started must say so rather than showing a composer
 * that goes nowhere, and a BES reply must be labelled as one.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PartnerPortal } from "@/pages/portal/PartnerPortal";
import type { AgencyPartner } from "@/lib/data/agency-partners";
import type { Channel, ChannelMessage } from "@/lib/data/channels";

let partner: AgencyPartner | null;
let channels: Channel[];
let messages: ChannelMessage[];
const postMutate = vi.fn();

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: "contact-1" }, displayName: "Rae Ortiz", signOut: vi.fn() }),
}));
vi.mock("@/lib/data/use-agency-partners", () => ({
  useMyPartner: () => ({ data: partner, isLoading: false }),
}));
vi.mock("@/lib/data/use-channels", () => ({
  usePartnerChannels: () => ({ data: channels, isLoading: false }),
  useMessages: () => ({ data: messages, isLoading: false }),
  usePostMessage: () => ({ mutate: postMutate, isPending: false, isError: false }),
}));

const PARTNER: AgencyPartner = {
  id: "g1", name: "Acme Fulfilment", companyName: "Acme LLC",
  contactEmail: "ops@acme.test", phone: null, address: null, notes: null,
  primaryContact: null, service: "CreditOps outsourcing", contractRef: null,
  lifecycle: "active", health: null, healthNote: null, healthChangedBy: null,
  healthChangedAt: null, startedOn: null, endedOn: null, saasPlan: null,
  accountManagerId: null, teamId: null, primaryContactId: null,
  legacyClientVolume: null, legacyActiveClients: null, sourceType: "bes",
  credentialMigrationRequired: false, status: "Active", archivedAt: null,
  createdAt: "2026-01-04T00:00:00Z",
};

const CHANNEL: Channel = {
  id: "c1", organizationId: null, agencyId: null, partnerGroupId: "g1",
  kind: "general", name: "General", purpose: "BES and Acme Fulfilment",
  sharedWithBes: false,
};

beforeEach(() => {
  partner = PARTNER;
  channels = [CHANNEL];
  messages = [];
  postMutate.mockClear();
});

describe("the partner portal conversation", () => {
  it("shows the conversation BES opened", () => {
    render(<PartnerPortal />);
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /General/ })).toBeInTheDocument();
    expect(screen.getByText("BES and Acme Fulfilment")).toBeInTheDocument();
  });

  it("says plainly when nobody has started one, rather than showing a dead composer", () => {
    channels = [];
    render(<PartnerPortal />);
    expect(screen.getByText(/No conversation has been started yet/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Message/ })).not.toBeInTheDocument();
  });

  it("labels a message from BES, so who is talking is never a guess", () => {
    messages = [{
      id: 1, channelId: "c1", authorId: "bes-1", authorName: "Dana Lee",
      body: {}, bodyText: "Your round 2 letters went out today.",
      createdAt: "2026-09-06T10:00:00Z", editedAt: null, fromBes: true,
    }];
    render(<PartnerPortal />);
    expect(screen.getByText("BES team")).toBeInTheDocument();
    expect(screen.getByText(/round 2 letters went out today/)).toBeInTheDocument();
  });

  it("sends a reply into that same channel", () => {
    render(<PartnerPortal />);
    const box = screen.getByRole("textbox", { name: /Message General/ });
    fireEvent.change(box, { target: { value: "Thanks — any word on the third one?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(postMutate).toHaveBeenCalledTimes(1);
    expect(postMutate.mock.calls[0][0].bodyText).toBe("Thanks — any word on the third one?");
  });

  it("shows no conversation at all to somebody with no partner", () => {
    partner = null;
    render(<PartnerPortal />);
    expect(screen.getByText("No portal access")).toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
  });
});
