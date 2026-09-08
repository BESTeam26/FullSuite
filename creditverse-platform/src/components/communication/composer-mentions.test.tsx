/**
 * The "@" picker, in the composer.
 *
 * WHO may be mentioned is the database's decision (`channel_mentionable`,
 * proved in matrix phase 61). What these cover is the typing: that "@" opens
 * the list, that the list owns Enter while it is open — otherwise pressing
 * Enter to choose Rowell would send the literal text "@Row" — and that the
 * message which leaves the box carries the mention the author chose.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";

const onSend = vi.fn().mockResolvedValue(true);

const PEOPLE = [
  { userId: "11111111-1111-4111-8111-111111111111", name: "Rowell Cruz", hint: "Agent" },
  { userId: "22222222-2222-4222-8222-222222222222", name: "Daniel Reyes", hint: "Team lead" },
];

const composer = (people = PEOPLE) =>
  render(<Composer name="general" onSend={onSend} mentionable={people} />);

const box = () => screen.getByRole("textbox", { name: /Message general/ }) as HTMLTextAreaElement;
const type = (value: string) =>
  fireEvent.change(box(), { target: { value, selectionStart: value.length } });

beforeEach(() => onSend.mockClear());

describe("opening the picker", () => {
  it("offers people once an @ is typed", () => {
    composer();
    type("hi @");
    expect(screen.getByRole("listbox", { name: "Mention someone" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Rowell Cruz/ })).toBeInTheDocument();
  });

  it("narrows as you keep typing", () => {
    composer();
    type("hi @dan");
    expect(screen.getByRole("option", { name: /Daniel Reyes/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Rowell Cruz/ })).not.toBeInTheDocument();
  });

  it("does not open on an email address", () => {
    composer();
    type("write to sam@example.test");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes once the word ends", () => {
    composer();
    type("hi @dan");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    type("hi @dan ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says so plainly when nobody matches", () => {
    composer();
    type("hi @zzz");
    expect(screen.getByText(/Nobody here matches/)).toBeInTheDocument();
    expect(screen.getByText(/You can only mention people you work with/)).toBeInTheDocument();
  });

  it("offers no @ button at all where nobody may be mentioned", () => {
    composer([]);
    expect(screen.getByRole("button", { name: "Mention someone" })).toBeDisabled();
    type("hi @");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("the picker owns Enter while it is open", () => {
  it("chooses the person instead of sending the half-typed name", () => {
    composer();
    type("hi @row");
    fireEvent.keyDown(box(), { key: "Enter" });
    /* Nothing sent: Enter picked. */
    expect(onSend).not.toHaveBeenCalled();
    expect(box().value).toBe("hi @Rowell Cruz ");
  });

  it("sends normally once the picker is closed", () => {
    composer();
    type("hi @row");
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("Escape closes it and leaves the text alone", () => {
    composer();
    type("hi @row");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box().value).toBe("hi @row");
  });
});

describe("what leaves the box", () => {
  it("carries the person the author chose", () => {
    composer();
    type("hi @row");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Rowell Cruz/ }));
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
    const [text, , mentions] = onSend.mock.calls[0];
    expect(text).toBe("hi @Rowell Cruz");
    expect(mentions).toEqual([{ userId: PEOPLE[0].userId, label: "Rowell Cruz" }]);
  });

  it("carries nobody if the author deleted the name again", () => {
    composer();
    type("hi @row");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Rowell Cruz/ }));
    type("never mind");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend.mock.calls[0][2]).toEqual([]);
  });

  it("tells the author who will be notified, before they press Enter", () => {
    composer();
    type("hi @row");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Rowell Cruz/ }));
    expect(screen.getByText("Will notify Rowell Cruz")).toBeInTheDocument();
  });

  it("keeps the picked people when a send is refused (§38)", async () => {
    onSend.mockResolvedValueOnce(false);
    composer();
    type("hi @row");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Rowell Cruz/ }));
    fireEvent.keyDown(box(), { key: "Enter" });
    await vi.waitFor(() => expect(box().value).toBe("hi @Rowell Cruz "));
    /* The draft came back AND so did the mention, so re-sending names the
       same person rather than sending plain text that looks identical. */
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend.mock.calls[1][2]).toEqual([{ userId: PEOPLE[0].userId, label: "Rowell Cruz" }]);
  });
});
