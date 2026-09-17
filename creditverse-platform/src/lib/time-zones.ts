/**
 * Choosing a timezone.
 *
 * Dee, 2026-09-17: *"For partners, time will follow their Time Zone on all
 * partner GC and Partner Channels, use their own Time Zone."* A partner's zone
 * is therefore a fact somebody has to be able to record, and a free-text box
 * would be the wrong control: `at time zone` silently ignores a name Postgres
 * does not recognise, so "America/New York" with a space would look saved and
 * quietly leave the chat an hour out. The database refuses an unknown name;
 * this list is how a person never produces one.
 */

/** BES's own clock. Every internal conversation is read on it. */
export const BES_TIMEZONE = "America/New_York";

/* Where BES actually works, offered first because it is almost always one of
   these: the four US zones, and the Philippines, where the delivery team is. */
const COMMON = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Asia/Manila",
];

/** Every zone this browser knows, common ones first, each shown with its offset. */
export function timeZoneOptions(at: Date = new Date()): { value: string; label: string }[] {
  const all = supportedTimeZones();
  const rest = all.filter((z) => !COMMON.includes(z));
  return [...COMMON.filter((z) => all.includes(z)), ...rest]
    .map((value) => ({ value, label: `${value.replace(/_/g, " ")} · ${offsetLabel(value, at)}` }));
}

/** "GMT-4", so two similar-looking names can be told apart while choosing. */
export function offsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/* `Intl.supportedValuesOf` is the honest source and is available everywhere
   this app runs; the fallback keeps the control usable rather than empty on a
   runtime that lacks it (jsdom, older Safari). */
function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) return zones;
  } catch { /* not supported */ }
  return COMMON;
}
