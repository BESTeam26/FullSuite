import { describe, expect, it } from "vitest";
import { clientNotesPatch } from "./client-notes";
import { EMPTY_DOC, type NoteDoc } from "@/lib/activity/note-body";

const doc = (...content: unknown[]): NoteDoc =>
  ({ type: "doc", content: [{ type: "paragraph", content: content as never }] }) as NoteDoc;

describe("what a saved client note writes", () => {
  it("clears both columns when the note is emptied", () => {
    /* The failure this guards against is asymmetric deletion: the note
       disappears from the client file and survives in the list and in search. */
    expect(clientNotesPatch(EMPTY_DOC)).toEqual({ description: null, descriptionBody: null });
    expect(clientNotesPatch(doc())).toEqual({ description: null, descriptionBody: null });
  });

  it("keeps the plain-text mirror in step with the document", () => {
    const body = doc({ type: "text", text: "Call before 3pm" });
    expect(clientNotesPatch(body)).toEqual({ description: "Call before 3pm", descriptionBody: body });
  });

  it("writes a mention as text in the mirror and as a node in the document", () => {
    /* The mirror is what a human reads in the list; the node is what the
       database notifies on. Losing either one loses half the feature. */
    const body = doc(
      { type: "text", text: "Ask " },
      { type: "mention", attrs: { userId: "9f2a1c34-5b6d-4e7f-8a9b-0c1d2e3f4a5b", label: "Bryan Breva" } },
      { type: "text", text: " to reimport" },
    );
    const patch = clientNotesPatch(body);
    expect(patch.description).toContain("@Bryan Breva");
    expect(patch.descriptionBody).toBe(body);
  });
});
