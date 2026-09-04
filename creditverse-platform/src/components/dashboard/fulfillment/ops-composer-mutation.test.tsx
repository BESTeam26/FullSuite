/**
 * Comment composer mutation lifecycle.
 *
 * Two measured defects are pinned here.
 *
 * 1. **The post was fire-and-forget and the composer cleared regardless.** A
 *    failed post looked exactly like a successful one and took the author's
 *    text with it.
 * 2. **Rapid clicks produced one activity row per click.** `isPosting` state
 *    is not applied synchronously, so every click dispatched before the next
 *    render read the stale `false`. Measured: three clicks, three rows.
 *
 * These assert on how many times the mutation is actually invoked and on what
 * survives a rejection — not on spinner markup, which would still pass if the
 * duplicate write came back.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import type { ActivityVisibility } from "@/lib/data/activity";

const setup = (onPost: (d: string, v: ActivityVisibility) => Promise<void>) => {
  render(
    <OpsActivityTimeline
      entries={[]}
      actor="Tester"
      emptyMessage="none yet"
      onPostComment={onPost}
      allowedVisibilities={["bes_internal", "client_visible"]}
      onTogglePin={() => {}}
      onSetMark={() => {}}
    />,
  );
  const box = screen.getByPlaceholderText(/Type your comment/i);
  const button = () => screen.getByRole("button", { name: /Post Comment|Posting/i });
  return { box, button };
};

describe("comment composer", () => {
  it("cannot submit with no text and no attachment", () => {
    const { button } = setup(async () => {});
    expect(button()).toBeDisabled();
  });

  it("enables once there is text", () => {
    const { box, button } = setup(async () => {});
    fireEvent.change(box, { target: { value: "hello" } });
    expect(button()).not.toBeDisabled();
  });

  it("posts exactly once for several rapid clicks", async () => {
    let resolve!: () => void;
    const post = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { box, button } = setup(post);
    fireEvent.change(box, { target: { value: "one row only" } });

    const b = button();
    // Dispatched together, before React can re-render and disable the control.
    await act(async () => {
      b.click();
      b.click();
      b.click();
    });
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });

  it("clears only after the write resolves", async () => {
    let resolve!: () => void;
    const post = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { box, button } = setup(post);
    fireEvent.change(box, { target: { value: "still here while pending" } });
    await act(async () => {
      button().click();
    });
    // Mid-flight: text retained, control busy.
    expect((box as HTMLTextAreaElement).value).toBe("still here while pending");
    expect(button()).toBeDisabled();

    await act(async () => resolve());
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
  });

  it("keeps the text and reports the failure when the write rejects", async () => {
    const post = vi.fn(() => Promise.reject(new Error("insert refused")));
    const { box, button } = setup(post);
    fireEvent.change(box, { target: { value: "must not be lost" } });
    await act(async () => {
      button().click();
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("insert refused");
    expect((box as HTMLTextAreaElement).value).toBe("must not be lost");
    // Restored, so the author can retry.
    expect(button()).not.toBeDisabled();
  });
});
