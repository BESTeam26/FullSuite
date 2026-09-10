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
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PartnerPortal } from "@/pages/portal/PartnerPortal";
import type {
  AgencyPartner, PartnerFile, PartnerPortalClient, PartnerPortalProject, PartnerPortalRequirement,
} from "@/lib/data/agency-partners";
import type { Channel } from "@/lib/data/channels";
import type { RichMessage } from "@/lib/data/messages";

let partner: AgencyPartner | null;
let channels: Channel[];
let messages: RichMessage[];
let portalClients: PartnerPortalClient[];
let sharedFiles: Partial<PartnerFile>[];
let portalProjects: PartnerPortalProject[];
let portalRequirements: PartnerPortalRequirement[];
const sendMutate = vi.fn().mockResolvedValue({ id: 1 });

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: "contact-1" }, displayName: "Rae Ortiz", signOut: vi.fn() }),
}));
vi.mock("@/lib/data/use-agency-partners", () => ({
  useMyPartner: () => ({ data: partner, isLoading: false }),
  useMyPartnerClients: () => ({ data: portalClients, isLoading: false }),
  useMySharedFiles: () => ({ data: sharedFiles, isLoading: false }),
  useMyPartnerProjects: () => ({ data: portalProjects, isLoading: false }),
  useMyPartnerRequirements: () => ({ data: portalRequirements, isLoading: false }),
}));
vi.mock("@/lib/data/use-channels", () => ({
  useChannels: () => ({ data: channels, isLoading: false }),
  /* A partner contact gets nobody to mention until BES adds them, which the
     database decides — the portal simply renders what comes back. */
  useChannelMentionable: () => ({ data: [] }),
}));
vi.mock("@/lib/data/use-message-realtime", () => ({
  /* Realtime is proved against the live database; the screen tests only need
     it not to open a socket. */
  useMessageRealtime: () => undefined,
}));
vi.mock("@/lib/data/use-messages", () => ({
  useRichMessages: () => ({ data: messages, isLoading: false, refetch: vi.fn() }),
  useThread: () => ({ data: [], isLoading: false }),
  usePins: () => ({ data: [] }),
  useSendMessage: () => ({
    send: { mutateAsync: sendMutate, isPending: false },
    undo: { mutate: vi.fn() }, failed: [], canUndo: null, undoWindowMs: 12000,
    dismissFailed: vi.fn(), clearUndo: vi.fn(),
  }),
  useMessageActions: () => ({
    react: { mutate: vi.fn() }, pin: { mutate: vi.fn() }, remove: { mutate: vi.fn() },
    edit: { mutate: vi.fn() }, attach: { mutate: vi.fn() },
  }),
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
  partnerServiceId: null, kind: "general", name: "General",
  displayName: "General", purpose: "BES and Acme Fulfilment",
  openToScope: true, archivedAt: null, sharedWithBes: false,
  auditOnly: false, isManager: false, unread: 0, lastMessageAt: null,
};

beforeEach(() => {
  portalProjects = [];
  portalRequirements = [];
  partner = PARTNER;
  channels = [CHANNEL];
  messages = [];
  portalClients = [];
  sharedFiles = [];
  sendMutate.mockClear();
});

const CLIENT: PartnerPortalClient = {
  publicId: "BES-1001", name: "Jordan Reyes", email: "jordan@example.test",
  status: "Round Sent - Awaiting Results", round: "Round 2", openItems: 7,
  lifecycle: "active", lastActivityAt: "2026-09-08T12:00:00Z",
  processedOn: null, createdAt: "2026-08-01T00:00:00Z",
};

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
      id: 1, channelId: "c1", authorId: "bes-1", authorName: "Dana Lee", fromBes: true,
      bodyText: "Your round 2 letters went out today.",
      createdAt: "2026-09-06T10:00:00Z", editedAt: null, deleted: false,
      messageType: "message", announcementId: null, announcementTitle: null,
      announcementBody: null, announcementPublishedAt: null, parentMessageId: null,
      replyToId: null, replyToText: null, replyToAuthor: null, replyCount: 0,
      lastReplyAt: null, pinned: false, reactions: [], attachments: [], mentions: [],
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
    expect(sendMutate).toHaveBeenCalledTimes(1);
    expect(sendMutate.mock.calls[0][0].bodyText).toBe("Thanks — any word on the third one?");
  });

  it("shows no conversation at all to somebody with no partner", () => {
    partner = null;
    render(<PartnerPortal />);
    expect(screen.getByText("No portal access")).toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
  });
});

