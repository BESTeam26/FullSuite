/**
 * Which page opens a notification's subject. Pure and shared: the bell, the
 * Notifications page, the live toast and the push-notify Edge Function (via
 * a relative import) must agree on where "Open" goes.
 */
/**
 * Where a notification leads. Only surfaces that can open a canonical record
 * from the URL are addressable; anything else returns null and the UI says so
 * rather than linking to a page that ignores the id.
 */
export function hrefForEntity(
  entityType: string,
  entityId: string,
): string | null {
  const id = encodeURIComponent(entityId);
  switch (entityType) {
    case "work_item":
      return `/app/my-work?item=${id}`;
    case "fulfillment_client":
      return `/app/creditops?client=${id}`;
    /* A timer notification is about ONE entry, but the page that explains it
       — the entry, the cap, the adjustment request — is My Time itself. */
    case "time_entry":
      return "/app/my-time";
    /* A leave decision is read on My Time; deciding one happens on Team EOD —
       the notification's entity_label says which page it points at. */
    case "leave_request":
      return "/app/my-time";
    /* An agent's payslip lives on My Time; a cutoff is decided on Finance. */
    case "payslip":
      return "/app/my-time";
    case "payroll_cutoff":
      return "/app/finance";
    case "funding_client":
      return `/app/fundingops?client=${id}`;
    /* A mention or a direct message opens the conversation it happened in —
       the same `?channel=` a partner record uses. */
    case "channel":
      return `/app/channels?channel=${id}`;
    /* An EOD notice — yours was submitted, a reminder to file it, or a report
       you received — opens End of Day. */
    case "eod_submission":
    case "eod_day":
      return "/app/eod";
    /* A clock-in or clock-out reminder opens My Time. */
    case "time_clock":
      return "/app/time";
    /* A push delivery warning opens the health card. */
    case "push_delivery":
      return "/app/settings?section=integrations";
    /* The board highlights the one that was announced. */
    case "announcement":
      return `/app/announcements?announcement=${id}`;
    /* A go-live reminder opens the project on the board. */
    case "crm_project":
      return `/app/bes-crm?project=${id}`;
    default:
      return null;
  }
}
