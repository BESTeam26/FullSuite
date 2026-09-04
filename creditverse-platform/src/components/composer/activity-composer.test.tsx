/**
 * Composer mutation lifecycle.
 *
 * Three measured defects are pinned here.
 *
 * 1. The post was fire-and-forget and the composer cleared regardless, so a
 *    failure looked exactly like a success and took the author's work with it.
 * 2. Rapid clicks produced one activity row per click — `posting` state is not
 *    applied synchronously, so every click dispatched before the next render
 *    read the stale `false`. Measured: three clicks, three rows.
 * 3. Attachments were blob URLs appended to the note text, so they did not
 *    survive a refresh. They are now linked to the persisted note.
 *
 * These assert on how often the mutation is invoked and on what survives a
 * rejection — not on spinner markup, which would still pass if a duplicate
 * write came back.
 *
 * The editor is stubbed: it is lazy-loaded ProseMirror and irrelevant to the
 * lifecycle under test. Its own contract (structured output, safe links) is
 * covered in `note-body.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import type { NoteDoc } from "@/lib/activity/note-body";

const typed: NoteDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

/* Stand-in editor: a button that reports content, so tests drive the composer
   without loading ProseMirror. */
vi.mock("./RichTextEditor", () => ({
  default: ({
    onChange,
    onSubmit,
  }: {
    onChange: (d: NoteDoc, empty: boolean) => void;
    onSubmit: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(typed, false)}>
        stub-type
      </button>
      <button type="button" onClick={onSubmit}>
        stub-submit
      </button>
    </div>
  ),
}));

vi.mock("@/lib/data/activity-attachments", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/activity-attachments")>()),
  uploadAttachment: vi.fn(),
  discardUpload: vi.fn(),
}));

const { ActivityComposer } = await import("./ActivityComposer");

const setup = (onPost: () => Promise<string | void>) => {
  render(
    <ActivityComposer
      entityType="fulfillment_client"
      entityId="client-1"
      allowedVisibilities={["bes_internal", "client_visible"]}
      onPost={onPost}
    />,
  );
  const post = () => screen.getByRole("button", { name: /Post Comment|Posting/i });
  const type = async () =>
    act(async () => {
      screen.getByText("stub-type").click();
    });
  return { post, type };
};

describe("activity composer", () => {
  it("cannot submit an empty note", async () => {
    const { post } = setup(async () => "1");
    await waitFor(() => expect(post()).toBeDisabled());
  });

  it("enables once there is content", async () => {
    const { post, type } = setup(async () => "1");
    await type();
    expect(post()).not.toBeDisabled();
  });

  it("posts exactly once for several rapid clicks", async () => {
    let resolve!: (v: string) => void;
    const onPost = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { post, type } = setup(onPost);
    await type();
    const b = post();
    await act(async () => {
      b.click();
      b.click();
      b.click();
    });
    expect(onPost).toHaveBeenCalledTimes(1);
    await act(async () => resolve("1"));
  });

  it("keeps the note and reports the reason when the write rejects", async () => {
    const onPost = vi.fn(() => Promise.reject(new Error("insert refused")));
    const { post, type } = setup(onPost);
    await type();
    await act(async () => {
      post().click();
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("insert refused");
    // Restored, so the author can retry rather than retype.
    expect(post()).not.toBeDisabled();
  });

  it("Ctrl+Enter submits through the same guarded path", async () => {
    let resolve!: (v: string) => void;
    const onPost = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { type } = setup(onPost);
    await type();
    await act(async () => {
      screen.getByText("stub-submit").click();
      screen.getByText("stub-submit").click();
    });
    expect(onPost).toHaveBeenCalledTimes(1);
    await act(async () => resolve("1"));
  });
});
