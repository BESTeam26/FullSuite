/**
 * BES CRM — BES-owned delivery of CRM, GHL, automation, website and funnel
 * builds (CLAUDE.md rule 17), on the engine model Dee locked on 2026-09-08:
 *
 *   old ClickUp          → project journey and milestones
 *   140-row tracker      → the technical build standard (crm_requirements)
 *   BES Work Units       → the team's actual execution (work_items)
 *   automation           → progress, handoffs, QA, EOD, notifications
 *
 * Everything a row shows — journey, health, engine progress, unit state — is
 * DERIVED by the database from the work itself. This file contains no status
 * logic; it could not disagree with a report if it tried.
 *
 * A customer organization sees the same screen through its own rows: RLS
 * returns only its entitled projects, and every operating control is refused
 * by policy in the database, not merely unrendered here (rule 17 — the
 * customer reads published updates and comments; it does not run the build).
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  Plus,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DivisionLayout, type DivisionTab } from "@/components/dashboard/DivisionLayout";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useCrmBoard } from "@/lib/data/use-crm";
import { CrmBoardTab } from "@/components/bes-crm/CrmBoardTab";
import { CrmProjectWorkspace } from "@/components/bes-crm/CrmProjectWorkspace";
import { CreateCrmProjectDialog } from "@/components/bes-crm/CreateCrmProjectDialog";

export default function BesCrm() {
  const { viewMode } = useAgency();
  const auth = useAuth();
  const isBes = viewMode === "agency";
  const board = useCrmBoard();
  /* A notification's link lands on one project (`?project=`); the board is
     the fallback when the id is not one the caller may see. */
  const [params] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("project"));
  const [creating, setCreating] = useState(false);

  const projects = useMemo(() => board.data ?? [], [board.data]);
  const open = projects.find((p) => p.id === openId) ?? null;

  const totals = useMemo(
    () => ({
      building: projects.filter((p) => p.journey === "building").length,
      qa: projects.reduce((n, p) => n + p.inQa, 0),
      blocked: projects.reduce((n, p) => n + p.blocked, 0),
      complete: projects.filter((p) => p.journey === "complete").length,
    }),
    [projects],
  );

  const boardView = () => {
    if (auth.mode !== "live") {
      return (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Available when signed in — projects read live records.
        </p>
      );
    }
    if (board.isLoading) {
      return (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card" />
          ))}
        </div>
      );
    }
    if (board.error) {
      return (
        <p className="text-sm text-status-danger">
          Could not load projects: {(board.error as Error).message}
        </p>
      );
    }
    if (projects.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Workflow className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {isBes ? "No build projects yet" : "No projects to show"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {isBes
              ? "A project starts from the engines the partner bought — Website, Sales, Fulfillment — and its work, milestones and progress follow from that choice."
              : "BES CRM projects appear here once BES opens one for your organization."}
          </p>
          {isBes && (
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New build project
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {isBes && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New build project
            </Button>
          </div>
        )}
        <CrmBoardTab projects={projects} onOpen={setOpenId} />
      </div>
    );
  };

  const tabs: DivisionTab[] = [
    {
      id: "projects",
      label: "Projects",
      icon: FolderKanban,
      render: () =>
        open ? (
          <CrmProjectWorkspace
            project={open}
            isBes={isBes}
            onBack={() => setOpenId(null)}
          />
        ) : (
          boardView()
        ),
    },
  ];

  return (
    <>
      <DivisionLayout
        title="BES CRM"
        description={
          isBes
            ? "CRM, GHL, automation, website and funnel delivery — composable build engines, derived progress, BES-owned"
            : "Your BES delivery projects — progress and updates BES has published"
        }
        icon={Workflow}
        stats={[
          { label: "Projects", value: projects.length, icon: FolderKanban },
          { label: "Building", value: totals.building, icon: Clock },
          { label: "In QA", value: totals.qa, icon: ShieldCheck },
          { label: "Blocked", value: totals.blocked, icon: AlertTriangle },
          { label: "Complete", value: totals.complete, icon: CheckCircle2 },
        ]}
        tabs={tabs}
      />
      {creating && <CreateCrmProjectDialog onClose={() => setCreating(false)} />}
    </>
  );
}
