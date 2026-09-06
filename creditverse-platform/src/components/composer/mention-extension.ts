/**
 * The mention node for the editor.
 *
 * An inline atom: it is one thing, selected and deleted as a unit, and it
 * carries the person's id rather than only their name — so who was meant
 * survives a rename, and the notification is decided from an id, never from
 * text (see `lib/activity/mentions.ts`).
 *
 * The plain-text form is `@Label`, which is what lands in the note's `detail`
 * copy and therefore in search and in older readers.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { MENTION_NODE, mentionText } from "@/lib/activity/mentions";

export const MentionNode = Node.create({
  name: MENTION_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    /* Both attributes live in the document (that is the point — the id is the
       fact), but neither is emitted as a bare HTML attribute: the id goes out
       once as `data-mention-user`, and the label is the element's text. */
    return {
      userId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-mention-user"),
        renderHTML: () => ({}),
      },
      label: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").replace(/^@/, ""),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-mention-user]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-user": node.attrs.userId,
        class: "rounded bg-primary/10 px-1 py-0.5 font-semibold text-primary",
      }),
      mentionText(String(node.attrs.label ?? "")),
    ];
  },

  renderText({ node }) {
    return mentionText(String(node.attrs.label ?? ""));
  },
});
