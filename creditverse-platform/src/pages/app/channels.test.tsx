/**
 * Communication — what the SCREEN owes the person reading it.
 *
 * Who may see what is the database's decision and is proved against the live
 * database in matrix phase 60 (Dee's tests A–I, 147 checks). None of that is
 * re-asserted here; this file covers the three things the interface adds, each
 * of which is a promise the database cannot keep on its own:
 *
 *   1. A conversation an administrator may only INSPECT is labelled as
 *      administration, kept out of their own conversations, and given no
 *      composer (§17). The row arrives either way — what stops it reading as
 *      "your conversation" is this screen.
 *
 *   2. A shared organization channel says so before somebody types in it.
 *
 *   3. Search shows what came back and nothing else. It does no filtering,
 *      because filtering here would mean the filtering that matters is in the
 *      wrong place (§24).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Channels from "@/pages/app/Channels";
import type { Channel, MessageHit } from "@/lib/data/channels";
import type { RichMessage } from "@/lib/data/messages";

let channels: Channel[];
let messages: RichMessage[];
let hits: MessageHit[];
const sendMutate = vi.fn().mockResolvedValue({ id: 1 });
const reactMutate = vi.fn();
const deleteMutate = vi.fn();
const markRead = vi.fn();

vi.mock("@/lib/agency-context", () => ({
  useAgency: () => ({ activeOrganization: { id: "org-1" }, viewMode: "agency" }),
}));
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, agencyId: "a1" }),
}));
vi.mock("@/lib/data/use-workforce", () => ({
  useWorkforce: () => ({ data: { people: [{ userId: "u2", name: "Rowell" }], teams: [] } }),
}));
vi.mock("@/lib/data/agency-permissions", () => ({
  useAgencyPermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/data/use-messages", () => ({
  useRichMessages: () => ({ data: messages, isLoading: false, refetch: vi.fn() }),
  useThread: () => ({ data: [], isLoading: false }),
  usePins: () => ({ data: [] }),
  useSendMessage: () => ({
    send: { mutateAsync: sendMutate, isPending: false },
    undo: { mutate: vi.fn() },
    failed: [], canUndo: null, undoWindowMs: 12000,
    dismissFailed: vi.fn(), clearUndo: vi.fn(),
  }),
  useMessageActions: () => ({
    react: { mutate: reactMutate }, pin: { mutate: vi.fn() },
    remove: { mutate: deleteMutate }, edit: { mutate: vi.fn() },
    attach: { mutate: vi.fn() },
  }),
}));
vi.mock("@/lib/data/use-channels", () => ({
  useChannels: () => ({ data: channels, isLoading: false }),
  useMarkRead: () => ({ mutate: markRead }),
  useMessageSearch: () => ({ data: hits, isLoading: false }),
  useChannelActions: () => ({
    create: { mutateAsync: vi.fn(), isPending: false, isError: false },
    archive: { mutate: vi.fn() }, restore: { mutate: vi.fn() },
    addMember: { mutate: vi.fn(), isPending: false }, removeMember: { mutate: vi.fn() },
    addTeam: { mutate: vi.fn(), isPending: false }, removeTeam: { mutate: vi.fn() },
    openDirect: { mutate: vi.fn() },
  }),
  useChannelMembers: () => ({ data: [] }),
  useChannelTeams: () => ({ data: [] }),
}));

const render = (path = "/app/channels") =>
  rtlRender(<MemoryRouter initialEntries={[path]}><Channels /></MemoryRouter>);

const channel = (over: Partial<Channel> = {}): Channel => ({
  id: "c1", organizationId: "org-1", agencyId: null, partnerGroupId: null,
  partnerServiceId: null, kind: "general", name: "General Chat",
  displayName: "General Chat", purpose: "Everyone in the company.",
  openToScope: false, archivedAt: null, sharedWithBes: false, auditOnly: false,
  isManager: false, unread: 0, lastMessageAt: "2026-09-07T00:00:00Z", ...over,
});

beforeEach(() => {
  channels = [channel()];
  messages = [];
  hits = [];
  sendMutate.mockClear();
  reactMutate.mockClear();
  deleteMutate.mockClear();
  markRead.mockClear();
});

describe("the boundary is visible before you type", () => {
  it("says nothing about BES on a private channel", () => {
    render();
    expect(screen.queryByText(/Shared with the BES team/)).not.toBeInTheDocument();
  });

  it("warns above the conversation when BES can read it", () => {
    channels = [channel({ sharedWithBes: true })];
    render();
    expect(screen.getByText(/Shared with the BES team while your service is active/)).toBeInTheDocument();
  });

  it("marks a shared channel in the list too, before it is opened", () => {
    channels = [channel({ sharedWithBes: true })];
    render();
    expect(screen.getAllByText("BES").length).toBeGreaterThan(0);
  });

  it("says whether a conversation is members-only or open to everyone", () => {
    channels = [channel({ openToScope: true, partnerGroupId: "g1", organizationId: null })];
    render();
    expect(screen.getByText("Everyone with access")).toBeInTheDocument();
  });
});

describe("administration is not participation (§17)", () => {
  it("groups an audit row apart and says what it is", () => {
    channels = [channel({ id: "c2", auditOnly: true, agencyId: "a1", organizationId: null,
                          displayName: "leadership" })];
    render();
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByText(/You can read these for administration/)).toBeInTheDocument();
  });

  it("gives an audit row no composer at all", () => {
    channels = [channel({ id: "c2", auditOnly: true, agencyId: "a1", organizationId: null,
                          displayName: "leadership" })];
    render();
    expect(screen.getByText(/You are not a member of this conversation and cannot post/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Message/ })).not.toBeInTheDocument();
  });

  it("never shows an unread badge on one — you owe it no reply", () => {
    channels = [channel({ id: "c2", auditOnly: true, unread: 9, agencyId: "a1",
                          organizationId: null, displayName: "leadership" })];
    render();
    expect(screen.queryByLabelText("9 unread")).not.toBeInTheDocument();
  });

  it("does not mark one read on opening it", () => {
    channels = [channel({ id: "c2", auditOnly: true, unread: 9, agencyId: "a1",
                          organizationId: null, displayName: "leadership" })];
    render();
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("unread", () => {
  it("badges a waiting conversation and lists it under Unread", () => {
    channels = [channel({ unread: 3 })];
    render();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getAllByLabelText("3 unread").length).toBeGreaterThan(0);
  });

  it("marks the open conversation read", () => {
    channels = [channel({ unread: 3 })];
    render();
    expect(markRead).toHaveBeenCalledWith("c1");
  });
});

describe("archived conversations keep their history and take no more (§30)", () => {
  it("does not auto-open one — a closed conversation is not where you land", () => {
    channels = [channel({ archivedAt: "2026-09-01T00:00:00Z" })];
    render();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Pick a conversation.")).toBeInTheDocument();
  });

  it("opens read-only when you ask for it, and says why", () => {
    channels = [channel({ archivedAt: "2026-09-01T00:00:00Z" })];
    render();
    fireEvent.click(screen.getByRole("button", { name: /General Chat/ }));
    expect(screen.getByText(/Its history is kept; nobody can add to it/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Message/ })).not.toBeInTheDocument();
  });
});

describe("search shows what came back, and does no filtering of its own (§24)", () => {
  it("renders the hits it is given", () => {
    hits = [{ messageId: 1, channelId: "c9", channelName: "Acme · General",
              authorName: "Dana", bodyText: "the letters went out",
              createdAt: "2026-09-06T00:00:00Z" }];
    render();
    fireEvent.change(screen.getByLabelText("Search messages"), { target: { value: "letters" } });
    expect(screen.getByText("Acme · General")).toBeInTheDocument();
    expect(screen.getByText(/the letters went out/)).toBeInTheDocument();
  });

  it("says plainly when there is nothing, rather than implying nothing exists", () => {
    hits = [];
    render();
    fireEvent.change(screen.getByLabelText("Search messages"), { target: { value: "zebra" } });
    expect(screen.getByText("Nothing in the conversations you can see.")).toBeInTheDocument();
  });
});

describe("who said it", () => {
  it("labels a message from BES", () => {
    messages = [richMessage({ authorName: "Dana Lee", bodyText: "on it", fromBes: true })];
    render();
    expect(screen.getByText("BES team")).toBeInTheDocument();
  });
});

describe("arriving from somewhere else", () => {
  it("opens the channel the URL asked for, not the default one", () => {
    channels = [channel({ id: "c1", displayName: "General Chat" }),
                channel({ id: "c2", kind: "topic", displayName: "Acme Fulfilment",
                          purpose: "BES and Acme" })];
    render("/app/channels?channel=c2");
    expect(screen.getByRole("heading", { name: /Acme Fulfilment/ })).toBeInTheDocument();
  });

  it("lets the list win afterwards — the URL does not pin the page", () => {
    channels = [channel({ id: "c1", displayName: "General Chat" }),
                channel({ id: "c2", kind: "topic", displayName: "Acme Fulfilment" })];
    render("/app/channels?channel=c2");
    fireEvent.click(screen.getAllByRole("button", { name: /General Chat/ })[0]);
    expect(screen.getByRole("heading", { name: /General Chat/ })).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("sends on Enter and not on Shift+Enter", () => {
    render();
    const box = screen.getByRole("textbox", { name: /Message General Chat/ });
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(sendMutate).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(sendMutate).toHaveBeenCalledTimes(1);
  });

  it("carries an idempotency key, so a retry cannot write it twice (§44)", () => {
    render();
    const box = screen.getByRole("textbox", { name: /Message General Chat/ });
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(sendMutate.mock.calls[0][0].clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("clears the composer immediately — sending must feel instant (§42)", () => {
    render();
    const box = screen.getByRole("textbox", { name: /Message General Chat/ }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("");
  });
});

describe("a refused message keeps the draft (§38)", () => {
  it("puts the text back in the box and says why", async () => {
    sendMutate.mockRejectedValueOnce(new Error(
      "Please revise this message before sending. Contains language blocked by BES communication policy."));
    render();
    const box = screen.getByRole("textbox", { name: /Message General Chat/ }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "something blocked" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText(/Please revise this message before sending/)).toBeInTheDocument();
    expect(box.value).toBe("something blocked");
  });
});

describe("message actions respect who wrote it (§71)", () => {
  it("offers Delete on your own message", async () => {
    messages = [richMessage({ authorId: "u1", bodyText: "mine" })];
    render();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("button", { name: /Delete/ })).toBeInTheDocument();
  });

  it("does NOT render Delete on somebody else's — not even disabled", () => {
    messages = [richMessage({ authorId: "someone-else", bodyText: "theirs" })];
    render();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("shows a tombstone rather than the words that were removed (§32)", () => {
    messages = [richMessage({ deleted: true, bodyText: null })];
    render();
    expect(screen.getByText("Message removed")).toBeInTheDocument();
  });

  it("toggles a reaction without a round trip to find out (§20)", () => {
    messages = [richMessage({ reactions: [{ emoji: "✅", count: 2, mine: false }] })];
    render();
    fireEvent.click(screen.getByRole("button", { name: "✅ 2" }));
    expect(reactMutate).toHaveBeenCalledWith({ messageId: 1, emoji: "✅", mine: false });
  });
});

describe("announcement cards render from the announcement, never from a copy", () => {
  it("shows the canonical title and body", () => {
    messages = [richMessage({
      messageType: "announcement", announcementId: "a1",
      announcementTitle: "Office Holiday Schedule",
      announcementBody: "We are closed on the 25th.",
    })];
    render();
    expect(screen.getByText("Office Holiday Schedule")).toBeInTheDocument();
    expect(screen.getByText("We are closed on the 25th.")).toBeInTheDocument();
  });

  it("says nothing about one the reader is not authorized for (§15)", () => {
    messages = [richMessage({
      messageType: "announcement", announcementId: "a1",
      announcementTitle: null, announcementBody: null,
    })];
    render();
    expect(screen.getByText(/not addressed to you/)).toBeInTheDocument();
    expect(screen.queryByText("Office Holiday Schedule")).not.toBeInTheDocument();
  });
});

function richMessage(over: Partial<RichMessage> = {}): RichMessage {
  return {
    id: 1, channelId: "c1", authorId: "u1", authorName: "Dana Lee", fromBes: true,
    bodyText: "hello", createdAt: "2026-09-06T00:00:00Z", editedAt: null, deleted: false,
    messageType: "message", announcementId: null, announcementTitle: null,
    announcementBody: null, announcementPublishedAt: null,
    parentMessageId: null, replyToId: null, replyToText: null, replyToAuthor: null,
    replyCount: 0, lastReplyAt: null, pinned: false, reactions: [], attachments: [],
    ...over,
  };
}
