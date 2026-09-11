/**
 * The lifecycle menu on a BES CRM project.
 *
 * ── WHY DELETE IS THE SMALL ONE ────────────────────────────────────────────
 *
 * A project is work underneath a partner's service engagement, so almost every
 * project worth deleting is one nobody ever started. The moment it holds
 * recorded production, logged time, work somebody began, a completed
 * milestone, a file or a client requirement, permanent deletion destroys the
 * only record that those things happened — and the foreign keys would take the
 * work items with it.
 *
 * So Delete is offered ONLY when the database says the project is disposable,
 * and when it is not, the menu says which things are in the way and points at
 * Archive. Dee: "do not silently fail."
 *
 * ── WHAT NONE OF THESE TOUCH ───────────────────────────────────────────────
 *
 * The partner, the organization, the BES CRM service engagement, SaaS tenancy,
 * or any other project. Completing a build says nothing about the relationship
 * above it.
 */
import { useState } from "react";
import { Archive, CheckCircle2, MoreVertical, RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useCrmProjectLifecycle } from "@/lib/data/use-crm";
import type { CrmProjectRow } from "@/lib/data/crm-projects";
import { isActiveProject, isDeletable } from "@/lib/crm/project-lifecycle";

export function CrmProjectActions({ project }: { project: CrmProjectRow }) {
  const perms = useAgencyPermissions();
  const lifecycle = useCrmProjectLifecycle();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedName, setTypedName] = useState("");

  /* Destructive and near-destructive actions need the capability. Hiding the
     menu is presentation; the database refuses these calls regardless. */
  if (!perms.can("crm.projects.manage")) return null;

  const closed = !isActiveProject(project);
  const blockers = project.deletionBlockers;
  const deletable = isDeletable(project);

  const run = (
    p: Promise<void>,
    ok: string,
  ) =>
    p
      .then(() => toast({ title: ok }))
      .catch((e: Error) =>
        toast({ title: "That did not go through", description: e.message, variant: "destructive" }),
      );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${project.name}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-xs">{project.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {!closed && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  void run(
                    lifecycle.complete.mutateAsync({ projectId: project.id }),
                    "Marked complete. It keeps everything and stays on the partner.",
                  )
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void run(
                    lifecycle.archive.mutateAsync({ projectId: project.id }),
                    "Archived. Out of active work, nothing lost.",
                  )
                }
              >
                <Archive className="mr-2 h-4 w-4" /> Archive Project
              </DropdownMenuItem>
            </>
          )}

          {closed && (
            <DropdownMenuItem
              onSelect={() =>
                void run(
                  lifecycle.reopen.mutateAsync({ projectId: project.id }),
                  "Reopened. The same project, with its units and history.",
                )
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reopen Project
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {deletable ? (
            <DropdownMenuItem
              onSelect={() => { setTypedName(""); setConfirmDelete(true); }}
              className="text-status-danger focus:text-status-danger"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete Project
            </DropdownMenuItem>
          ) : (
            /* Not a disabled menu item with no explanation: the reason IS the
               useful part, and Archive is the thing to do instead. */
            <div className="px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Cannot be deleted</p>
              <p className="mt-0.5">
                This project has {blockers.join(", ")}. Deleting it would destroy that record.
                Archive it instead — that keeps all of it.
              </p>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}” permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This project has no recorded work, time, files or requirements, so there is nothing
              to lose — but it cannot be undone. Its partner, their service engagement and every
              other project are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="confirm-project-name" className="text-xs text-muted-foreground">
              Type <span className="font-semibold text-foreground">{project.name}</span> to confirm.
            </label>
            <Input
              id="confirm-project-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={typedName.trim() !== project.name}
              onClick={() =>
                void run(
                  lifecycle.remove.mutateAsync({ projectId: project.id }),
                  "Project deleted.",
                )
              }
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
