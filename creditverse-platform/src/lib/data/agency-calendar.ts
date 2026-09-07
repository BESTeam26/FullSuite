/**
 * The agency calendar: generated U.S. federal holidays, plus the agency's own
 * closures and events.
 *
 * Generation is idempotent by construction. Every generated row carries a
 * `source_key` unique per agency, so running the sync twice — or fifty times,
 * on every page load — inserts nothing the second time. The same is true of
 * the holiday announcements, which is what stops the team receiving "Upcoming
 * U.S. Holiday: Thanksgiving" nine times.
 */
import { requireSupabase } from "@/lib/supabase/client";
import {
  US_FEDERAL_RULE_VERSION, businessToday, daysBetween, displayName,
  holidaysForYears, type FederalHoliday,
} from "@/lib/calendar/us-federal-holidays";

export type AgencyEventKind = "us_federal_holiday" | "custom_holiday" | "company_event" | "special_workday";

export interface AgencyCalendarEvent {
  id: string;
  kind: AgencyEventKind;
  sourceKey: string | null;
  name: string;
  eventDate: string;
  observedDate: string;
  nonWorking: boolean;
  notes: string | null;
  systemManaged: boolean;
}

const map = (r: Record<string, unknown>): AgencyCalendarEvent => ({
  id: r.id as string,
  kind: r.kind as AgencyEventKind,
  sourceKey: (r.source_key as string) ?? null,
  name: r.name as string,
  eventDate: r.event_date as string,
  observedDate: r.observed_date as string,
  nonWorking: Boolean(r.non_working),
  notes: (r.notes as string) ?? null,
  systemManaged: Boolean(r.system_managed),
});

const COLUMNS = "id, kind, source_key, name, event_date, observed_date, non_working, notes, system_managed";

export async function fetchCalendarEvents(agencyId: string, from: string, to: string): Promise<AgencyCalendarEvent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("agency_calendar_events").select(COLUMNS)
    .eq("agency_id", agencyId)
    .gte("observed_date", from).lte("observed_date", to)
    .order("observed_date");
  if (error) throw error;
  return (data ?? []).map((r) => map(r as Record<string, unknown>));
}

const holidayKey = (h: FederalHoliday) => `us:${h.key}:${h.year}`;

/**
 * Make sure this year and the next two exist as rows.
 *
 * `ignoreDuplicates` on the unique (agency, source_key) index does the work —
 * the second run is a no-op at the database, not a round trip per holiday
 * checking whether it is there.
 */
export async function syncFederalHolidays(agencyId: string, fromYear: number, years = 3): Promise<number> {
  const sb = requireSupabase();
  const holidays = holidaysForYears(fromYear, fromYear + years - 1);
  const rows = holidays.map((h) => ({
    agency_id: agencyId,
    kind: "us_federal_holiday" as const,
    source_key: holidayKey(h),
    name: displayName(h),
    event_date: h.date,
    observed_date: h.observed,
    non_working: true,
    system_managed: true,
    rule_version: US_FEDERAL_RULE_VERSION,
  }));
  const { data, error } = await sb
    .from("agency_calendar_events")
    .upsert(rows as never, { onConflict: "agency_id,source_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/* ── Holiday announcements ────────────────────────────────────────────── */

type Lead = "7d" | "1d" | "day";

const WORDING: Record<Lead, (name: string, when: string) => { title: string; body: string }> = {
  "7d": (name, when) => ({
    title: `Upcoming U.S. Holiday: ${name}`,
    body:
      `BES will observe ${name} on ${when}.\n\n` +
      "Please plan client work, deadlines, handoffs and EOD priorities accordingly.",
  }),
  "1d": (name) => ({
    title: `U.S. Holiday Tomorrow: ${name}`,
    body:
      "BES will observe the holiday tomorrow. Please make sure urgent work and " +
      "handoffs are completed today.",
  }),
  day: (name) => ({
    title: `Today is ${name}`,
    body: "BES is observing the U.S. federal holiday.",
  }),
};

/** Long, readable, and unambiguous — "Friday, 26 November 2026". */
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/**
 * Publish the holiday notices that are due, and only those.
 *
 * Called on load rather than by a scheduler, for the same reason the EOD
 * cutoff is: it is idempotent, so it does not matter how often it runs, and
 * the feature does not depend on a cron job existing. Announcements for a
 * holiday that has passed are never created retrospectively — a notice about
 * last Thursday is noise.
 */
export async function publishDueHolidayAnnouncements(
  agencyId: string,
  today = businessToday(),
): Promise<number> {
  const sb = requireSupabase();
  const year = Number(today.slice(0, 4));
  const holidays = holidaysForYears(year, year + 1);

  const due: { key: string; title: string; body: string }[] = [];
  for (const h of holidays) {
    const away = daysBetween(today, h.observed);
    const lead: Lead | null = away === 7 ? "7d" : away === 1 ? "1d" : away === 0 ? "day" : null;
    if (!lead) continue;
    const { title, body } = WORDING[lead](displayName(h), longDate(h.observed));
    due.push({ key: `holiday:${h.key}:${h.year}:${lead}`, title, body });
  }
  if (due.length === 0) return 0;

  /* Through the writer, not a direct insert. `announcements` deliberately has
     no INSERT policy — authorization lives in the function, and the function
     is what makes this idempotent. */
  let created = 0;
  for (const d of due) {
    const { data, error } = await sb.rpc("publish_holiday_announcement", {
      p_agency: agencyId, p_source_key: d.key, p_title: d.title, p_body: d.body,
    });
    if (error) throw error;
    if (data === true) created += 1;
  }
  return created;
}
