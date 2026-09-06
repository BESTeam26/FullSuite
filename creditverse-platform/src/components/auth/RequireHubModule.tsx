/**
 * Route guard for an Organization Hub module (CLAUDE.md rule 18, layer one
 * and two). The database already refuses the data; this stops a typed URL
 * from rendering an empty screen and says which of the two reasons applies.
 *
 * BES HQ's own view is not gated: its hub is its internal operating
 * environment, not a product it buys from itself.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useOrganizationHub } from "@/lib/data/use-hub";

export const RequireHubModule = ({
  module,
  label,
  children,
}: {
  module: string;
  label: string;
  children: ReactNode;
}) => {
  const { viewMode, activeOrganization } = useAgency();
  const hub = useOrganizationHub(viewMode === "subaccount" ? activeOrganization?.id ?? null : null);

  if (viewMode !== "subaccount" || !activeOrganization) return <>{children}</>;
  if (hub.isLoading) return <div className="min-h-[60vh]" aria-busy="true" />;

  const row = hub.rows.find((r) => r.key === module);
  if (row?.active) return <>{children}</>;

  const entitled = row?.entitled ?? false;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-bold text-foreground">{label} is not switched on</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {entitled
          ? "This part of the company hub is part of your plan but is switched off. An administrator can turn it on in Settings."
          : "This part of the company hub is not included in your current plan. Ask your account manager to add it."}
      </p>
      <Link
        to={entitled ? "/app/settings?section=hub" : "/app"}
        className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        {entitled ? "Open Settings" : "Back to Home"}
      </Link>
    </div>
  );
};
