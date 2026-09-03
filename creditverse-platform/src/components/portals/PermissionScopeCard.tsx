import { Check, Lock, ShieldCheck } from "lucide-react";
import { ROLES, type Role } from "@/lib/roles";

export const PermissionScopeCard = ({ role }: { role: Role }) => {
  const def = ROLES[role];
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-status-success" />
        <h2 className="font-semibold">Your permission scope</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-status-success">
            Granted to you
          </p>
          <div className="space-y-1.5">
            {def.granted.map((g) => (
              <div
                key={g.key}
                className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-2.5 py-1.5 text-sm"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-status-success" />
                {g.label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Not visible to your role
          </p>
          <div className="space-y-1.5">
            {def.blocked.map((b) => (
              <div
                key={b.key}
                className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
