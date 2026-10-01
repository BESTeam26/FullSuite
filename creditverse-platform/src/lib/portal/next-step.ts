/**
 * What the partner reads under "Next step" (PARTNER_PORTAL_DOCTRINE, Dee
 * 2026-10-01). The key comes from `creditops_partner_next_step()`, the one
 * rule over the department status; these are only its words. Nothing here
 * knows a department, an agent or a queue.
 */
export type NextStepKey =
  | "not_started" | "in_progress" | "waiting_for_results" | "waiting_on_client" | "waiting_on_partner" | "completed" | "closed";

export const NEXT_STEP_LABEL: Record<NextStepKey, string> = {
  not_started: "Not started yet",
  in_progress: "BES is working on it",
  waiting_for_results: "Waiting for bureau results",
  waiting_on_client: "Waiting on the client",
  waiting_on_partner: "Waiting on you",
  completed: "Completed",
  closed: "Closed",
};

export const NEXT_STEP_ORDER: NextStepKey[] = [
  "waiting_on_partner", "in_progress", "waiting_on_client", "waiting_for_results", "not_started", "completed", "closed",
];

export function nextStepLabel(key: string | null | undefined): string {
  return (key && (NEXT_STEP_LABEL as Record<string, string>)[key]) || "Not started yet";
}

/** Amber for anything that waits on somebody, green for done, plain otherwise. */
export function nextStepTone(key: string | null | undefined): "waiting" | "done" | "plain" {
  if (key === "waiting_on_partner" || key === "waiting_on_client" || key === "waiting_for_results") return "waiting";
  if (key === "completed" || key === "closed") return "done";
  return "plain";
}
