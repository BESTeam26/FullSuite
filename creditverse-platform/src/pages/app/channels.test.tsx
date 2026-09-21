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
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Channels from "@/pages/app/Channels";
import type { Channel } from "@/lib/data/channels";
import type { SearchHit } from "@/lib/data/communication-home";
import type { RichMessage } from "@/lib/data/messages";

let channels: Channel[];
let messages: RichMessage[];
let hits: SearchHit[];
let roster: { kind: "person" | "team"; id: string; name: string; hint: string | null; isManager: boolean }[];
let mentionable: { userId: string; name: string; email?: string | null; hint?: string | null }[];
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
vi.mock("@/lib/data/agency-permissions", () => ({
  useAgencyPermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/lib/data/use-workforce", () => ({
  useWorkforce: () => ({ data: { people: [{ userId: "u2", name: "Rowell" }], teams: [] } }),
}));
vi.mock("@/lib/data/use-message-realtime", () => ({
  /* Realtime is proved against the live database; the screen tests only need
     it not to open a socket. */
  useMessageRealtime: () => undefined,
}));
vi.mock("@/lib/data/communication-home", () => ({
  /* Saved is per-reader state the pane fetches; these tests are about what the
     screen does with messages, not about the saved list. */
  useSavedMessages: () => ({ data: [], isPending: false, isError: false }),
  useToggleSaved: () => ({ mutate: vi.fn() }),
  useCommunicationActivity: () => ({ data: [], isPending: false, isError: false }),
  /* Search now spans messages, channels, people, partners and files, so the
     screen tests drive it through `hits` the way they drove the old one. */
  useCommunicationSearch: () => ({ data: hits, isPending: false, isError: false }),
}));
vi.mock("@/lib/data/use-messages", () => ({
  useRichMessages: () => ({ data: messages, isLoading: false, refetch: vi.fn() }),
  useThread: () => ({ data: [], isLoading: false }),
  usePins: () => ({ data: [] }),
  useChannelFiles: () => ({ data: [], isPending: false, isError: false }),
  useSendMessage: () => ({
    send: { mutateAsync: sendMutate, isPending: false },
    undo: { mutate: vi.fn() },
    failed: [],
    dismissFailed: vi.fn(),
  }),
  useMessageActions: () => ({
    react: { mutate: reactMutate }, pin: { mutate: vi.fn() },
    remove: { mutate: deleteMutate }, edit: { mutate: vi.fn() },
    attach: { mutate: vi.fn() },
  }),
}));
vi.mock("@/lib/data/use-channels", () => ({
  useChannelDetails: () => ({ data: null, isPending: false, isError: false }),
  useChannelPreferences: () => ({
    setFavourite: { mutate: vi.fn(), isPending: false },
    rename: { mutateAsync: vi.fn(), isPending: false },
    setNotifications: { mutate: vi.fn(), isPending: false },
  }),
  useChannelSeenBy: () => ({ data: [] }),
  useChannels: () => ({ data: channels, isLoading: false }),
  useMarkRead: () => ({ mutate: markRead }),
  useMessageSearch: () => ({ data: hits, isLoading: false }),
  useChannelActions: () => ({
    create: { mutateAsync: vi.fn(), isPending: false, isError: false },
    archive: { mutate: vi.fn() }, restore: { mutate: vi.fn() },
    addMember: { mutate: vi.fn(), isPending: false }, removeMember: { mutate: vi.fn() },
    addTeam: { mutate: vi.fn(), isPending: false }, removeTeam: { mutate: vi.fn() },
    openDirect: { mutate: vi.fn() },
    openGroup: { mutateAsync: vi.fn(), isPending: false },
    setVisibility: { mutate: vi.fn(), isPending: false },
  }),
  useChannelMembers: () => ({ data: [] }),
  useChannelTeams: () => ({ data: [] }),
  useChannelMentionable: () => ({ data: mentionable }),
  useChannelRoster: () => ({ data: roster, isPending: false, isError: false }),
}));

const render = (path = "/app/channels") =>
  rtlRender(<MemoryRouter initialEntries={[path]}><Channels /></MemoryRouter>);

