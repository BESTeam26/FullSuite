import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import type { ClientProfile } from "@/lib/data/clients";

/**
 * One login per person, serving every portal they are entitled to.
 *
 * The panel reports whether an account exists, never who it is or anything
 * about it. A client's credentials are not the organization's to read, and
 * the record deliberately holds only a reference to a profile.
 */
export const LoginsPanel = ({ client }: { client: ClientProfile }) => (
  <div className="space-y-4">
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <KeyRound className="h-4 w-4 text-primary" /> Client portal
      </h2>
      <p className="mt-3 flex items-center gap-2 text-sm">
        {client.hasPortalLogin ? (
          <>
            <ShieldCheck className="h-4 w-4 text-status-success" />
            <span className="text-foreground">
              This client has a portal login. It is the same account for credit and funding — they
              never sign in twice.
            </span>
          </>
        ) : (
          <>
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              No portal login yet. One is created when they are invited to the portal or enrol in DIY
              Credit.
            </span>
          </>
        )}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Credentials are never shown here, and staff cannot read them. Password resets go through the
        client's own email.
      </p>
    </div>
  </div>
);
