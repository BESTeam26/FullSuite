/**
 * The Activity column's arithmetic: what nests, what stays at the top, and
 * what order each ends up in.
 *
 * All of it is easy to get subtly wrong and invisible when it is — a reply
 * that silently disappears because its parent was filtered out looks exactly
 * like a reply nobody wrote.
 */
import { describe, expect, it } from "vitest";
import { threadPosts } from "./use-client-posts";

type Row = Parameters<typeof threadPosts>[0][number];

const row = (over: Partial<Row> & { activity_id: number | null; happened_at: string }): Row => ({
  kind: "comment",
  parent_id: null,
  actor: "Jet Manugas",
  actor_id: "u1",
  title: "Internal note",
  detail: "…",
  imported: false,
  reactions: [],
  file: null,
  ...over,
} as Row);

describe("the activity feed", () => {
  it("keeps the newest first, because that is what somebody picking a file up needs", () => {
    const out = threadPosts([
      row({ activity_id: 3, happened_at: "2026-09-24T10:00:00Z" }),
      row({ activity_id: 2, happened_at: "2026-09-20T10:00:00Z" }),
      row({ activity_id: 1, happened_at: "2026-01-02T10:00:00Z" }),
    ]);
    expect(out.map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it("nests a reply under its parent and reads the thread oldest-first", () => {
    /* The list around a thread runs newest-first; inside it, a reply above the
       thing it answers is nonsense. */
    const out = threadPosts([
      row({ activity_id: 10, happened_at: "2026-09-24T09:00:00Z" }),
      row({ activity_id: 12, parent_id: 10, happened_at: "2026-09-24T11:00:00Z" }),
      row({ activity_id: 11, parent_id: 10, happened_at: "2026-09-24T10:00:00Z" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].replies.map((r) => r.id)).toEqual([11, 12]);
  });

  it("shows a reply whose parent is missing rather than dropping it", () => {
    /* Somebody wrote it. A filtered-out or deleted parent must not take the
       reply with it — that is a silent loss of somebody's words. */
    const out = threadPosts([
      row({ activity_id: 99, parent_id: 4242, happened_at: "2026-09-24T09:00:00Z" }),
    ]);
    expect(out.map((p) => p.id)).toEqual([99]);
  });

  it("keeps file entries at the top level, with nothing to reply to", () => {
    /* A file has no activity id, so it can carry neither a reaction nor a
       reply — and must never be mistaken for a parent. */
    const out = threadPosts([
      row({
        kind: "file", activity_id: null, happened_at: "2026-09-24T09:00:00Z",
        title: "Attached report.pdf",
        file: { id: "f1", name: "report.pdf", path: "p", bucket: "b", mime: "application/pdf", size: 2048 },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBeNull();
    expect(out[0].file?.name).toBe("report.pdf");
  });

  it("does not let two file entries collide into one thread", () => {
    /* Both carry a null id. Keying or parenting on that would fold every file
       on the client into a single entry. */
    const out = threadPosts([
      row({ kind: "file", activity_id: null, happened_at: "2026-09-24T09:00:00Z", title: "a.png" }),
      row({ kind: "file", activity_id: null, happened_at: "2026-09-23T09:00:00Z", title: "b.png" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.replies.length === 0)).toBe(true);
  });

  it("an empty feed is an empty list, not a crash", () => {
    expect(threadPosts([])).toEqual([]);
  });
});
