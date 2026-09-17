/**
 * The rail, as a reader scans it.
 *
 * Dee, 2026-09-16: *"Channels, DMs, partner channels, threads and activity all
 * look almost identical … Do not prefix DMs with #. DMs should visually look
 * different from channels."*
 *
 * The grouping RULE is tested in `channel-groups.test.ts`. These cover what the
 * rail does with the groups it is handed — and, mostly, that folding a partner
 * away cannot hide the fact that they are waiting.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConversationGroup } from "./ConversationRail";
import { groupChannels } from "@/lib/communication/channel-groups";
import type { Channel } from "@/lib/data/channels";

const ch = (over: Partial<Channel>): Channel => ({
  id: "c1", organizationId: null, agencyId: "a1", partnerGroupId: null,
  partnerServiceId: null, partnerTopic: null, kind: "topic", name: "general",
  displayName: "general", directUserId: null, purpose: null, openToScope: true,
  archivedAt: null, sharedWithBes: false, auditOnly: false, isManager: false, favourite: false,
  unread: 0, lastMessageAt: null, ...over,
});

const onOpen = vi.fn();
const onToggle = vi.fn();
const draw = (group: ReturnType<typeof groupChannels>[number], folded = new Set<string>()) =>
  render(<ConversationGroup group={group} activeId={null} folded={folded}
    onToggleSection={onToggle} onOpen={onOpen} />);

const groupFor = (channels: Channel[], key: string) =>
  groupChannels(channels).find((g) => g.key === key)!;

beforeEach(() => { onOpen.mockClear(); onToggle.mockClear(); });

describe("a person does not read as a channel", () => {
  it("a direct message shows initials, not a hash", () => {
    draw(groupFor([ch({ id: "d", kind: "direct", displayName: "Rowell Pena" })], "direct"));
    /* The avatar renders initials when there is no photo. */
    expect(screen.getByText("RP")).toBeInTheDocument();
  });

  it("a members-only channel is marked as closed", () => {
    const { container } = draw(groupFor([ch({ openToScope: false })], "internal"));
    expect(container.querySelector(".lucide-lock")).toBeTruthy();
  });

  it("an all-hands channel is not", () => {
    const { container } = draw(groupFor([ch({ openToScope: true })], "internal"));
    expect(container.querySelector(".lucide-lock")).toBeFalsy();
  });
});

describe("folding a partner away", () => {
  const twoPartners = [
    ch({ id: "a1", partnerGroupId: "p1", partnerName: "Acme", displayName: "general", unread: 2 }),
    ch({ id: "a2", partnerGroupId: "p1", partnerName: "Acme", displayName: "support", unread: 3 }),
    ch({ id: "b1", partnerGroupId: "p2", partnerName: "Beta", displayName: "general" }),
  ];

  it("shows the rows when open", () => {
    draw(groupFor(twoPartners, "partners"));
    expect(screen.getByText("support")).toBeInTheDocument();
  });

  it("hides them when folded", () => {
    draw(groupFor(twoPartners, "partners"), new Set(["p1"]));
    expect(screen.queryByText("support")).not.toBeInTheDocument();
  });

  it("still shows what that partner is waiting on", () => {
    /* The whole risk of a fold: hiding the rows must not hide the unread. */
    draw(groupFor(twoPartners, "partners"), new Set(["p1"]));
    expect(screen.getByLabelText("5 unread")).toBeInTheDocument();
  });

  it("leaves the other partner alone", () => {
    draw(groupFor(twoPartners, "partners"), new Set(["p1"]));
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("announces whether it is open, so a keyboard reaches it", () => {
    draw(groupFor(twoPartners, "partners"));
    expect(screen.getByRole("button", { name: /Acme/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles by its own key, not by name", () => {
    draw(groupFor(twoPartners, "partners"));
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    expect(onToggle).toHaveBeenCalledWith("p1");
  });
});

describe("what a row repeats", () => {
  it("drops the partner subtitle once a heading names them", () => {
    const { container } = draw(groupFor([
      ch({ id: "a1", partnerGroupId: "p1", partnerName: "Acme", displayName: "general" }),
      ch({ id: "b1", partnerGroupId: "p2", partnerName: "Beta", displayName: "general" }),
    ], "partners"));
    /* "Acme" appears once — on the heading — not again under its own row. */
    expect(within(container).getAllByText("Acme")).toHaveLength(1);
  });

  it("names a single partner once, on its heading, not under every row", () => {
    /* The live screen showed "Test Partner" three times, once beneath each of
       its three channels, because a lone owner used to skip the heading. */
    const { container } = draw(groupFor([
      ch({ id: "a1", partnerGroupId: "p1", partnerName: "Acme", displayName: "general" }),
      ch({ id: "a2", partnerGroupId: "p1", partnerName: "Acme", displayName: "support" }),
    ], "partners"));
    expect(within(container).getAllByText("Acme")).toHaveLength(1);
  });
});

describe("an audit row", () => {
  it("says you are not in it", () => {
    draw(groupFor([ch({ auditOnly: true })], "administration"));
    expect(screen.getByText(/You are not in them and cannot reply/)).toBeInTheDocument();
  });

  it("never shows an unread badge, however much is unread", () => {
    draw(groupFor([ch({ auditOnly: true, unread: 9 })], "administration"));
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });
});
