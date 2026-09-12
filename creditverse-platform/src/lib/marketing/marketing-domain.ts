/**
 * Sales & Marketing — the module's own rules, with no React and no database.
 *
 * Everything here is a pure function over rows the data layer fetched, so the
 * decisions that matter — what belongs on a day of the calendar, what counts
 * as open, how partners are ordered — can be tested without a browser or a
 * connection (rule 5).
 *
 * ── ONE RECORD, THREE VIEWS ─────────────────────────────────────────────────
 *
 * Dee: "One canonical work_item displayed by publish/scheduled date. Do NOT
 * create duplicate content records just to make the calendar." So there is no
 * `CalendarEntry` type here and there never should be. The calendar groups the
 * same `MarketingWorkItem` rows the task list renders; a post on the 5th and
 * the task that writes it are one row seen from two angles.
 */

/** A row of `marketing_work`. The workspace, partner and status are joined in. */
export interface MarketingWorkItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  partnerGroupId: string | null;
  /** Null for BES's own marketing, which has no partner by design. */
  partnerName: string | null;
  title: string;
  description: string | null;
  priority: "Normal" | "High" | "Urgent";
  assignedTo: string | null;
  assigneeName: string | null;
  teamId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  statusId: string | null;
  statusKey: string | null;
  statusLabel: string | null;
  statusColour: string | null;
  statusPosition: number | null;
  isTerminal: boolean;
  itemTypeId: string | null;
  itemTypeKey: string | null;
  itemTypeLabel: string | null;
  campaignId: string | null;
  campaignName: string | null;
  /** `YYYY-MM-DD`, from the workspace's `publish_at` field. */
  publishOn: string | null;
  channel: string | null;
  contentType: string | null;
}

export interface MarketingPartner {
  id: string;
  name: string;
  partnerName: string | null;
  lifecycle: string | null;
  workspaceId: string | null;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  partnerGroupId: string | null;
  name: string;
  description: string | null;
  ownerId: string | null;
  status: "planned" | "active" | "paused" | "completed" | "archived";
  startsOn: string | null;
  endsOn: string | null;
}

export interface MarketingApproval {
  id: string;
  groupId: string;
  partnerName: string;
  kind: "content_approval" | "campaign_approval";
  status: "open" | "completed" | "cancelled" | "changes_requested";
  title: string;
  detail: string | null;
  workItemId: string | null;
  workTitle: string | null;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
  respondedAt: string | null;
  response: string | null;
  respondedByName: string | null;
}

/** Dee's seven dashboard numbers, as `marketing_overview` returns them. */
export interface MarketingCounters {
  activePartners: number;
  openTasks: number;
  dueToday: number;
  overdue: number;
  contentScheduled: number;
  forInternalReview: number;
  awaitingPartnerApproval: number;
}

export const EMPTY_COUNTERS: MarketingCounters = {
  activePartners: 0, openTasks: 0, dueToday: 0, overdue: 0,
  contentScheduled: 0, forInternalReview: 0, awaitingPartnerApproval: 0,
};

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export const GLOBAL_VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Content Calendar" },
  { id: "campaigns", label: "Campaigns" },
] as const;

export const PARTNER_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Content Calendar" },
  { id: "campaigns", label: "Campaigns" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" },
] as const;

export type GlobalViewId = (typeof GLOBAL_VIEWS)[number]["id"];
export type PartnerViewId = (typeof PARTNER_VIEWS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Ordering and filtering                                              */
/* ------------------------------------------------------------------ */

/**
 * A→Z, the way a person reads a list.
 *
 * Case- and accent-insensitive with numbers compared as numbers, so "Apex 2"
 * sorts after "Apex 10" nowhere. The id breaks ties, because two partners may
 * genuinely share a name and a list whose order changes between renders is a
 * list people lose their place in.
 */
export const compareByName = <T extends { name: string; id: string }>(a: T, b: T): number => {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  return byName !== 0 ? byName : a.id.localeCompare(b.id);
};

export interface WorkFilters {
  /** Free text over the title, partner, campaign and assignee. */
  search?: string;
  statusKey?: string | null;
  assignedTo?: string | null;
  campaignId?: string | null;
  /** Hide finished work. On by default on a board somebody is working from. */
  openOnly?: boolean;
}

export function filterWork(items: MarketingWorkItem[], f: WorkFilters): MarketingWorkItem[] {
  const q = f.search?.trim().toLowerCase() ?? "";
  return items.filter((i) => {
    if (f.openOnly && i.isTerminal) return false;
    if (f.statusKey && i.statusKey !== f.statusKey) return false;
    if (f.assignedTo && i.assignedTo !== f.assignedTo) return false;
    if (f.campaignId && i.campaignId !== f.campaignId) return false;
    if (!q) return true;
    return [i.title, i.partnerName, i.campaignName, i.assigneeName, i.channel, i.contentType]
      .some((v) => v?.toLowerCase().includes(q));
  });
}

/** Newest first inside a status, so a board column reads top-down. */
export const byStatusThenDue = (a: MarketingWorkItem, b: MarketingWorkItem): number => {
  const pos = (a.statusPosition ?? 999) - (b.statusPosition ?? 999);
  if (pos !== 0) return pos;
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return b.createdAt.localeCompare(a.createdAt);
};

/* ------------------------------------------------------------------ */
/* The Content Calendar                                                */
/* ------------------------------------------------------------------ */

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  items: MarketingWorkItem[];
}

/** `YYYY-MM-DD` for a local date, without a timezone round trip through ISO. */
export const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A six-week grid for `month`, each day carrying the work published on it.
 *
 * Weeks start on Sunday and the grid is always 42 cells, so the calendar does
 * not change height between months — a grid that reflows as you page through
 * it moves the thing you were about to click.
 *
 * Items with no publish date are not here. They are not "unscheduled content"
 * needing a home on the calendar; they are tasks, and the task list is where
 * tasks live.
 */
export function calendarGrid(
  month: Date,
  items: MarketingWorkItem[],
  today = new Date(),
): CalendarDay[] {
  const byDay = new Map<string, MarketingWorkItem[]>();
  for (const item of items) {
    if (!item.publishOn) continue;
    const key = item.publishOn.slice(0, 10);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const todayKey = isoDay(today);

  return Array.from({ length: 42 }, (_, n) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    const date = isoDay(d);
    return {
      date,
      dayOfMonth: d.getDate(),
      inMonth: d.getMonth() === month.getMonth(),
      isToday: date === todayKey,
      items: (byDay.get(date) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    };
  });
}

/** The month a calendar should open on: this one. Kept here so tests can fix it. */
export const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);

export const shiftMonth = (d: Date, by: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + by, 1);

export const MONTH_LABEL = (d: Date): string =>
  d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

/* ------------------------------------------------------------------ */
/* Campaign progress                                                   */
/* ------------------------------------------------------------------ */

export interface CampaignProgress {
  total: number;
  done: number;
  /** 0–100, and 0 rather than NaN when a campaign has no work yet. */
  percent: number;
}

export function campaignProgress(items: MarketingWorkItem[], campaignId: string): CampaignProgress {
  const mine = items.filter((i) => i.campaignId === campaignId);
  const done = mine.filter((i) => i.isTerminal).length;
  return {
    total: mine.length,
    done,
    percent: mine.length === 0 ? 0 : Math.round((done / mine.length) * 100),
  };
}
