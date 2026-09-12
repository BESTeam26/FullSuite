/**
 * What a saved client note actually writes.
 *
 * One note, two columns: `description` is the plain text every existing reader
 * uses, `description_body` the same note as a document whose @mentions are
 * nodes carrying a user id. Keeping the decision here rather than inside the
 * card means the rule — and the empty case, which is the one that goes wrong —
 * can be tested without mounting an editor (rule 5).
 */
import { docToPlainText, isDocEmpty, type NoteDoc } from "@/lib/activity/note-body";

export interface ClientNotesPatch {
  description: string | null;
  descriptionBody: NoteDoc | null;
}

/**
 * An emptied note clears BOTH columns.
 *
 * Clearing only the document would leave the old plain text behind in the
 * client list and in search — the note would look deleted on the screen that
 * deleted it and alive everywhere else.
 */
export function clientNotesPatch(doc: NoteDoc): ClientNotesPatch {
  if (isDocEmpty(doc)) return { description: null, descriptionBody: null };
  return { description: docToPlainText(doc), descriptionBody: doc };
}
