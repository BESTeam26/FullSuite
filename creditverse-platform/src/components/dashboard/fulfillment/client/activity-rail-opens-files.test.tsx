/**
 * A file in the Activity column opens (Dee, 2026-10-14: "cant view PDF that's
 * attached to the activity"). The card for a non-image file was a plain box —
 * visible, unclickable. It is now a button that signs the object on the click
 * and shows it in the in-app viewer. Pictures keep their inline preview.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClientPost } from "@/lib/data/use-client-posts";

const signed = vi.fn(async () => ({ data: { signedUrl: "https://signed.example/report.pdf?token=t" }, error: null }));
const from = vi.fn(() => ({ createSignedUrl: signed }));
let viewerProps: { files: { url: string; name: string; type: string }[] } | null = null;
let posts: ClientPost[] = [];

vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({ storage: { from } }) }));
vi.mock("@/lib/data/use-file-previews", () => ({ useFilePreviews: () => ({ data: {} }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/dashboard/fulfillment/FileViewer", () => ({
  FileViewer: (p: { files: { url: string; name: string; type: string }[] }) => { viewerProps = p; return <div data-testid="viewer" />; },
}));
vi.mock("@/lib/data/use-client-posts", () => {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    clientPostsKey: (id: string) => ["creditops", "posts", id],
    useClientPosts: () => ({ data: posts, isLoading: false }),
    useDeletePost: idle, useEditPost: idle, useReactToPost: idle, useReplyToPost: idle,
  };
});

import { ClientActivityRail } from "./ClientActivityRail";

const post = (file: ClientPost["file"]): ClientPost => ({
  kind: "file", id: null, parentId: null, at: "2026-10-14T21:10:20Z", author: "Dee Gallardo", authorId: null,
  title: "", detail: null, imported: false, reactions: [], file, edited: false, mine: false, replies: [],
});
const pdf = { id: "f1", name: "Progress-Report-October-2026.pdf", path: "clients/c1/1-Progress-Report-October-2026.pdf", bucket: "bes-files", mime: "application/pdf", size: 1110331 };
const png = { id: "f2", name: "image.png", path: "clients/c1/2-image.png", bucket: "bes-files", mime: "image/png", size: 245965 };

beforeEach(() => { viewerProps = null; signed.mockClear(); from.mockClear(); });

describe("Activity column files open", () => {
  it("a PDF card is a button; clicking it signs the object and opens the viewer", async () => {
    posts = [post(pdf)];
    render(<ClientActivityRail clientId="c1" organizationId={null} composer={null} />);
    const card = screen.getByRole("button", { name: /Progress-Report-October-2026\.pdf/ });
    expect(signed).not.toHaveBeenCalled(); // nothing is signed until somebody asks
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId("viewer")).toBeTruthy());
    expect(from).toHaveBeenCalledWith("bes-files");
    expect(signed).toHaveBeenCalledWith(pdf.path, 600);
    expect(viewerProps?.files[0]).toMatchObject({ url: "https://signed.example/report.pdf?token=t", name: pdf.name, type: "application/pdf" });
  });

  it("a picture keeps its inline preview and is not turned into a file button", () => {
    posts = [post(png)];
    render(<ClientActivityRail clientId="c1" organizationId={null} composer={null} />);
    expect(screen.queryByRole("button", { name: /image\.png/ })).toBeNull();
    expect(screen.getByText(/image\.png/)).toBeTruthy();
  });
});
