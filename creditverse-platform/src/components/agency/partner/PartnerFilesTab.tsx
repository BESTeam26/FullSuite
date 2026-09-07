/**
 * Documents filed against this partner.
 *
 * Important and easy to get wrong: the partner portal reads THESE ROWS. A file
 * filed against the partner is visible to their activated contacts. Rule 16
 * says association is not publication — where a surface does publish, it has
 * to say so out loud rather than let somebody discover it after uploading a
 * margin sheet.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Empty } from "@/components/agency/partner/partner-ui";
import { fetchPartnerFiles } from "@/lib/data/agency-partners";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";

const size = (bytes: number | null) => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function PartnerFilesTab({ groupId }: { groupId: string }) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const files = useQuery({
    queryKey: ["partner", "files", groupId],
    queryFn: () => fetchPartnerFiles(groupId),
    enabled: auth.mode === "live" && auth.status === "signed-in" && perms.can("partners.files.view"),
    staleTime: 60_000,
  });

  return (
    <ContentCard title="Files">
      {files.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (files.data ?? []).length === 0 ? (
        <Empty title="No documents filed against this partner"
          hint="Contracts, SOPs and handover documents filed here are visible to the partner's activated portal contacts." />
      ) : (
        <ul className="divide-y divide-border/50">
          {(files.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{f.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {formatDate(f.createdAt)}{f.sizeBytes !== null && ` · ${size(f.sizeBytes)}`}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900">
        Anything filed against this partner is readable by their activated portal contacts. Internal
        notes, margins and BES workforce material do not belong here — file those against the work.
      </p>
    </ContentCard>
  );
}
