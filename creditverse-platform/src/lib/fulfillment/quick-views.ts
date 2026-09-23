/**
 * The four ways an agent slices their queue: mine, unassigned, my team, all.
 *
 * Dee's CreditOps design, 2026-09-23 — "Quick views: work your list your way",
 * drawn as tabs above the list with a live count on each.
 *
 * WHY THIS IS A MODULE AND NOT A `filter` IN THE PANEL
 *
 * The counts on the tabs and the rows in the table must never disagree. If the
 * tab says "Unassigned (5)" and clicking it shows four, the number is not a
 * summary, it is a bug somebody has to reconcile by hand. So one predicate per
 * view, used BOTH to count and to filter, and the tabs cannot drift from the
 * list because they are the same function.
 *
 * It is also the honest place for the definitions. "My Team" is not obvious —
 * it means the file sits with a team I belong to, whoever on it holds the file,
 * which is what makes it useful for covering a colleague. Written here once,
 * beside the others, rather than inferred from a filter expression on a page.
 */

/** A client, narrowed to what deciding a quick view actually needs. */
export interface QuickViewClient {
  assignedAgentId?: string | null;
  teamId?: string;
}

export type QuickViewId = "mine" | "unassigned" | "team" | "all";

export interface QuickViewContext {
  /** The signed-in person. Empty when nobody is signed in. */
  userId: string;
  /** Every team they belong to (`auth.teamIds`). */
  teamIds: readonly string[];
}

/** Each view's rule, in the order the tabs are drawn. */
export const QUICK_VIEWS: { id: QuickViewId; label: string }[] = [
  { id: "mine", label: "Assigned to Me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "team", label: "My Team" },
  { id: "all", label: "All" },
];

export function matchesQuickView(
  client: QuickViewClient,
  view: QuickViewId,
  ctx: QuickViewContext,
): boolean {
  switch (view) {
    case "mine":
      /* Their own name on the file. Not their team's, not their department's —
         the work they are personally answerable for. */
      return !!ctx.userId && client.assignedAgentId === ctx.userId;
    case "unassigned":
      /* Nobody holds it. This is the pile a lead distributes from, so it has
         to mean genuinely nobody, not "nobody I can see". */
      return !client.assignedAgentId;
    case "team":
      /* A file sitting with one of MY teams, whoever on it holds it — the view
         you open to cover for somebody. Their own files are included, because
         excluding them would make "My Team" mean "my team except me". */
      return !!client.teamId && ctx.teamIds.includes(client.teamId);
    case "all":
      return true;
  }
}

/**
 * The counts for the tabs, from ONE pass over the list.
 *
 * Four separate `.filter().length` calls over the same array would give the
 * same answer and read the list four times; on a queue of any size that is
 * work done for a number.
 */
export function quickViewCounts<T extends QuickViewClient>(
  clients: readonly T[],
  ctx: QuickViewContext,
): Record<QuickViewId, number> {
  const counts: Record<QuickViewId, number> = { mine: 0, unassigned: 0, team: 0, all: 0 };
  for (const c of clients) {
    if (matchesQuickView(c, "mine", ctx)) counts.mine += 1;
    if (matchesQuickView(c, "unassigned", ctx)) counts.unassigned += 1;
    if (matchesQuickView(c, "team", ctx)) counts.team += 1;
    counts.all += 1;
  }
  return counts;
}
