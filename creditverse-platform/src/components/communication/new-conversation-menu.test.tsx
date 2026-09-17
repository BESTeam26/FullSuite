/**
 * "New" must ask what kind.
 *
 * Dee, 2026-09-17: "when I click New it should give me option to dm or send
 * group chat message to create a group chat." Before this, New meant channel,
 * and starting a DM was an unlabelled dropdown elsewhere in the rail.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NewConversationMenu } from "./NewConversationMenu";

const openGroup = { mutateAsync: vi.fn(async () => "channel-1"), isPending: false };

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("@/lib/data/use-workforce", () => ({
  useWorkforce: () => ({
    isPending: false,
    data: { people: [
      { userId: "me", name: "Dee Gallardo" },
      { userId: "u1", name: "Rowell Pena" },
      { userId: "u2", name: "Allyssa Cruz" },
      { userId: "u3", name: "James Lazo" },
    ] },
  }),
}));
vi.mock("@/lib/data/use-channels", () => ({
  useChannelActions: () => ({ openGroup }),
}));

const setup = (over: Partial<Parameters<typeof NewConversationMenu>[0]> = {}) => {
  const onChannel = vi.fn();
  const onOpened = vi.fn();
  render(<NewConversationMenu canCreateChannel onChannel={onChannel} onOpened={onOpened} {...over} />);
  return { onChannel, onOpened };
};

beforeEach(() => { openGroup.mutateAsync.mockClear(); });

describe("the New menu", () => {
  it("offers all three ways to begin, not just a channel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(screen.getByRole("menuitem", { name: /direct message/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /group chat/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /channel/i })).toBeTruthy();
  });

  it("says what a group chat is, so it is not confused with a channel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(screen.getByText(/a few people, no name needed/i)).toBeTruthy();
    expect(screen.getByText(/a named place with a purpose/i)).toBeTruthy();
  });

  it("hides Channel from somebody who may not create one, and keeps the rest", () => {
    /* Starting a conversation is not gated; creating a CHANNEL is. */
    setup({ canCreateChannel: false });
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(screen.queryByRole("menuitem", { name: /channel/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /direct message/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /group chat/i })).toBeTruthy();
  });

  it("never lists you as somebody to message", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /direct message/i }));
    expect(screen.queryByText("Dee Gallardo")).toBeNull();
    expect(screen.getByText("Rowell Pena")).toBeTruthy();
  });

  it("opens a direct message on one click, with one person", async () => {
    const { onOpened } = setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /direct message/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    await waitFor(() => expect(openGroup.mutateAsync).toHaveBeenCalledWith(["u1"]));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith("channel-1"));
  });

  it("a group chat needs somebody picked before it can start", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /group chat/i }));
    expect(screen.getByText(/pick at least one person/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start/i }).hasAttribute("disabled")).toBe(true);
  });

  it("counts the people including you, because you are in it too", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /group chat/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    fireEvent.click(screen.getByText("Allyssa Cruz"));
    expect(screen.getByText(/3 people, including you/i)).toBeTruthy();
  });

  it("says plainly that one other person is a direct message", () => {
    /* The database sends a two-person group down the DM path, and the menu
       says so rather than letting somebody think they made something else. */
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /group chat/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    expect(screen.getByText(/one person is a direct message/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start direct message/i })).toBeTruthy();
  });

  it("sends everybody picked, in one call", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /group chat/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    fireEvent.click(screen.getByText("James Lazo"));
    fireEvent.click(screen.getByRole("button", { name: /start group chat/i }));
    await waitFor(() => expect(openGroup.mutateAsync).toHaveBeenCalledWith(["u1", "u3"]));
  });

  it("unpicking removes somebody rather than adding them twice", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /group chat/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    fireEvent.click(screen.getByText("Rowell Pena"));
    expect(screen.getByText(/pick at least one person/i)).toBeTruthy();
  });

  it("Channel hands off rather than opening a conversation", () => {
    const { onChannel } = setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /channel/i }));
    expect(onChannel).toHaveBeenCalled();
    expect(openGroup.mutateAsync).not.toHaveBeenCalled();
  });

  it("shows what went wrong instead of closing silently", async () => {
    openGroup.mutateAsync.mockRejectedValueOnce(new Error("That is 17 people — create a channel instead"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /direct message/i }));
    fireEvent.click(screen.getByText("Rowell Pena"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("17 people"));
  });

  it("Escape closes it", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /new/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
