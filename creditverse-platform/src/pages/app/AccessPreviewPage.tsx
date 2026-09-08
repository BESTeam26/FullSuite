/**
 * Access preview — the Inspector, and the way into a preview.
 *
 * Dee, §38: while previewing, show ACCESS DETAILS. This is where they live,
 * so the Inspector does not have to be squeezed into the banner or into the
 * corner of every screen.
 *
 * With no preview active it explains what the page is for and offers the
 * picker, rather than rendering an empty panel. A route that shows nothing is
 * worse than one that says why.
 */
import { Eye, ShieldQuestion } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { AccessInspector } from "@/components/agency/view-as/AccessInspector";
import { ViewAsPicker } from "@/components/agency/view-as/ViewAsBanner";
import { useViewAs } from "@/lib/agency/view-as-context";

export function AccessPreviewPage() {
  const { previewing, canPreview, loading, error, access } = useViewAs();

  return (
    <HqPageShell
      title="Access preview"
      description={
        previewing
          ? `Exactly what ${access?.profile.name} sees, and why`
          : "See exactly what another staff member sees"
      }
      icon={ShieldQuestion}
      actions={!previewing ? <ViewAsPicker /> : undefined}
    >
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-status-danger/30 bg-status-danger/10 px-4 py-2.5 text-sm text-status-danger">
          {error}
        </p>
      )}

      {!canPreview ? (
        <p className="text-sm text-muted-foreground">
          Previewing another person's access is limited to the agency owner, and to
          administrators who have been given <code className="text-xs">access.preview_as_user</code>.
        </p>
      ) : previewing ? (
        <AccessInspector />
      ) : (
        <div className="space-y-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pick somebody and the whole workspace switches to what they see — the menu, the
            routes they can open, the partners and services in their scope, the conversations
            they are in. Read-only: nothing you do while previewing happens as them, and the
            audit log will still say it was you.
          </p>
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="mb-1.5 font-bold uppercase tracking-wider">What is exact, and what is not</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <strong className="text-foreground">Exact:</strong> the menu and every route
                guard, because both already read one authority and the preview substitutes the
                target into it. Partners, services and conversations, from the same predicates
                the policies use.
              </li>
              <li>
                <strong className="text-foreground">Not previewed:</strong> a screen that runs
                its own row-filtered query still returns YOUR rows, so those screens say
                "preview unavailable" instead of showing your data under somebody else's name.
              </li>
            </ul>
          </div>
          {loading && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> Loading…
            </p>
          )}
        </div>
      )}
    </HqPageShell>
  );
}
