/**
 * BES CRM — BES-owned delivery of CRM, GHL, automation, website and funnel
 * builds (CLAUDE.md rule 17).
 *
 * A project is an AGENCY-scope work item with division 'bes_crm' and the
 * customer as subject_organization_id. BES sees and runs all of them here.
 * A customer entitled to 'crm' sees its own projects, reads only what BES
 * published, and may comment; it cannot change status, assignment, dates or
 * completion — no control exists for it and no policy allows it.
 *
 * Every number is derived from rows RLS returned. The former sample roster,
 * percentages and assignee initials were invented and are gone.
 */
import { useMemo, useState } from "react";
import { Workflow, FolderKanban, ShieldCheck, Clock, AlertTriangle, CheckCircle2, BarChart3, BookOpen, Eye } from "lucide-react";
import {
  DivisionLayout,
  DivisionTable,
  ContentCard,
  EmptyTab,
  StatusPill,
  type DivisionTab,
} from "@/components/dashboard/DivisionLayout";
import { useAgency } from "@/lib/agency-context";
import { useAgencyWork } from "@/lib/data/use-work";
import type { WorkItem } from "@/lib/bes-domain";
import { ProjectUpdates } from "@/components/bes-crm/ProjectUpdates";
import { cn } from "@/lib/utils";

const isCrmProject = (w: WorkItem) => w.scope === "AGENCY" && w.division === "bes_crm";

export default function BesCrm() {
  const { viewMode, subAccounts, activeOrganization } = useAgency();
  const { items, source, isLoading, error } = useAgencyWork();
  const isBes = viewMode === "agency";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // RLS already limits an organization user to its own entitled projects; the
  // filter below only narrows the agency's full list to the active sub-account
  // when BES is looking through a customer's lens.
  const projects = useMemo(
    () =>
      items.filter(isCrmProject).filter((w) => isBes || !activeOrganization || w.subjectOrganizationId === activeOrganization.id),
    [items, isBes, activeOrganization],
  );
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;
  const orgName = (id?: string) => subAccounts.find((s) => s.id === id)?.name ?? activeOrganization?.name ?? "—";
  const count = (stage: string) => projects.filter((p) => p.stage === stage).length;

  const empty = (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <Workflow className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{isBes ? "No BES CRM projects yet" : "No projects to show"}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        {isBes
          ? "A project is an agency work item in the BES CRM division with the customer as its subject."
          : "BES CRM projects appear here once BES opens one for your organization."}
      </p>
    </div>
  );

  const projectsTable = (
    <ContentCard title={isBes ? "Delivery projects" : "Your BES CRM projects"}>
      {source === "demo" ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Available when signed in — projects read live records.</p>
      ) : isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load projects: {error}</p>
      ) : projects.length === 0 ? (
        empty
      ) : (
        <DivisionTable
          columns={isBes ? ["Project", "Customer", "Stage", "Due", "Assigned"] : ["Project", "Stage", "Due"]}
          rows={projects.map((p) =>
            isBes
              ? [p.title, orgName(p.subjectOrganizationId), <StatusPill status={p.stage} />, p.dueAt ? new Date(p.dueAt).toLocaleDateString() : "—", p.assignedTo ? "Yes" : "Unassigned"]
              : [p.title, <StatusPill status={p.stage} />, p.dueAt ? new Date(p.dueAt).toLocaleDateString() : "—"],
          )}
        />
      )}
    </ContentCard>
  );

  const updatesTab = (
    projects.length === 0 ? empty : (
      <div className="flex flex-col gap-4 lg:flex-row">
        <nav aria-label="Projects" className="w-full shrink-0 lg:w-64">
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={selected?.id === p.id ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    selected?.id === p.id ? "bg-primary/10 font-semibold text-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="block truncate">{p.title}</span>
                  {isBes && <span className="block text-[11px] font-normal text-muted-foreground">{orgName(p.subjectOrganizationId)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{selected && <ProjectUpdates key={selected.id} project={selected} isBes={isBes} />}</div>
      </div>
    )
  );

  const tabs: DivisionTab[] = isBes
    ? [
        { id: "projects", label: "Projects", icon: FolderKanban, render: () => projectsTable },
        { id: "updates", label: "Updates & QA", icon: ShieldCheck, render: () => updatesTab },
        { id: "monitoring", label: "Monitoring", icon: Eye, render: () => <EmptyTab label="Monitoring & maintenance contracts are not recorded yet" /> },
        { id: "resources", label: "Resources", icon: BookOpen, render: () => <EmptyTab label="Build templates & resource library — not built" /> },
        { id: "reports", label: "Reports", icon: BarChart3, render: () => <EmptyTab label="Delivery reports — not built" /> },
      ]
    : [
        { id: "projects", label: "Projects", icon: FolderKanban, render: () => projectsTable },
        { id: "updates", label: "Updates", icon: ShieldCheck, render: () => updatesTab },
      ];

  return (
    <DivisionLayout
      title="BES CRM"
      description={isBes ? "CRM, GHL, automation, website and funnel delivery — BES-owned, published to customers by choice" : "Your BES delivery projects — progress and updates BES has published"}
      icon={Workflow}
      stats={[
        { label: "Projects", value: projects.length, icon: FolderKanban },
        { label: "In processing", value: count("In Processing"), icon: Clock },
        { label: "QA review", value: count("QA Review") + count("Ready for QA"), icon: ShieldCheck },
        { label: "Blocked", value: count("Blocked") + count("Attention"), icon: AlertTriangle },
        { label: "Completed", value: count("Completed"), icon: CheckCircle2 },
      ]}
      tabs={tabs}
    />
  );
}
