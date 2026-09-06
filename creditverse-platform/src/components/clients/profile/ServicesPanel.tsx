import { Link } from "react-router-dom";
import { ExternalLink, Layers } from "lucide-react";
import {
  SERVICE_LABELS,
  SERVICE_STATE_LABELS,
  type ClientDirectoryRow,
} from "@/lib/clients/client-directory-domain";

/**
 * Services & Plans — every relationship this person has with the organization,
 * whether or not they hold it.
 *
 * Unlike the directory, this panel shows the services they DON'T have too. That
 * is the point of the record: a DIY client who later buys managed CreditOps is
 * the same client with a new case, and the screen should make that the obvious
 * next move rather than an invitation to create the person again.
 */
const TONE: Record<string, string> = {
  active: "border-emerald-600/30 bg-emerald-500/10",
  paused: "border-amber-600/30 bg-amber-500/10",
  archived: "border-border bg-muted/40",
  "not-enrolled": "border-dashed border-border bg-transparent",
};

const STATE_TEXT: Record<string, string> = {
  active: "text-status-success",
  paused: "text-status-warning",
  archived: "text-muted-foreground",
  "not-enrolled": "text-muted-foreground",
};

export const ServicesPanel = ({ client }: { client: ClientDirectoryRow }) => (
  <div className="space-y-3">
    {client.services.map((s) => (
      <div key={s.service} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${TONE[s.state]}`}>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Layers className="h-4 w-4 text-muted-foreground" /> {SERVICE_LABELS[s.service]}
          </h3>
          <p className={`mt-1 text-xs font-semibold ${STATE_TEXT[s.state]}`}>
            {SERVICE_STATE_LABELS[s.state]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
        </div>
        {s.href ? (
          <Link
            to={s.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open in {SERVICE_LABELS[s.service]} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="max-w-xs text-right text-xs text-muted-foreground">
            Starting this service creates a new record under the same client — never a second person.
          </p>
        )}
      </div>
    ))}
    <p className="text-xs text-muted-foreground">
      Plans and billing are not shown here yet: subscriptions live on the organization, and a
      per-client plan is a commercial decision that has not been made.
    </p>
  </div>
);
