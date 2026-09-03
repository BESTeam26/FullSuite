/**
 * Shared activity-timeline domain.
 *
 * Every Managed Operations division keeps the same kind of timeline: system
 * events and human comments against a record, each optionally pinned or tagged
 * with a coloured mark. CreditOps and FundingOps previously declared identical
 * copies of this entry shape and mark palette in their own store-types modules
 * (rule 13); the divisions differ in their department/stage vocabularies, which
 * stay where they belong.
 */

/* ------------------------------------------------------------------ */
/* Timeline entry                                                      */
/* ------------------------------------------------------------------ */

export interface OpsActivityEntry {
  id: string;
  clientId: string;
  timestamp: string; // ISO
  actor: string;
  action: string; // e.g. "Status changed"
  detail: string; // e.g. "In Processing → Ready for QA"
  field?: string;
  previousValue?: string;
  newValue?: string;
  /** Pinned comments stay visible at the top of the timeline. */
  pinned?: boolean;
  /** A colored "mark" flag attached to a comment (ClickUp-style). */
  mark?: string;
}

/* ------------------------------------------------------------------ */
/* Comment marks — ClickUp / Slack-style coloured tags                 */
/* ------------------------------------------------------------------ */

export interface CommentMark {
  id: string;
  label: string;
  /** Tailwind classes for the chip + dot. */
  chip: string;
  dot: string;
  bar: string;
}

export const COMMENT_MARKS: CommentMark[] = [
  {
    id: "important",
    label: "Important",
    chip: "bg-red-500/15 text-red-600 border-red-500/30",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
  {
    id: "question",
    label: "Question",
    chip: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  {
    id: "followup",
    label: "Follow-up",
    chip: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
  },
  {
    id: "resolved",
    label: "Resolved",
    chip: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    id: "idea",
    label: "Idea",
    chip: "bg-violet-500/15 text-violet-600 border-violet-500/30",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
];

export const getMark = (id?: string) => COMMENT_MARKS.find((m) => m.id === id);
