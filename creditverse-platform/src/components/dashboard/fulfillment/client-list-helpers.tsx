/**
 * CreditOps client-list helpers.
 *
 * Composes the shared building blocks in ops-client-list-helpers with this
 * division's status vocabulary and its dispute-round / open-items columns.
 */

import { Constants } from "@/lib/supabase/database.types";
import { creditStatuses } from "@/lib/fulfillment/department-domain";
import {
  AGENT_COL,
  Avatar,
  CLIENT_COL,
  EMAIL_COL,
  EMAIL_RE,
  LAST_ACTIVITY_COL,
  MODE_COL,
  ModeBadge,
  PHONE_COL,
  PHONE_RE,
  SLA_COL,
  STATUS_COL,
  StatusPill,
  compactColumn,
  countColumn,
  createViewPrefsStore,
  type ColDef,
  type StatusToneMap,
  type ViewPrefs as SharedViewPrefs,
} from "./ops-client-list-helpers";

export { Avatar, ModeBadge, EMAIL_RE, PHONE_RE };
export type { ColDef };

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const FULFILLMENT_STATUS_TONE: StatusToneMap = {
  Onboarding: "bg-amber-500/10 text-status-warning border-amber-500/30",
  "Ready for Processing": "bg-blue-500/10 text-status-info border-blue-500/30",
  "In Processing": "bg-blue-500/10 text-status-info border-blue-500/30",
  "Ready for QA": "bg-amber-500/10 text-status-warning border-amber-500/30",
  "In Dispute": "bg-purple-500/10 text-status-accent border-purple-500/30",
  "Awaiting Response": "bg-slate-500/10 text-muted-foreground border-slate-500/30",
  "Monitoring Issue": "bg-red-500/10 text-status-danger border-red-500/30",
  Completed: "bg-emerald-500/10 text-status-success border-emerald-500/30",
  Attention: "bg-red-500/10 text-status-danger border-red-500/30",
};

export const FulfillmentStatusPill = ({ status }: { status: string }) => (
  <StatusPill status={status} tones={FULFILLMENT_STATUS_TONE} />
);

/**
 * Dee's credit-status list — the client's general dispute status.
 *
 * This used to be a hand-written list of nine that did NOT contain "Ready for
 * Round 1", "Round Sent - Awaiting Results", "Ready for Reimport / Review" or
 * "Waiting for Partner Approval" — the four values migration 0188 added to the
 * enum precisely because Dee asked for their vocabulary back. The database
 * accepted them and no dropdown offered them, so a file could not be moved
 * out of Onboarding from any screen.
 *
 * Read from the Status Guide's `dispute` category now, in ONE place, so the
 * client list and the client file cannot offer different vocabularies — and so
 * it stays Dee's list rather than the whole enum, which is a union of every
 * department's states (Support, Bureau Calling, QA) and was never the credit
 * vocabulary.
 */
export const ALL_STATUS_OPTIONS: string[] =
  creditStatuses(Constants.public.Enums.fulfillment_client_status);

export const STATUS_OPTIONS = ["All Statuses", ...ALL_STATUS_OPTIONS];

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export type ColId =
  | "client"
  | "email"
  | "phone"
  | "mode"
  | "round"
  | "status"
  | "department"
  | "workStatus"
  | "agent"
  | "openWork"
  | "openItems"
  | "sla"
  | "lastActivity"
  /* The columns Dee's live dispute board actually works from. */
  | "processed"
  | "dueDate"
  | "daysToUpdate"
  | "latestComment";

/* Operational by default (separation step 2): Client · Credit Stage · Credit
   Status · Current Department · Work Status · Assigned To · Open Work · SLA ·
   Last Activity. Contact columns stay available behind "Columns". */
export const COLUMN_DEFS: ColDef<ColId>[] = [
  CLIENT_COL,
  { ...EMAIL_COL, defaultOn: false },
  { ...PHONE_COL, defaultOn: false },
  { ...MODE_COL, defaultOn: false },
  compactColumn("round", "Credit Stage"),
  STATUS_COL,
  { ...compactColumn("department", "Current Department"), defaultWidth: 160, minWidth: 120 },
  { ...compactColumn("workStatus", "Work Status"), defaultWidth: 180, minWidth: 130 },
  AGENT_COL,
  countColumn("openWork", "Open Work"),
  { ...countColumn("openItems", "Open Items"), defaultOn: false },
  SLA_COL,
  LAST_ACTIVITY_COL,
  /* ── The dispute board's own columns ─────────────────────────────────
     Matched to the board Dee runs today: Current Round (Credit Stage,
     above), Processed Date, Due date, Days Before Next Update, Latest
     comment. Days Before Next Update is DERIVED from the due date — storing
     it would be wrong by tomorrow. */
  { ...compactColumn("processed", "Processed Date"), defaultWidth: 130, minWidth: 110 },
  { ...compactColumn("dueDate", "Due Date"), defaultWidth: 130, minWidth: 110 },
  { ...countColumn("daysToUpdate", "Days To Update"), defaultWidth: 130, minWidth: 110 },
  { ...compactColumn("latestComment", "Latest Comment"), defaultWidth: 220, minWidth: 140, defaultOn: false },
];

/* ------------------------------------------------------------------ */
/* Saved view preferences                                              */
/* ------------------------------------------------------------------ */

/* v3: the saved set is a list of column ids, so columns added later are absent
   from it and never appear — Dee's board showed no Processed Date, Due Date or
   Days To Update because their stored preference was written before those
   existed. Bumping the key hands everybody the new defaults once; anyone who
   had hidden a column re-hides it. */
const prefsStore = createViewPrefsStore<ColId>(
  "creditops-clientlist-prefs-v3",
  COLUMN_DEFS,
  "client",
);

export type ViewPrefs = SharedViewPrefs<ColId>;
export const defaultPrefs = prefsStore.defaults;
export const loadPrefs = prefsStore.load;
export const savePrefs = prefsStore.save;
