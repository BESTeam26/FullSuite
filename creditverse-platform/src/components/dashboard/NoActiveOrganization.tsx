import { Building2 } from "lucide-react";

/**
 * Shown when a module page is opened with no active organization resolved —
 * for example a BES user in agency view following an organization link. It
 * claims nothing about data; it only says what is missing.
 */
export function NoActiveOrganization({ module }: { module: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-bold text-foreground">No organization selected</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Open an organization from the switcher to see its {module} workspace.
      </p>
    </div>
  );
}
