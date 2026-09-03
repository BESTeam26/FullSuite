/**
 * FundingOps client-list helpers.
 *
 * Composes the shared building blocks in ops-client-list-helpers with this
 * division's status vocabulary and its open-files / requested-amount columns.
 */

import { FUNDING_STATUS_TONE } from "@/lib/fulfillment/fundingops-domain";
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
  type ViewPrefs,
} from "./ops-client-list-helpers";

/* Division-prefixed aliases keep existing FundingOps call sites unchanged. */
export const FundingAvatar = Avatar;
export const FundingModeBadge = ModeBadge;
export const FUNDING_EMAIL_RE = EMAIL_RE;
export const FUNDING_PHONE_RE = PHONE_RE;

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export const FundingStatusPill = ({ status }: { status: string }) => (
  <StatusPill status={status} tones={FUNDING_STATUS_TONE} />
);

export const FUNDING_STATUS_OPTIONS = [
  "All Statuses",
  "Onboarding",
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submitted",
  "Stipulations",
  "Offer Received",
  "Funded",
  "Declined",
  "Withdrawn",
  "Archived",
];

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export type FundingColId =
  | "client"
  | "email"
  | "phone"
  | "mode"
  | "status"
  | "agent"
  | "openFiles"
  | "requested"
  | "sla"
  | "lastActivity";

export type FundingColDef = ColDef<FundingColId>;

export const FUNDING_COLUMN_DEFS: FundingColDef[] = [
  CLIENT_COL,
  EMAIL_COL,
  PHONE_COL,
  MODE_COL,
  STATUS_COL,
  AGENT_COL,
  countColumn("openFiles", "Open Files"),
  compactColumn("requested", "Requested"),
  SLA_COL,
  LAST_ACTIVITY_COL,
];

/* ------------------------------------------------------------------ */
/* Saved view preferences                                              */
/* ------------------------------------------------------------------ */

const prefsStore = createViewPrefsStore<FundingColId>(
  "fundingops-clientlist-prefs",
  FUNDING_COLUMN_DEFS,
  "client",
);

export type FundingViewPrefs = ViewPrefs<FundingColId>;
export const defaultFundingPrefs = prefsStore.defaults;
export const loadFundingPrefs = prefsStore.load;
export const saveFundingPrefs = prefsStore.save;
