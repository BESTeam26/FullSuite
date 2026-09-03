/**
 * CreditOps client-list helpers.
 *
 * Composes the shared building blocks in ops-client-list-helpers with this
 * division's status vocabulary and its dispute-round / open-items columns.
 */

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
  Onboarding: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "Ready for Processing": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "In Processing": "bg-blue-500/10 text-blue-700 border-blue-500/30",
  "Ready for QA": "bg-amber-500/10 text-amber-700 border-amber-500/30",
  "In Dispute": "bg-purple-500/10 text-purple-700 border-purple-500/30",
  "Awaiting Response": "bg-slate-500/10 text-slate-700 border-slate-500/30",
  "Monitoring Issue": "bg-red-500/10 text-red-700 border-red-500/30",
  Completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Attention: "bg-red-500/10 text-red-700 border-red-500/30",
};

export const FulfillmentStatusPill = ({ status }: { status: string }) => (
  <StatusPill status={status} tones={FULFILLMENT_STATUS_TONE} />
);

export const ALL_STATUS_OPTIONS = [
  "Onboarding",
  "Ready for Processing",
  "In Processing",
  "Ready for QA",
  "In Dispute",
  "Awaiting Response",
  "Monitoring Issue",
  "Attention",
  "Completed",
];

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
  | "agent"
  | "openItems"
  | "sla"
  | "lastActivity";

export const COLUMN_DEFS: ColDef<ColId>[] = [
  CLIENT_COL,
  EMAIL_COL,
  PHONE_COL,
  MODE_COL,
  compactColumn("round", "Round"),
  STATUS_COL,
  AGENT_COL,
  countColumn("openItems", "Open Items"),
  SLA_COL,
  LAST_ACTIVITY_COL,
];

/* ------------------------------------------------------------------ */
/* Saved view preferences                                              */
/* ------------------------------------------------------------------ */

const prefsStore = createViewPrefsStore<ColId>(
  "creditops-clientlist-prefs",
  COLUMN_DEFS,
  "client",
);

export type ViewPrefs = SharedViewPrefs<ColId>;
export const defaultPrefs = prefsStore.defaults;
export const loadPrefs = prefsStore.load;
export const savePrefs = prefsStore.save;