describe("the portal shows one partner's conversations and no others", () => {
  it("ignores a conversation belonging to a different partner", () => {
    channels = [{ ...CHANNEL, id: "other", partnerGroupId: "g2", displayName: "Someone else" }];
    render(<PartnerPortal />);
    expect(screen.getByText(/No conversation has been started yet/)).toBeInTheDocument();
    expect(screen.queryByText("Someone else")).not.toBeInTheDocument();
  });

  it("ignores an archived one — history is kept, not offered as live", () => {
    channels = [{ ...CHANNEL, archivedAt: "2026-09-01T00:00:00Z" }];
    render(<PartnerPortal />);
    expect(screen.getByText(/No conversation has been started yet/)).toBeInTheDocument();
  });
});

describe("the partner's own clients", () => {
  it("shows each client's dispute state — the canonical record, not a copy", () => {
    portalClients = [CLIENT];
    render(<PartnerPortal />);
    expect(screen.getByText("Jordan Reyes")).toBeInTheDocument();
    expect(screen.getByText("Round Sent - Awaiting Results")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
  });

  it("never renders anything BES-internal — no agent, no notes", () => {
    /* The type itself carries no internal fields; this pins the rendered
       columns so a later edit cannot quietly add one. */
    portalClients = [CLIENT];
    render(<PartnerPortal />);
    expect(screen.queryByText(/assigned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();
  });

  it("says honestly when there are no client files yet", () => {
    render(<PartnerPortal />);
    expect(screen.getByText(/No client files yet/)).toBeInTheDocument();
  });

  it("filters by name without dropping the full list's count", () => {
    portalClients = [CLIENT, { ...CLIENT, publicId: "BES-1002", name: "Sam Alvarez", email: "sam@example.test" }];
    render(<PartnerPortal />);
    fireEvent.change(screen.getByPlaceholderText(/Search by name or email/), { target: { value: "sam" } });
    expect(screen.getByText("Sam Alvarez")).toBeInTheDocument();
    expect(screen.queryByText("Jordan Reyes")).not.toBeInTheDocument();
    expect(screen.getByText(/— 2/)).toBeInTheDocument();
  });
});

describe("files shared with the partner", () => {
  it("lists a shared file with a download control", () => {
    sharedFiles = [{ id: "f1", name: "August progress report.pdf", path: "agency/partner/g1/x.pdf",
      sharedAt: "2026-09-05T00:00:00Z", createdAt: "2026-09-05T00:00:00Z",
      mimeType: "application/pdf", sizeBytes: 1000, sharedWithPartner: true, sharedByName: null }];
    render(<PartnerPortal />);
    expect(screen.getByText("August progress report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download/ })).toBeInTheDocument();
  });

  it("says honestly when nothing has been shared", () => {
    render(<PartnerPortal />);
    expect(screen.getByText(/Nothing has been shared yet/)).toBeInTheDocument();
  });
});

describe("the partner's BES CRM build (0293)", () => {
  const PROJECT: PartnerPortalProject = {
    id: "p1", name: "Wavy One — GHL build", businessName: "Wavy One", engines: ["project_setup", "website_funnel"],
    progress: 40, journey: "building", targetGoLive: "2026-10-01", wentLiveAt: null, openRequirements: 1,
  };
  const ASK: PartnerPortalRequirement = {
    id: "r1", projectId: "p1", projectName: "Wavy One — GHL build", label: "Logo files", detail: "SVG or PNG", requestedOn: "2026-09-08T10:00:00Z",
  };

  it("shows the canonical project — business, scope, journey, progress — and what BES needs", () => {
    portalProjects = [PROJECT];
    portalRequirements = [ASK];
    render(<PartnerPortal />);
    expect(screen.getByText("Wavy One — GHL build")).toBeInTheDocument();
    expect(screen.getByText(/Wavy One · Project Setup · Website Funnel/)).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("40% complete")).toBeInTheDocument();
    expect(screen.getByText("Logo files")).toBeInTheDocument();
    expect(screen.getByText(/SVG or PNG/)).toBeInTheDocument();
  });

  it("offers the partner no way to mark a requirement received — BES records the receipt", () => {
    portalProjects = [PROJECT];
    portalRequirements = [ASK];
    render(<PartnerPortal />);
    const section = screen.getByText(/What BES needs from you/i).closest("section") as HTMLElement;
    expect(within(section).queryByRole("button", { name: /received|satisf|done/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("never names who at BES is building it", () => {
    portalProjects = [PROJECT];
    render(<PartnerPortal />);
    expect(screen.queryByText(/led by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assigned/i)).not.toBeInTheDocument();
  });

  it("is absent altogether for a partner with no build — not an empty box", () => {
    render(<PartnerPortal />);
    expect(screen.queryByText(/Your BES CRM builds/i)).not.toBeInTheDocument();
  });
});
