/**
 * BES runs on one clock: America/New_York.
 *
 * Dee, 2026-09-21: schedules, punches, breaks, lunch, lateness, absence,
 * attendance scoring, EOD deadlines, payroll day boundaries and shift-based
 * leave are all judged in Eastern Time, whatever country the person is in.
 * Half the team works from the Philippines, twelve hours ahead; their device
 * says tomorrow for most of the Eastern working day, and a device has no vote.
 *
 * ── ET, NEVER "EST" ───────────────────────────────────────────────────────
 *
 * Eastern Time alternates between EST and EDT. Copy says "Eastern Time (ET)";
 * a timestamp shows whichever abbreviation is true on that date, from the
 * IANA database rather than an offset somebody typed. Never add or subtract
 * hours by hand.
 */

/** The one canonical zone. Every workforce decision resolves through it. */
export const BES_TZ = "America/New_York";

/** How the zone is named in prose. Not "EST": that is only half the year. */
export const BES_TZ_LABEL = "Eastern Time (ET)";

/** The workday a moment belongs to, in Eastern Time: "2026-09-21". */
export function besWorkDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BES_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "EDT" or "EST", whichever is true on that date. Never hardcoded. */
export function besAbbrev(at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: BES_TZ, timeZoneName: "short" })
    .formatToParts(at).find((p) => p.type === "timeZoneName");
  return part?.value ?? "ET";
}

/** "9:00 AM EDT" — the time in Eastern, with the abbreviation of that date. */
export function besTime(at: Date | string, withZone = true): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: BES_TZ, hour: "numeric", minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" as const } : {}),
  }).format(d);
}

/**
 * The reader's own clock, when it is not Eastern — shown beside ET, never
 * instead of it. Null when the device is already on Eastern, where a second
 * line would say the same thing twice.
 */
export function deviceTimeBeside(at: Date = new Date()): { label: string; time: string } | null {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === BES_TZ) return null;
  const abbrev = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? zone;
  /* Same instant, the device's zone: presentation only. */
  const time = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
  return { label: abbrev, time };
}

/** "9:00 AM – 6:00 PM ET" from two `HH:MM[:SS]` schedule strings. */
export function shiftLabel(start: string, end: string, at: Date = new Date()): string {
  const clock = (hhmm: string) => {
    const [h, m] = hhmm.split(":");
    const d = new Date();
    d.setHours(Number(h), Number(m), 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
  };
  return `${clock(start)} – ${clock(end)} ${besAbbrev(at)}`;
}

/**
 * The same shift in the reader's own city, for the line beneath the ET one:
 *
 *     9:00 AM – 6:00 PM EDT
 *     9:00 PM – 6:00 AM Manila
 *
 * Null when the device is already on Eastern. Presentation only — nothing is
 * ever judged against this, and the stored schedule is not rewritten.
 */
export function shiftInDeviceZone(start: string, end: string, on: Date = new Date()): string | null {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === BES_TZ) return null;

  /* Anchor both ends to a real Eastern day, so DST is the database's problem
     and not an offset arithmetic of ours. */
  const day = besWorkDate(on);
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":");
    /* Build the instant that is `hhmm` Eastern on that day by searching the
       two candidate UTC offsets — correct across both DST boundaries. */
    for (const guess of [4, 5]) {
      const iso = `${day}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00`;
      const d = new Date(`${iso}Z`);
      d.setUTCHours(d.getUTCHours() + guess);
      const back = new Intl.DateTimeFormat("en-GB", { timeZone: BES_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
      if (back === `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`) return d;
    }
    return null;
  };
  const from = at(start), to = at(end);
  if (!from || !to) return null;
  const fmt = (d: Date) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(d);
  /* The city, not the abbreviation: "Manila" reads better than "PST". */
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  return `${fmt(from)} – ${fmt(to)} ${city}`;
}
