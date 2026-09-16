/**
 * Getting a screenshot into a message.
 *
 * Dee, 2026-09-16: *"screenshots / pasted images … drag/drop files … paste
 * screenshots."* None of it existed — the composer had a paperclip and nothing
 * else, so the most common way BES files anything (Cmd-Shift-4, Cmd-V) did
 * nothing at all.
 *
 * These cover the two entry points and, just as importantly, what must NOT
 * happen: pasting ordinary text has to keep behaving like pasting ordinary
 * text, and dragging selected words over the box must not arm a file drop.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";

const onSend = vi.fn().mockResolvedValue(true);
const composer = () => render(<Composer name="general" onSend={onSend} mentionable={[]} />);
const box = () => screen.getByRole("textbox", { name: /Message general/ });

const png = (name = "image.png") =>
  new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

/** A clipboard carrying an image, the shape a screenshot paste arrives in. */
const imageClipboard = (file: File) => ({
  items: [{ kind: "file", type: file.type, getAsFile: () => file }],
  types: ["Files"],
});

const fileDrag = (files: File[]) => ({ files, types: ["Files"], items: [] });

beforeEach(() => onSend.mockClear());

describe("pasting a screenshot", () => {
  it("attaches the pasted image", () => {
    composer();
    fireEvent.paste(box(), { clipboardData: imageClipboard(png()) });
    expect(screen.getByLabelText(/^Remove /)).toBeInTheDocument();
  });

  it("gives an unnamed screenshot a name you can tell apart", () => {
    /* Every clipboard image is called image.png. Two in one conversation are
       indistinguishable, which is the whole problem previews were meant to
       solve. */
    composer();
    fireEvent.paste(box(), { clipboardData: imageClipboard(png()) });
    expect(screen.getByLabelText(/Remove Screenshot /)).toBeInTheDocument();
  });

  it("keeps a real filename when the clipboard supplies one", () => {
    composer();
    fireEvent.paste(box(), { clipboardData: imageClipboard(png("dispute-letter.png")) });
    expect(screen.getByLabelText("Remove dispute-letter.png")).toBeInTheDocument();
  });

  it("leaves a plain text paste completely alone", () => {
    composer();
    fireEvent.paste(box(), { clipboardData: { items: [{ kind: "string", type: "text/plain" }], types: ["text/plain"] } });
    expect(screen.queryByLabelText(/^Remove /)).not.toBeInTheDocument();
  });
});

describe("dropping a file", () => {
  it("attaches what was dropped", () => {
    const { container } = composer();
    const target = container.firstElementChild as HTMLElement;
    fireEvent.drop(target, { dataTransfer: fileDrag([png("proof.png")]) });
    expect(screen.getByLabelText("Remove proof.png")).toBeInTheDocument();
  });

  it("shows a drop target while a file is over the composer", () => {
    const { container } = composer();
    const target = container.firstElementChild as HTMLElement;
    fireEvent.dragEnter(target, { dataTransfer: fileDrag([png()]) });
    expect(screen.getByText("Drop to attach")).toBeInTheDocument();
  });

  it("does not arm for a drag that carries no files", () => {
    /* Dragging selected text across the page must not light up the composer. */
    const { container } = composer();
    const target = container.firstElementChild as HTMLElement;
    fireEvent.dragEnter(target, { dataTransfer: { files: [], types: ["text/plain"], items: [] } });
    expect(screen.queryByText("Drop to attach")).not.toBeInTheDocument();
  });

  it("keeps the target up while the pointer crosses a child element", () => {
    /* dragleave fires on the parent when the pointer enters a child, so a
       boolean flickers the highlight off mid-drag. The depth counter is the
       reason this passes. */
    const { container } = composer();
    const target = container.firstElementChild as HTMLElement;
    const drag = { dataTransfer: fileDrag([png()]) };
    fireEvent.dragEnter(target, drag);
    fireEvent.dragEnter(target, drag);
    fireEvent.dragLeave(target, drag);
    expect(screen.getByText("Drop to attach")).toBeInTheDocument();
  });

  it("never attaches more than one message can carry", () => {
    const { container } = composer();
    const target = container.firstElementChild as HTMLElement;
    fireEvent.drop(target, {
      dataTransfer: fileDrag([1, 2, 3, 4, 5, 6, 7].map((n) => png(`f${n}.png`))),
    });
    expect(screen.getAllByLabelText(/^Remove /)).toHaveLength(5);
  });
});
