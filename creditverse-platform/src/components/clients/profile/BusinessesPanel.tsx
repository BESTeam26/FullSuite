import { Building2, FolderOpen } from "lucide-react";
import type { ClientDirectoryRow } from "@/lib/clients/client-directory-domain";

/**
 * The businesses this client owns, and how many funding files hang off each.
 *
 *   CLIENT → BUSINESS → FUNDING FILE → DEAL
 *
 * The panel stops at the count deliberately. A funding file's contents are
 * FundingOps' to show, and duplicating them here is how one truth becomes two.
 */
export const BusinessesPanel = ({ client }: { client: ClientDirectoryRow }) => {
  if (client.businesses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="h-4 w-4 text-primary" /> Businesses
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No business recorded. Businesses are created inside FundingOps, because that is where they
          are used — a client with no funding relationship has no business record yet.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {client.businesses.map((b) => (
        <div key={b.id} className="rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Building2 className="h-4 w-4 text-primary" /> {b.name}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            {b.fundingFileCount} funding file{b.fundingFileCount === 1 ? "" : "s"}
          </p>
        </div>
      ))}
    </div>
  );
};
