/**
 * The Metro 2 identity panel, wired to this client's latest import.
 *
 * Kept apart from the panel itself so the rules can be rendered from any
 * source — a stored import here, a review grid during import later — without
 * the panel knowing where its data came from.
 */
import { Loader2 } from "lucide-react";
import { Metro2IdentityPanel } from "@/components/clients/Metro2IdentityPanel";
import { useClientReports, useReportItems } from "@/lib/data/use-credit-reports";
import { useClientProfileForCase } from "@/lib/data/use-client-address";

export function Metro2IdentitySection({ clientId }: { clientId: string }) {
  const reports = useClientReports(clientId);
  const items = useReportItems(reports.latest?.id ?? null);
  const identity = useClientProfileForCase(clientId);

  if (reports.isLoading || items.isLoading) {
    return (
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading identity checks…
      </p>
    );
  }
  if (!reports.latest) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground">Identity reporting (Metro 2 Section A)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing to check yet — import a credit report first. Nothing on this panel is estimated.
        </p>
      </div>
    );
  }
  return <Metro2IdentityPanel reportItems={items.items} verified={identity.data ?? {}} />;
}
