/**
 * The note body — a structured document, deliberately not HTML.
 *
 * The composer produces a ProseMirror document (plain JSON: nodes, marks,
 * text). It is stored as `activity_events.body` and rendered node by node into
 * React elements.
 *
 * **Why not HTML.** Storing HTML would mean rendering, later, markup that
 * somebody typed or pasted — and the only thing standing between that and
 * script execution would be a sanitizer we had to keep ahead of forever. There
 * is no such surface here: nothing is ever parsed as HTML, and a node type the
 * renderer does not recognise renders as nothing at all. That is a default-deny
 * that holds without anyone maintaining a block-list.
 *
 * `detail` keeps a plain-text rendition of the same content, so search, the
 * existing timeline, notifications and every row written before this all keep
 * working. `body` is additive.
 */

/** A mark on a run of text. Anything not listed here is dropped at render. */
export type NoteMarkType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "link";

export interface NoteMark {
  type: NoteMarkType | string;
  attrs?: Record<string, unknown>;
}

export interface NoteNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteNode[];
  text?: string;
  marks?: NoteMark[];
}

export interface NoteDoc {
  type: "doc";
  content?: NoteNode[];
}

export const EMPTY_DOC: NoteDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Cheap shape check. Anything else is treated as "no structured body". */
export function isNoteDoc(value: unknown): value is NoteDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as NoteDoc).type === "doc"
  );
}

/**
 * Only these URL schemes may become links.
 *
 * `javascript:` is the obvious one, but `data:` is the quieter problem — a
 * `data:text/html` link navigates to attacker-authored markup on our origin.
 * An allow-list is the only version of this check that stays correct.
 */
const SAFE_URL_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const candidate = raw.trim();
  try {
    // A relative URL resolves against the base and inherits its scheme, so
    // this also accepts in-app links without special-casing them.
    const url = new URL(candidate, "https://bes.invalid/");
    return SAFE_URL_SCHEMES.includes(url.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Flatten a document to plain text.
 *
 * Kept in step with the structured body rather than derived at read time, so
 * `detail` is always a faithful rendition — that column is what search, older
 * clients and system tooling read.
 */
export function docToPlainText(doc: unknown): string {
  if (!isNoteDoc(doc)) return "";
  const lines: string[] = [];

  const walk = (nodes: NoteNode[] | undefined, prefix = ""): void => {
    for (const node of nodes ?? []) {
      switch (node.type) {
        case "paragraph":
        case "heading":
        case "codeBlock":
        case "blockquote":
          lines.push(prefix + inline(node.content));
          break;
        case "bulletList":
        case "orderedList":
        case "taskList":
          walk(node.content, prefix);
          break;
        case "listItem":
        case "taskItem": {
          const done = node.attrs?.checked === true ? "[x] " : "";
          const inner = (node.content ?? [])
            .map((c) => inline(c.content))
            .filter(Boolean)
            .join(" ");
          lines.push(`${prefix}• ${done}${inner}`);
          break;
        }
        case "hardBreak":
          lines.push("");
          break;
        default:
          if (node.content) walk(node.content, prefix);
          else if (node.text) lines.push(prefix + node.text);
      }
    }
  };

  const inline = (nodes: NoteNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => (n.type === "hardBreak" ? " " : (n.text ?? inline(n.content))))
      .join("");

  walk(doc.content);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the document carries no visible text. */
export function isDocEmpty(doc: unknown): boolean {
  return docToPlainText(doc).trim().length === 0;
}
