/**
 * Access is the database's decision and is proven against it separately. What
 * this covers is the part the screen owes the person typing: telling them,
 * before they type, that BES can read this channel — and labelling a message
 * that came from BES so "who am I talking to" is never a guess.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Channels from "@/pages/app/Channels";
import type { Channel, ChannelMessage } from "@/lib/data/channels";

let channels: Channel[];
let messages: ChannelMessage[];
const postMutate = vi.fn();

vi.mock("@/lib/agency-context", () => ({ useAgency: () => ({ activeOrganization: { id: "org-1" } }) }));
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/data/use-channels", () => ({
  useChannels: () => ({ data: channels, isLoading: false }),
  useMessages: () => ({ data: messages, isLoading: false }),
  usePostMessage: () => ({ mutate: postMutate, isPending: false, isError: false }),
}));

const channel = (over: Partial<Channel> = {}): Channel => ({
  id: "c1", organizationId: "org-1", kind: "general", name: "General Chat",
  purpose: "Everyone in the company.", sharedWithBes: false, ...over,
});

beforeEach(() => {
  channels = [channel()];
  messages = [];
  postMutate.mockClear();
});

describe("the boundary is visible before you type", () => {
  it("says nothing about BES on a private channel", () => {
    render(<Channels />);
    expect(screen.queryByText(/Shared with the BES team/)).not.toBeInTheDocument();
    expect(screen.queryByText("BES")).not.toBeInTheDocument();
  });

  it("warns above the conversation when BES can read it", () => {
    channels = [channel({ sharedWithBes: true })];
    render(<Channels />);
    expect(screen.getByText(/Shared with the BES team while your service is active/)).toBeInTheDocument();
    expect(screen.getByText(/They can read and reply here/)).toBeInTheDocument();
  });

  it("marks a shared channel in the list too, before it is opened", () => {
    channels = [channel({ id: "c1", name: "Private", sharedWithBes: false }),
                channel({ id: "c2", name: "Shared", kind: "topic", sharedWithBes: true })];
    render(<Channels />);
    expect(screen.getByText("BES")).toBeInTheDocument();
  });
});

describe("who said it", () => {
  it("labels a message from BES", () => {
    messages = [
      { id: 1, channelId: "c1", authorId: "u2", authorName: "Piper Manager", body: {}, bodyText: "ours", createdAt: "2026-09-01T09:00:00Z", editedAt: null, fromBes: false },
      { id: 2, channelId: "c1", authorId: "b1", authorName: "Ada Manager", body: {}, bodyText: "theirs", createdAt: "2026-09-01T10:00:00Z", editedAt: null, fromBes: true },
    ];
    render(<Channels />);
    expect(screen.getByText("BES team")).toBeInTheDocument();
    expect(screen.getByText("theirs")).toBeInTheDocument();
    expect(screen.getByText("ours")).toBeInTheDocument();
  });
});

describe("being in no channel", () => {
  it("says so plainly rather than showing an empty frame", () => {
    channels = [];
    render(<Channels />);
    expect(screen.getByText("You are not in any channel yet.")).toBeInTheDocument();
    expect(screen.getByText("Pick a channel.")).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("sends on Enter and not on Shift+Enter", () => {
    render(<Channels />);
    const box = screen.getByLabelText("Message General Chat");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(postMutate).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(postMutate).toHaveBeenCalledTimes(1);
    expect(postMutate.mock.calls[0][0].bodyText).toBe("hello");
  });

  it("will not send whitespace", () => {
    render(<Channels />);
    fireEvent.change(screen.getByLabelText("Message General Chat"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("Message General Chat"), { key: "Enter" });
    expect(postMutate).not.toHaveBeenCalled();
  });

  it("sends the same rich-text shape activity notes use, so mentions work", () => {
    render(<Channels />);
    fireEvent.change(screen.getByLabelText("Message General Chat"), { target: { value: "hi" } });
    fireEvent.keyDown(screen.getByLabelText("Message General Chat"), { key: "Enter" });
    expect(postMutate.mock.calls[0][0].body).toEqual({
      type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
  });
});