const channel = (over: Partial<Channel> = {}): Channel => ({
  id: "c1", organizationId: "org-1", agencyId: null, partnerGroupId: null,
  partnerServiceId: null, partnerTopic: null, kind: "general", name: "General Chat",
  displayName: "General Chat", directUserId: null, purpose: "Everyone in the company.",
  openToScope: false, archivedAt: null, sharedWithBes: false, auditOnly: false,
  isManager: false, favourite: false, canRename: false, unread: 0, lastMessageAt: "2026-09-07T00:00:00Z", ...over,
});

beforeEach(() => {
  channels = [channel()];
  messages = [];
  hits = [];
  mentionable = [{ userId: "u2", name: "Rowell Cruz", email: "rowell@bes.test", hint: "Agent" }];
  roster = [
    { kind: "person" as const, id: "u1", name: "Dee Gallardo", hint: "Admin", isManager: true },
    { kind: "person" as const, id: "u2", name: "Rowell Cruz", hint: "Agent", isManager: false },
  ];
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
    /* The rule is that nothing is opened — asserted by the absence of a
       composer rather than by the exact words of the placeholder, which
       changed when the empty state stopped being a bare sentence. */
    expect(screen.queryByRole("textbox", { name: /Message/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Pick a conversation/)).toBeInTheDocument();
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
  const SEARCH = "Search conversations, people, files";
  const find = (term: string) =>
    fireEvent.change(screen.getByLabelText(SEARCH), { target: { value: term } });

  it("renders the hits it is given", () => {
    hits = [{ kind: "message", refId: "1", channelId: "c9", title: "Dana",
              subtitle: "the letters went out", happenedAt: "2026-09-06T00:00:00Z" }];
    render();
    find("letters");
    expect(screen.getByText(/the letters went out/)).toBeInTheDocument();
  });

  it("groups results by what they are", () => {
    /* Five kinds now, and a reader scanning for a person should not have to
       pick them out of a list of messages. */
    hits = [
      { kind: "message", refId: "1", channelId: "c9", title: "Dana", subtitle: "letters went out", happenedAt: "2026-09-06T00:00:00Z" },
      { kind: "person", refId: "u9", channelId: null, title: "Rowell Pena", subtitle: "rowell@bes.test", happenedAt: "2026-09-06T00:00:00Z" },
      { kind: "partner", refId: "g9", channelId: null, title: "Acme Fulfilment", subtitle: "active", happenedAt: "2026-09-06T00:00:00Z" },
    ];
    render();
    /* Two characters minimum — the rail does not search below that, so a
       one-character term renders the conversation list, not results. */
    find("ac");
    /* Scoped to the results, because the conversation's own tab strip is also
       on screen and also says "Messages" — two different things with the same
       word, in two different regions. */
    const results = screen.getByRole("complementary", { name: /conversations/i });
    expect(within(results).getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Partners")).toBeInTheDocument();
  });

  it("does not offer to open something that is not a conversation", () => {
    /* A person has no channel to jump to. A row that looks clickable and goes
       nowhere is worse than a row that is plainly an answer. */
    hits = [{ kind: "person", refId: "u9", channelId: null, title: "Rowell Pena",
              subtitle: "rowell@bes.test", happenedAt: "2026-09-06T00:00:00Z" }];
    render();
    find("rowell");
    expect(screen.queryByRole("button", { name: /Rowell Pena/ })).not.toBeInTheDocument();
    expect(screen.getByText("Rowell Pena")).toBeInTheDocument();
  });

  it("says plainly when there is nothing, rather than implying nothing exists", () => {
    hits = [];
    render();
    find("zebra");
    expect(screen.getByText("Nothing you can see matches that.")).toBeInTheDocument();
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

  it("a removed message takes its attachments with it (P-049)", () => {
    /* Jet posted a client's credit report by mistake and deleted it; the
       screenshot stayed on screen. A removal that leaves the picture is not
       a removal. */
    messages = [richMessage({
      deleted: true, bodyText: null, authorName: "Jet",
      attachments: [{ id: "f1", name: "credit-report.webp", path: "x/y.webp", mime: "image/webp", size: 32000 }],
    })];
    render();
    expect(screen.queryByText("credit-report.webp")).not.toBeInTheDocument();
  });

  it("shows a tombstone rather than the words that were removed (§32)", () => {
    /* The rule is that a tombstone stands where the message was, so the thread
       keeps its shape and nobody wonders what vanished. Asserted by SHAPE
       rather than by the exact sentence — the wording changed on 2026-09-16
       when Dee asked for it to read more quietly, and a test pinned to the old
       string failed while the behaviour it defends was untouched. */
    messages = [richMessage({ deleted: true, bodyText: "the secret", authorName: "Rowell" })];
    render();
    expect(screen.getByText(/was removed|removed/i)).toBeInTheDocument();
    expect(screen.queryByText(/the secret/)).not.toBeInTheDocument();
  });

  it("the reaction picker stays open after the click that opened it, and closes on a click elsewhere (P-034)", () => {
    messages = [richMessage()];
    render();
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    expect(screen.getByRole("button", { name: "React 👍" })).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "React 👍" })).not.toBeInTheDocument();
  });

  it("picking from the picker reacts", () => {
    messages = [richMessage()];
    render();
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    fireEvent.click(screen.getByRole("button", { name: "React 👍" }));
    expect(reactMutate).toHaveBeenCalledWith({ messageId: 1, emoji: "👍", mine: false });
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
    replyCount: 0, replyParticipants: [], lastReplyAt: null, pinned: false, reactions: [], attachments: [],
    mentions: [],
    ...over,
  };
}

describe("partner channels group under each partner", () => {
  /* Dee, 2026-09-15, from a screenshot of three rows each subtitled "Test
     Partner": "I want to have the channels grouped per Partner if there's
     multiple partners." The domain decides WHEN to split; this checks the rail
     actually renders it, and that the subtitle stops repeating what the
     heading now says. */
  const forPartner = (id: string, name: string, channel_: string) =>
    channel({ id: `${id}-${channel_}`, organizationId: null, partnerGroupId: id,
              partnerName: name, kind: "topic", name: channel_, displayName: channel_ });

  it("one partner: named once on a heading, not under every row", () => {
    channels = [forPartner("p1", "Test Partner", "General"),
                forPartner("p1", "Test Partner", "Support")];
    render();
    const rail = within(screen.getByRole("complementary", { name: "Conversations" }));
    /* Changed 2026-09-16 after seeing production: a lone partner used to skip
       the heading, so its name appeared beneath each of its channels instead
       of once above them. */
    expect(rail.getAllByText("Test Partner")).toHaveLength(1);
    expect(rail.getByRole("button", { name: /Test Partner/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("two partners: a heading each, and the rows stop repeating it", () => {
    channels = [forPartner("p1", "Acme Fulfilment", "General"),
                forPartner("p2", "Prime Capital Group", "General"),
                forPartner("p2", "Prime Capital Group", "Marketing")];
    render();
    /* Scoped to the rail: the OPEN conversation names its owner in its own
       header too, which is right and not what this is about. */
    const rail = within(screen.getByRole("complementary", { name: "Conversations" }));
    /* Each partner named ONCE in the rail — as the section heading, with no
       row repeating it underneath. */
    expect(rail.getAllByText("Acme Fulfilment")).toHaveLength(1);
    expect(rail.getAllByText("Prime Capital Group")).toHaveLength(1);
    /* And every channel is still reachable. */
    expect(rail.getAllByText("General")).toHaveLength(2);
    expect(rail.getByText("Marketing")).toBeInTheDocument();
  });
});

describe("the conversation header says whose it is (2026-09-16)", () => {
  it("names the partner above a partner conversation", () => {
    channels = [channel({
      organizationId: null, partnerGroupId: "g1", partnerName: "Acme Fulfilment",
      serviceName: "CreditOps Fulfillment", displayName: "support",
    })];
    render();
    expect(screen.getAllByText("Acme Fulfilment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CreditOps Fulfillment").length).toBeGreaterThan(0);
  });

  it("says nothing about an owner on an internal channel", () => {
    channels = [channel({ organizationId: null, agencyId: "a1", displayName: "general" })];
    render();
    expect(screen.queryByText(/Fulfilment/)).not.toBeInTheDocument();
  });

  it("shows a person rather than a hash on a direct message", () => {
    /* The avatar falls back to initials, which is how the header proves it is
       not drawing the hash it drew for everything before. */
    channels = [channel({
      kind: "direct", displayName: "Rowell Pena", directUserId: "u2",
      organizationId: null, agencyId: "a1",
    })];
    const { container } = render();
    expect(container.querySelector("header .lucide-hash")).toBeFalsy();
  });
});

describe("one way to reply, and it opens the thread (2026-09-16)", () => {
  /* Dee: "I want the reply drawer instead of just the quote, reply to a
     thread. As simple as that, JUST LIKE SLACK."

     There used to be two mechanisms — a quote-reply that pasted the original
     into the feed, and a thread reply — and the first is why the conversation
     read like Messenger. Neither was ever covered by a test, which is how two
     overlapping ways to do one thing survived this long. */

  it("offers Reply in thread, and no separate quote-reply", () => {
    messages = [richMessage({ id: 7, bodyText: "Good morning" })];
    render();
    fireEvent.mouseOver(screen.getByText("Good morning"));
    expect(screen.getByRole("button", { name: "Reply in thread" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
  });

  it("never renders a quoted original inside the feed", () => {
    /* Even for a message that still CARRIES a quote from before the change:
       the data is kept, the Messenger-style block is not drawn. */
    messages = [richMessage({
      id: 8, bodyText: "happy po",
      replyToId: 7, replyToText: "Good morning", replyToAuthor: "Rowell",
    })];
    render();
    expect(screen.getByText("happy po")).toBeInTheDocument();
    expect(screen.queryByText("Good morning")).not.toBeInTheDocument();
  });

  it("shows the thread as a count, not as repeated replies", () => {
    messages = [richMessage({ id: 9, bodyText: "Standup?", replyCount: 3,
                              lastReplyAt: "2026-09-16T10:02:00Z" })];
    render();
    expect(screen.getByRole("button", { name: /3 replies/ })).toBeInTheDocument();
  });

  it("gives the composer no quoted-message banner to cancel", () => {
    messages = [richMessage({ id: 10, bodyText: "Good morning" })];
    render();
    expect(screen.queryByLabelText("Cancel reply")).not.toBeInTheDocument();
  });
});

describe("the Members tab is a roster, not the mention picker", () => {
  /* Dee, 2026-09-18, on BES Managers / TL Room: "Do not automatically add the
     teams on all Channel Unless it's their team."

     No team had been added — the tab rendered `channel_mentionable`, which
     offers @everyone and any team with one person in the room, so three teams
     appeared to be members of a conversation they had never been added to. It
     also leaves the reader out, because you cannot mention yourself, so the
     count above the list did not match the list. */
  const openMembers = () => {
    render();
    fireEvent.click(screen.getByRole("button", { name: /General Chat/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Members/ }));
  };

  it("names no group targets", () => {
    /* The mention picker's own rows would put an @ in this list. */
    mentionable = [
      { userId: "channel", name: "@everyone", email: null, hint: "Notify everyone here" },
      { userId: "team:t1", name: "@CRM Team", email: null, hint: "Notify the team" },
      { userId: "u2", name: "Rowell Cruz", email: "rowell@bes.test", hint: "Agent" },
    ] as never;
    openMembers();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });

  it("includes you, which the mention picker deliberately does not", () => {
    openMembers();
    expect(screen.getByText("Dee Gallardo")).toBeInTheDocument();
  });

  it("marks a manager as one", () => {
    openMembers();
    expect(screen.getByText("Manager")).toBeInTheDocument();
  });

  it("shows a team only when it is genuinely on the conversation", () => {
    roster = [
      { kind: "team", id: "t1", name: "CRM Team", hint: "4 on this team", isManager: false },
      { kind: "person", id: "u1", name: "Dee Gallardo", hint: "Admin", isManager: true },
    ];
    openMembers();
    expect(screen.getByText("CRM Team")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("says an open conversation has no member list rather than 'nobody'", () => {
    roster = [];
    channels = [channel({ openToScope: true })];
    openMembers();
    expect(screen.getByText(/open to everyone with access/)).toBeInTheDocument();
  });
});
