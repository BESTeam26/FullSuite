import {
  SERVICE_LABELS,
  SERVICE_STATE_LABELS,
  type ClientService,
} from "@/lib/clients/client-directory-domain";

/**
 * One service relationship, said in one pill.
 *
 * Each state gets its own surface AND its own foreground, never a foreground
 * alone (rule 15) — a pill that inherits the row's text colour is the same bug
 * as white text on a light card, just quieter.
 */
const STATE_TONE: Record<ClientService["state"], string> = {
  active: "border-emerald-600/30 bg-emerald-500/10 text-status-success",
  paused: "border-amber-600/30 bg-amber-500/10 text-status-warning",
  archived: "border-border bg-muted text-muted-foreground",
  "not-enrolled": "border-dashed border-border bg-transparent text-muted-foreground",
};

export const ServiceBadge = ({ service, showState = false }: { service: ClientService; showState?: boolean }) => (
  <span
    title={`${SERVICE_LABELS[service.service]} — ${SERVICE_STATE_LABELS[service.state]}: ${service.detail}`}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATE_TONE[service.state]}`}
  >
    {SERVICE_LABELS[service.service]}
    {showState && (
      <span className="font-normal opacity-80">· {SERVICE_STATE_LABELS[service.state]}</span>
    )}
  </span>
);
