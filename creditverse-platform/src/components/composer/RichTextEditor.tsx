/**
 * The WYSIWYG writing area.
 *
 * Lazy-loaded (see `ActivityComposer`) so the editor bundle is paid for only on
 * screens that actually render a composer — it is dead weight on a dashboard or
 * a queue (rule 14).
 *
 * The toolbar acts on the selection in place; no Markdown syntax is typed or
 * shown. Output is a structured document, never HTML — see `note-body.ts` for
 * why that distinction is the security model rather than a formatting choice.
 */
import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link2,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_DOC, safeUrl, type NoteDoc } from "@/lib/activity/note-body";
import { mentionQueryAt } from "@/lib/activity/mentions";
import { MentionNode } from "@/components/composer/mention-extension";
import { MentionPicker, type MentionCandidate } from "@/components/composer/MentionPicker";

export interface RichTextEditorProps {
  /** Bumping this resets the editor — used to clear after a successful post. */
  resetToken: number;
  disabled?: boolean;
  placeholder?: string;
  onChange: (doc: NoteDoc, isEmpty: boolean) => void;
  /** Ctrl/Cmd+Enter. */
  onSubmit: () => void;
  /** Files pasted or dropped into the writing area. */
  onFiles: (files: File[]) => void;
  /**
   * People this author may mention here — already scoped by the surface
   * (a work item's team, the organization's directory, a channel's members).
   * Omit it and "@" does nothing, which is the right default for a surface
   * that has not decided who is in scope.
   */
  mentionable?: MentionCandidate[];
  /** Signed avatar URLs by path, for the picker. */
  mentionAvatars?: Record<string, string>;
}

interface ToolButton {
  icon: React.ReactNode;
  title: string;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
}

const TOOLS: (ToolButton | "divider")[] = [
  {
    icon: <Bold className="h-3.5 w-3.5" />,
    title: "Bold (Ctrl+B)",
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    icon: <Italic className="h-3.5 w-3.5" />,
    title: "Italic (Ctrl+I)",
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  {
    icon: <UnderlineIcon className="h-3.5 w-3.5" />,
    title: "Underline (Ctrl+U)",
    run: (e) => e.chain().focus().toggleUnderline().run(),
    active: (e) => e.isActive("underline"),
  },
  {
    icon: <Strikethrough className="h-3.5 w-3.5" />,
    title: "Strikethrough",
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive("strike"),
  },
  "divider",
  {
    icon: <Heading2 className="h-3.5 w-3.5" />,
    title: "Heading",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    icon: <List className="h-3.5 w-3.5" />,
    title: "Bulleted list",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    icon: <ListOrdered className="h-3.5 w-3.5" />,
    title: "Numbered list",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    icon: <ListChecks className="h-3.5 w-3.5" />,
    title: "Checklist",
    run: (e) => e.chain().focus().toggleTaskList().run(),
    active: (e) => e.isActive("taskList"),
  },
  "divider",
  {
    icon: <Quote className="h-3.5 w-3.5" />,
    title: "Quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
  {
    icon: <Code className="h-3.5 w-3.5" />,
    title: "Code block",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive("codeBlock"),
  },
  {
    icon: <Link2 className="h-3.5 w-3.5" />,
    title: "Link",
    run: (e) => {
      const current = (e.getAttributes("link").href as string) ?? "";
      const entered = window.prompt("Link URL", current);
      if (entered === null) return;
      if (entered.trim() === "") {
        e.chain().focus().unsetLink().run();
        return;
      }
      // Refused rather than stored: an unsafe scheme must not reach the
      // document at all, so the renderer never has to decide about it.
      const safe = safeUrl(entered);
      if (!safe) {
        window.alert("That link was not added — only http, https, mailto and tel links are allowed.");
        return;
      }
      e.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    },
    active: (e) => e.isActive("link"),
  },
  "divider",
  {
    icon: <Undo2 className="h-3.5 w-3.5" />,
    title: "Undo (Ctrl+Z)",
    run: (e) => e.chain().focus().undo().run(),
  },
  {
    icon: <Redo2 className="h-3.5 w-3.5" />,
    title: "Redo (Ctrl+Shift+Z)",
    run: (e) => e.chain().focus().redo().run(),
  },
];

export default function RichTextEditor({
  resetToken,
  disabled,
  placeholder = "Write a comment or an internal note…",
  onChange,
  onSubmit,
  onFiles,
  mentionable,
  mentionAvatars,
}: RichTextEditorProps) {
  /* The word being typed after an "@", or null. Held here so the picker is a
     plain component and the trigger rule stays in one tested function. */
  const [mentionQuery, setMentionQuery] = useState<{ query: string; from: number } | null>(null);
  const canMention = !!mentionable && mentionable.length > 0;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      MentionNode,
      Link.configure({
        openOnClick: false,
        autolink: true,
        // TipTap's own scheme allow-list, so a pasted javascript: URL never
        // becomes a link mark in the first place.
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose-none min-h-[80px] max-h-[320px] overflow-y-auto px-3 py-2 text-xs leading-relaxed text-foreground focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        onFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(
          (event as DragEvent).dataTransfer?.files ?? [],
        );
        if (files.length === 0) return false;
        event.preventDefault();
        onFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as NoteDoc, e.isEmpty);
      if (!canMention) return;
      /* Only the text of the block the caret sits in is examined, so an "@"
         earlier in the note cannot re-open the picker. */
      const { $from } = e.state.selection;
      const caret = $from.parentOffset;
      const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", " ");
      setMentionQuery(mentionQueryAt(text, caret));
    },
  });

  /**
   * Replace the "@query" the person typed with the mention node. The range is
   * computed from the block the caret is in, so nothing else in the note is
   * touched.
   */
  const insertMention = useCallback(
    (person: MentionCandidate) => {
      if (!editor || !mentionQuery) return;
      const { $from } = editor.state.selection;
      const blockStart = $from.start();
      const from = blockStart + mentionQuery.from;
      const to = blockStart + $from.parentOffset;
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, [
          { type: "mention", attrs: { userId: person.userId, label: person.name } },
          { type: "text", text: " " },
        ])
        .run();
      setMentionQuery(null);
    },
    [editor, mentionQuery],
  );

  /* Cleared only when the parent says the post succeeded. */
  useEffect(() => {
    if (!editor || resetToken === 0) return;
    editor.commands.setContent(EMPTY_DOC);
    onChange(EMPTY_DOC, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    // Same height as the editor, so nothing jumps when it arrives (rule 15).
    return (
      <div className="min-h-[118px] rounded-lg border border-border bg-background" />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background transition-opacity focus-within:ring-1 focus-within:ring-primary",
        disabled && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        {TOOLS.map((tool, i) =>
          tool === "divider" ? (
            <div key={i} className="mx-1 h-4 w-px bg-border" />
          ) : (
            <button
              key={i}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={tool.active?.(editor) ?? undefined}
              disabled={disabled}
              // Keeps the selection: a toolbar button must not steal focus
              // from the text it is about to format.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => tool.run(editor)}
              className={cn(
                "rounded p-1.5 text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-50",
                tool.active?.(editor) && "bg-primary/15 text-primary",
              )}
            >
              {tool.icon}
            </button>
          ),
        )}
      </div>
      <div className="relative">
        <EditorContent editor={editor} />
        {canMention && mentionQuery && editor && (
          <MentionPicker
            query={mentionQuery.query}
            people={mentionable!}
            avatarUrls={mentionAvatars}
            onDismiss={() => setMentionQuery(null)}
            onPick={(person) => insertMention(person)}
          />
        )}
      </div>
    </div>
  );
}
