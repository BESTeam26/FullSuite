/**
 * Render a structured note body.
 *
 * Every node becomes a React element. Nothing is ever passed to
 * `dangerouslySetInnerHTML`, so there is no HTML parse step and no sanitizer to
 * keep current — an unrecognised node type simply renders nothing, and an
 * unrecognised mark is dropped. Default deny, by construction (rule 1).
 *
 * Falls back to plain text for the rows written before structured bodies
 * existed, which is most of the timeline.
 */
import { Fragment, type ReactNode } from "react";
import {
  isNoteDoc,
  safeUrl,
  type NoteMark,
  type NoteNode,
} from "@/lib/activity/note-body";

/** Marks we render. Anything else on a text run is ignored. */
function withMarks(text: ReactNode, marks: NoteMark[] | undefined): ReactNode {
  let out = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong className="font-bold">{out}</strong>;
        break;
      case "italic":
        out = <em className="italic">{out}</em>;
        break;
      case "underline":
        out = <u className="underline">{out}</u>;
        break;
      case "strike":
        out = <s className="line-through opacity-80">{out}</s>;
        break;
      case "code":
        out = (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
            {out}
          </code>
        );
        break;
      case "link": {
        const href = safeUrl(mark.attrs?.href);
        // A link whose scheme is not allow-listed keeps its text and loses its
        // href — the reader still sees what was written, and cannot follow it.
        out = href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {out}
          </a>
        ) : (
          <span className="underline decoration-dotted">{out}</span>
        );
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function renderNodes(nodes: NoteNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, i) => (
    <Fragment key={i}>{renderNode(node)}</Fragment>
  ));
}

function renderNode(node: NoteNode): ReactNode {
  switch (node.type) {
    case "text":
      return withMarks(node.text ?? "", node.marks);
    case "hardBreak":
      return <br />;
    case "paragraph":
      return <p className="my-1 leading-relaxed">{renderNodes(node.content)}</p>;
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 3);
      const size =
        level === 1 ? "text-sm" : level === 2 ? "text-[13px]" : "text-xs";
      const Tag = (["h4", "h5", "h6"] as const)[level - 1];
      return (
        <Tag className={`mb-1 mt-2 font-bold text-foreground ${size}`}>
          {renderNodes(node.content)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul className="my-1 list-disc space-y-0.5 pl-5">
          {renderNodes(node.content)}
        </ul>
      );
    case "orderedList":
      return (
        <ol className="my-1 list-decimal space-y-0.5 pl-5">
          {renderNodes(node.content)}
        </ol>
      );
    case "listItem":
      return <li>{renderNodes(node.content)}</li>;
    case "taskList":
      return <ul className="my-1 space-y-1">{renderNodes(node.content)}</ul>;
    case "taskItem":
      return (
        <li className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={node.attrs?.checked === true}
            readOnly
            aria-label="Checklist item"
            className="mt-[3px] h-3 w-3 shrink-0 accent-primary"
          />
          <span
            className={
              node.attrs?.checked === true
                ? "text-muted-foreground line-through"
                : ""
            }
          >
            {renderNodes(node.content)}
          </span>
        </li>
      );
    case "blockquote":
      return (
        <blockquote className="my-1 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
          {renderNodes(node.content)}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre className="my-1 overflow-x-auto rounded-lg bg-muted p-2 font-mono text-[10px] text-foreground">
          <code>{renderNodes(node.content)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr className="my-2 border-border" />;
    default:
      // Unknown node: render its children if it has any, nothing otherwise.
      return node.content ? renderNodes(node.content) : null;
  }
}

export function NoteContent({
  body,
  fallbackText,
}: {
  body: unknown;
  /** Used for rows stored before structured bodies existed. */
  fallbackText: string;
}) {
  if (!isNoteDoc(body)) {
    return (
      <p className="whitespace-pre-wrap leading-relaxed">{fallbackText}</p>
    );
  }
  return <div className="text-xs text-foreground">{renderNodes(body.content)}</div>;
}
