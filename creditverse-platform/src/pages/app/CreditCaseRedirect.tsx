/**
 * `/app/creditops/cases/:id` — one client, one screen.
 *
 * ── WHY THIS IS A REDIRECT AND NOT A PAGE ─────────────────────────────────
 *
 * There used to be two client screens. The CreditOps workspace opened the
 * operational card; this route opened a nine-tab credit-repair application
 * inherited from the original GHL AI Studio export — different layout,
 * different vocabulary, a hardcoded progress tracker and, until 2026-09-21,
 * a fabricated client identity on every real file.
 *
 * Dee, 2026-09-21: *"I don't intend that to be like disputefox now, I need it
 * to be like ClickUp or monday.com."* Two screens for one client is the
 * problem underneath that: whichever one somebody lands on, it should be the
 * client. So the tools moved onto the card (Credit tools tab) and this route
 * now hands off to the workspace, which opens the same card over the list.
 *
 * The URL is kept rather than deleted. It is linked from the Clients
 * directory, the calendar, notifications and the sidebar, and an old link in
 * somebody's message should still land on the client (rule 6: retire a
 * destination by redirecting it, not by breaking it).
 *
 * `?client=` is the workspace's existing deep link. It resolves the id
 * through the RLS-scoped store, so an id the caller may not see opens
 * nothing and claims nothing.
 */
import { Navigate, useParams } from "react-router-dom";

export default function CreditCaseRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/app/creditops?client=${encodeURIComponent(id)}` : "/app/creditops"} replace />;
}
