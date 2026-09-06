/**
 * One route, two tenancies (CLAUDE.md rule 18): BES HQ sees its own screen,
 * a customer organization sees the same concept over its own records, gated
 * by its hub. No duplicate route, no second intranet.
 */
import type { ReactNode } from "react";
import { useAgency } from "@/lib/agency-context";
import { RequireHubModule } from "@/components/auth/RequireHubModule";

export const HubOrAgencyPage = ({
  module,
  label,
  agency,
  organization,
}: {
  module: string;
  label: string;
  agency: ReactNode;
  organization: ReactNode;
}) => {
  const { viewMode } = useAgency();
  if (viewMode === "agency") return <>{agency}</>;
  return <RequireHubModule module={module} label={label}>{organization}</RequireHubModule>;
};
