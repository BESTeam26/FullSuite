/**
 * Rich comment renderer — ClickUp / Slack-style markdown-lite.
 *
 * Supports: # / ## / ### headings, > quotes, ```code blocks```,
 * - / * / • bullet lists, 1. / 1) numbered lists, and indentation
 * (leading spaces) for nested quoted/indented blocks.
 */
import { useMemo } from "react";

interface Block {
  type: "heading" | "quote" | "code" | "bullet" | "number" | "text";
  indent: number;
  content: string;
}

/** Parse comment text into renderable blocks. */
function parseRichText(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let codeBuffer: string[] | null = null;
  let codeIndent = 0;

  const pushBuffer = () => {
    if (codeBuffer) {
      blocks.push({
        type: "code",
        indent: codeIndent,
        content: codeBuffer.join("\n"),
      });
      codeBuffer = null;
    }
  };

  for (const raw of lines) {
    const fenceMatch = raw.match(/^(\s*)(```+)/);
    if (fenceMatch) {
      if (codeBuffer) {
        pushBuffer();
      } else {
        codeBuffer = [];
        codeIndent = fenceMatch[1].length;
      }
      continue;
    }
    if (codeBuffer) {
      codeBuffer.push(raw);
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (!line) {
      blocks.push({ type: "text", indent: 0, content: "" });
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push({
        type: "heading",
        indent,
        content: line.replace(/^#{1,3}\s+/, ""),
      });
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push({
        type: "quote",
        indent,
        content: line.replace(/^>\s?/, ""),
      });
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      blocks.push({
        type: "bullet",
        indent,
        content: line.replace(/^[-*•]\s+/, ""),
      });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      blocks.push({
        type: "number",
        indent,
        content: line.replace(/^\d+[.)]\s+/, ""),
      });
      continue;
    }
    blocks.push({ type: "text", indent, content: line });
  }
  pushBuffer();
  return blocks;
}

export function RichComment({ text }: { text: string }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return (
    <div className="space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
      {blocks.map((b, i) => {
        const pad = { marginLeft: `${b.indent * 12}px` };
        switch (b.type) {
          case "heading":
            return (
              <p
                key={i}
                style={pad}
                className="text-xs font-bold text-foreground"
              >
                {b.content}
              </p>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                style={pad}
                className="border-l-2 border-primary/40 bg-primary/5 py-1 pl-2.5 pr-2 italic text-foreground/80"
              >
                {b.content}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                style={pad}
                className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] text-foreground"
              >
                <code>{b.content}</code>
              </pre>
            );
          case "bullet":
            return (
              <div key={i} style={pad} className="flex gap-1.5">
                <span className="mt-0.5 text-primary">•</span>
                <span>{b.content}</span>
              </div>
            );
          case "number":
            return (
              <div key={i} style={pad} className="flex gap-1.5">
                <span className="mt-0.5 font-bold text-primary">{i + 1}.</span>
                <span>{b.content}</span>
              </div>
            );
          default:
            return b.content ? (
              <p key={i} style={pad} className="whitespace-pre-wrap">
                {b.content}
              </p>
            ) : (
              <div key={i} className="h-1" />
            );
        }
      })}
    </div>
  );
}
