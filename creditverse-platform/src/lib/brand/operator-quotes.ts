/**
 * The operator lines that carry the BES voice on the sign-in page.
 *
 * Dee's own, written 2026-09-11, in the register she asked for: short, sharp,
 * practical, a little clever, and deliberately not over-polished — things
 * somebody who runs an operation would actually say out loud. The first is the
 * line the BES Company Hub has always opened with.
 *
 * WHY THIS IS DATA AND NOT A STRING IN THE PAGE
 *
 * Adding a line is editing this list. Nothing else in the application needs to
 * know, the sign-in page has no branch to add, and the tests below hold the
 * whole set to one standard instead of whichever one happened to be on screen.
 *
 * WHY ONE IS PICKED PER VISIT AND NOT ROTATED ON A TIMER
 *
 * A sign-in page is somewhere people spend eight seconds. Text that changes
 * while they are reading it is movement next to a password field, and Dee
 * asked for no excessive animation. Picked once when the page mounts, it is
 * stable for the whole visit and different the next time.
 */

export const OPERATOR_QUOTES = [
  "If it lives in someone's memory, it's not a system yet.",
  "If nobody owns it, nobody fixes it.",
  "A broken process does not become better because you automated it.",
  "If the team has to ask every time, the process is not clear enough.",
  "More people will not fix work that has no structure.",
  "If you cannot see the status, you do not control the process.",
  "The handoff is usually where the problem starts.",
  "A good system answers questions before someone has to ask them.",
  "If everything needs the owner, the business is not running yet.",
  "People perform better when the next step is obvious.",
  "The process should survive a bad day.",
  "If the same mistake keeps happening, stop fixing the person and fix the process.",
  "A task without an owner is already late.",
  "You should not need a meeting to find out what is happening.",
  "The best automation is the one nobody has to babysit.",
  "If one person leaving breaks the operation, you had dependency, not a system.",
  "Documentation is how experience stops disappearing.",
  "A strong team needs clarity more than another tool.",
  "Busy is not the same as organized.",
  "Good operations make problems visible before they become emergencies.",
  "The system should make the right thing easier to do.",
  "Structure gives good people room to be great.",
  "Process tells people what good looks like.",
  "Systems should reduce questions, not create new ones.",
  "Scale starts when the business stops relying on reminders.",
  "Clear ownership is cheaper than constant follow-up.",
] as const;

export type OperatorQuote = (typeof OPERATOR_QUOTES)[number];

/**
 * One line for this visit.
 *
 * `Math.random` is the right tool here and not a shortcut: nothing depends on
 * which line appears, so there is no seed to keep and nothing to reproduce.
 * Tests pass their own index rather than stubbing the global.
 */
export function pickOperatorQuote(index = Math.floor(Math.random() * OPERATOR_QUOTES.length)): OperatorQuote {
  /* A caller passing a stale or out-of-range index gets a line, not a crash:
     this is decoration, and an empty space where the voice should be is a
     worse outcome than the wrong sentence. */
  const safe = ((Math.trunc(index) % OPERATOR_QUOTES.length) + OPERATOR_QUOTES.length) % OPERATOR_QUOTES.length;
  return OPERATOR_QUOTES[safe];
}
