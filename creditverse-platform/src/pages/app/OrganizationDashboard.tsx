/**
 * The organization's ONE Home. Every figure is derived from rows RLS returned
 * for this organization: its open work, its workspaces, its CreditOps and
 * FundingOps clients where entitled. Nothing here is a sample number. The
 * cards shown, and their order, are the person's saved layout
 * (`user_preferences.dashboard_cards`) resolved by `lib/dashboard/home-cards`.
 *
 * The route carries the permanent Organization ID (BES-XXXXXX). Reaching it
 * selects that organization IF this user can see it (membership, or BES staff);
 * an unknown or unauthorized id renders a plain "not available" and offers the
 * way back — never another organization's data.
 */
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { Link, Navigate, useParams } from "react-router-dom";
import { Building2, LayoutGrid, ListTodo, Users, FileText, Landmark, Workflow, ArrowRight, Hash, SlidersHorizontal, Clock, Timer } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { DonutLegend } from "@/components/dashboard/ops/DonutLegend";
import { KpiTile, TONE_FILL, type KpiTone } from "@/components/dashboard/ops/KpiTile";
import { StageBarChart } from "@/components/dashboard/ops/StageBarChart";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { GettingStartedCard } from "@/components/dashboard/GettingStartedCard";
import { BirthdayStrip } from "@/components/dashboard/BirthdayStrip";
import { WelcomeEmailOnce } from "@/components/dashboard/WelcomeEmailOnce";
import { CompanyFeedCard } from "@/components/dashboard/CompanyFeedCard";
import { Avatar } from "@/components/common/Avatar";
import { useOwnProfile, useAvatarUrls } from "@/lib/data/use-account";
import { useOrganizationHub } from "@/lib/data/use-hub";
import { dayGreeting } from "@/lib/greetings/day-greeting";
import { usePermissions } from "@/lib/auth/use-permission";
import { useOrganizationWork } from "@/lib/data/use-work";
import { useWorkspaces } from "@/lib/data/use-workspaces";
import { useOrganizationTrial } from "@/lib/data/use-organization-trial";
import { useOrganizationHomeFigures } from "@/lib/data/use-organization-home";
import { useSaveDashboardCards, useUserPreferences } from "@/lib/data/use-user-preferences";
import { availableHomeCards, resolveHomeCards, type HomeCardKey } from "@/lib/dashboard/home-cards";
import { errorMessage } from "@/lib/data/error-message";
import { HomeCardsCustomizer } from "@/components/dashboard/HomeCardsCustomizer";
import { isOverdue } from "@/lib/workspaces/workspace-domain";
import { PRODUCT_LABELS, type ProductKey } from "@/lib/bes-domain";
import { ContentCard, DivisionTable, StatusPill } from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

const MODULE_LINKS: Partial<Record<ProductKey, { href: string; icon: typeof FileText; blurb: string }>> = {
  creditOps: { href: "/app/operations", icon: FileText, blurb: "Credit repair operations" },
  fundingOps: { href: "/app/metro2", icon: Landmark, blurb: "Funding pipeline" },
  workspaces: { href: "/app/workspaces", icon: LayoutGrid, blurb: "Your own boards and work items" },
  crm: { href: "/app/bes-crm", icon: Workflow, blurb: "BES delivery projects and published updates" },
};

const CARD_ICONS: Record<HomeCardKey, typeof FileText> = {
  "work.open": ListTodo,
  "work.mine": Users,
  "work.overdue": ListTodo,
  "workspaces.count": LayoutGrid,
  "creditops.active": FileText,
  "creditops.processing": FileText,
  "creditops.awaiting": FileText,
  "creditops.attention": FileText,
  "fundingops.active": Landmark,
  "fundingops.funded": Landmark,
  "fundingops.overdue": Landmark,
};

export default function OrganizationDashboard() {
  const { orgPublicId = "" } = useParams();
  const agency = useAgency();
  const auth = useAuth();
  const state = agency.resolveOrganizationByPublicId(orgPublicId);
  const org = agency.activeOrganization;
  const isThisOrg = !!org && org.publicId === orgPublicId;

  // Route → context is a side effect on the provider, so it runs in an effect;
  // resolving the id above is pure and safe during render. (Calling the
  // activator in render updated AgencyProvider mid-render — React warned.)
  const { activateOrganizationByPublicId } = agency;
  useEffect(() => {
    if (state === "active" && !isThisOrg) activateOrganizationByPublicId(orgPublicId);
  }, [state, isThisOrg, orgPublicId, activateOrganizationByPublicId]);

  // Dev-mode timing readout: marks the end of a switch.
  useEffect(() => {
    if (isThisOrg && typeof performance !== "undefined" && performance.getEntriesByName("bes:org-switch:start").length) {
      performance.mark("bes:org-switch:end");
      const m = performance.measure("bes:org-switch", "bes:org-switch:start", "bes:org-switch:end");
      if (import.meta.env.DEV) console.debug(`[bes] organization switch rendered in ${Math.round(m.duration)} ms`);
      performance.clearMarks("bes:org-switch:start"); performance.clearMarks("bes:org-switch:end"); performance.clearMeasures("bes:org-switch");
    }
  }, [isThisOrg, orgPublicId]);

  const work = useOrganizationWork(isThisOrg ? org.id : null);
  const { workspaces } = useWorkspaces(isThisOrg ? org.id : null);
  const { trial } = useOrganizationTrial(isThisOrg ? org.id : null);
  const enabledKeys = useMemo(
    () => (isThisOrg ? org.entitlements.filter((e) => e.enabled).map((e) => e.key) : []),
    [isThisOrg, org],
  );
  const figures = useOrganizationHomeFigures(isThisOrg ? org.id : null, {
    creditOps: enabledKeys.includes("creditOps"),
    fundingOps: enabledKeys.includes("fundingOps"),
  });
  const prefs = useUserPreferences();
  const saveCards = useSaveDashboardCards();
  /* Organization-wide figures and charts are reporting; a member without
     "View reports" gets a Home about their own day instead. The rows the
     lists show are already limited to what their role may see (RLS). */
  const permissions = usePermissions();
  const seesFigures = permissions.can("reports.view");
  /* Home greets the person and shows the company's own layer when the hub has
     it switched on (rule 18). Both read caches the rest of the app already
     holds, so this adds no waterfall. */
  const account = useOwnProfile();
  const myAvatar = useAvatarUrls([account.profile?.avatarPath]);
  const hub = useOrganizationHub(isThisOrg ? org?.id ?? null : null);
  const [customizing, setCustomizing] = useState(false);
  const cards = useMemo(
    () => resolveHomeCards(prefs.preferences?.dashboard_cards, enabledKeys),
    [prefs.preferences?.dashboard_cards, enabledKeys],
  );

  const overdue = useMemo(() => work.items.filter((w) => w.dueAt && isOverdue({ dueAt: w.dueAt, completedAt: null } as never)).length, [work.items]);
  const mine = useMemo(() => work.items.filter((w) => w.assignedTo === auth.user?.id).length, [work.items, auth.user?.id]);
  /* Visual read of the same rows: open work by stage, and how urgent it is. Counts, never forecasts. */
  const byStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of work.items) m.set(w.stage, (m.get(w.stage) ?? 0) + 1);
    return [...m.entries()].map(([label, count]) => ({ label, count }));
  }, [work.items]);
  const dueBuckets = useMemo(() => {
    const now = Date.now(), week = now + 7 * 86_400_000;
    const b = { overdue: 0, week: 0, later: 0, none: 0 };
    for (const w of work.items) { if (!w.dueAt) b.none++; else { const t = Date.parse(w.dueAt); if (t < now) b.overdue++; else if (t <= week) b.week++; else b.later++; } }
    return [
      { label: "Overdue", value: b.overdue, color: TONE_FILL.red }, { label: "Due this week", value: b.week, color: TONE_FILL.amber },
      { label: "Due later", value: b.later, color: TONE_FILL.blue }, { label: "No due date", value: b.none, color: TONE_FILL.slate },
    ];
  }, [work.items]);
  const cardTone = (key: HomeCardKey): KpiTone => key.startsWith("creditops") ? "blue" : key.startsWith("fundingops") ? "emerald" : key === "work.overdue" ? "red" : key === "workspaces.count" ? "purple" : "amber";

  const loadingWork = work.isLoading;
  const loadingFigures = figures.isLoading;
  const cardValue = (key: HomeCardKey): string | number => {
    switch (key) {
      case "work.open": return loadingWork ? "…" : work.items.length;
      case "work.mine": return loadingWork ? "…" : mine;
      case "work.overdue": return loadingWork ? "…" : overdue;
      case "workspaces.count": return workspaces.length;
      case "creditops.active": return loadingFigures ? "…" : figures.creditOps.active;
      case "creditops.processing": return loadingFigures ? "…" : figures.creditOps.processing;
      case "creditops.awaiting": return loadingFigures ? "…" : figures.creditOps.awaiting;
      case "creditops.attention": return loadingFigures ? "…" : figures.creditOps.attention;
      case "fundingops.active": return loadingFigures ? "…" : figures.fundingOps.active;
      case "fundingops.funded": return loadingFigures ? "…" : figures.fundingOps.funded;
      case "fundingops.overdue": return loadingFigures ? "…" : figures.fundingOps.overdue;
    }
  };

  if (state === "loading") return <p className="p-8 text-center text-sm text-muted-foreground">Loading organization…</p>;
  if (state === "unknown" || !isThisOrg) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Building2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">This organization is not available to you</p>
          <p className="mt-1 text-xs text-muted-foreground">Either the ID is wrong or you are not a member. Nothing from it is shown.</p>
          <Link to="/app" className="mt-4 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline">Back to your home</Link>
        </div>
      </div>
    );
  }
  if (!auth.isAgencyStaff && agency.viewMode !== "subaccount") return <Navigate to="/app" replace />;

  const enabled = org.entitlements.filter((e) => e.enabled);
  const initials = org.name.replace(/^\[TEST\]\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Avatar
          name={account.profile?.preferredName || account.profile?.fullName || auth.displayName}
          url={account.profile?.avatarPath ? myAvatar.data?.[account.profile.avatarPath] : null}
          size="md"
        />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {dayGreeting(new Date(), account.profile?.preferredName, account.profile?.fullName ?? auth.displayName)}
          </h1>
          <p className="text-xs text-muted-foreground">Here is your day at {org.name.replace(/^\[TEST\]\s*/, "")}.</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          {org.branding?.logoUrl ? (
            <img src={org.branding.logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: org.branding?.primaryColor || "hsl(var(--primary))" }}>{initials}</div>
          )}
          <div>
            <p className="text-lg font-bold text-foreground">{org.name}</p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono text-foreground"><Hash className="h-3 w-3" />{org.publicId}</span>
              <span>{org.principal.name} · {org.principal.email}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {enabled.length === 0 ? <StatusPill status="No modules enabled" /> : enabled.map((e) => <StatusPill key={e.key} status={e.label} />)}
        </div>
      </div>

      {trial && (
        <div
          className={
            trial.status === "blocked"
              ? "mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
              : "mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-foreground"
          }
          role="status"
        >
          {trial.status === "active" && (
            <>Introductory trial active until <strong>{formatDate(trial.endsAt)}</strong>.{trial.blockedReason === "name_match_review" ? " BES is reviewing this organization because a similar business is already on record." : ""}</>
          )}
          {trial.status === "blocked" && (
            <>A free trial is not available for this business because it is already on record with BES. Contact BES to activate your organization.</>
          )}
          {trial.status === "expired" && <>Your introductory trial has ended. Contact BES to activate your organization.</>}
          {trial.status === "converted" && <>Your organization is active.</>}
        </div>
      )}
      <WelcomeEmailOnce organizationId={prefs.live ? org.id : null} />
      {prefs.live && <BirthdayStrip organizationId={org.id} organizationName={org.name.replace(/^\[TEST\]\s*/, "")} />}
      {prefs.live && (
        <GettingStartedCard
          organizationId={org.id}
          enabledModules={enabledKeys}
          brandingSet={!!(org.branding?.logoUrl || org.branding?.primaryColor)}
          clients={figures.creditOps.active}
          fundingFiles={figures.fundingOps.active}
        />
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DataSourceBadge source={work.source} />
          <span className="text-xs text-muted-foreground">Figures are derived from this organization's own records.</span>
        </div>
        {prefs.live && seesFigures && !customizing && (
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Customize Home
          </button>
        )}
      </div>
      {customizing && (
        <HomeCardsCustomizer
          available={availableHomeCards(enabledKeys)}
          shown={cards.map((c) => c.key)}
          saving={saveCards.isPending}
          error={saveCards.error ? errorMessage(saveCards.error, "Could not save your layout.") : null}
          onClose={() => setCustomizing(false)}
          onSave={(next) => saveCards.mutate(next, { onSuccess: () => setCustomizing(false) })}
        />
      )}
      {!seesFigures && !permissions.loading && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Link to="/app/my-work" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KpiTile label="Assigned to you" value={loadingWork ? "…" : mine} icon={CARD_ICONS["work.mine"]} tone="blue" />
          </Link>
          <Link to="/app/my-work" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KpiTile label="Overdue on your list" value={loadingWork ? "…" : overdue} icon={CARD_ICONS["work.overdue"]} tone="amber" attention={overdue > 0} />
          </Link>
          <Link to="/app/my-time" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KpiTile label="Time tracking" value="Open" icon={Clock} tone="emerald" />
          </Link>
          <Link to="/app/eod" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KpiTile label="End of Day" value="Open" icon={Timer} tone="slate" />
          </Link>
        </div>
      )}
      <div className={seesFigures ? "mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" : "hidden"}>
        {seesFigures && cards.map((card) => (
          <Link key={card.key} to={card.href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KpiTile label={card.label} value={cardValue(card.key)} icon={CARD_ICONS[card.key]} tone={cardTone(card.key)} attention={card.key === "work.overdue" && typeof cardValue(card.key) === "number" && (cardValue(card.key) as number) > 0} />
          </Link>
        ))}
      </div>

      {seesFigures && !work.isLoading && work.items.length > 0 && (
        <div className="mb-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
          <ChartCard title="Open work by stage">
            <StageBarChart data={byStage} tone="amber" height={220} />
          </ChartCard>
          <ChartCard title="How urgent">
            <DonutLegend data={dueBuckets} emptyText="No open work" height={180} />
          </ChartCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {prefs.live && <CompanyFeedCard organizationId={org.id} active={hub.isActive("announcements")} />}
          <ContentCard title={seesFigures ? "Open work" : "Your open work"}>
            {work.error ? (
              <p className="text-sm text-red-700">Could not load work: {work.error}</p>
            ) : work.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : work.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No open work items for this organization.</p>
            ) : (
              <DivisionTable columns={["Item", "Stage", "Due"]} rows={work.items.slice(0, 12).map((w) => [w.title, <StatusPill status={w.stage} />, w.dueAt ? formatDate(w.dueAt) : "—"])} />
            )}
          </ContentCard>
        </div>
        <ContentCard title="Your modules">
          {enabled.length === 0 ? (
            <p className="text-xs text-muted-foreground">No modules are enabled for this organization yet.</p>
          ) : (
            <ul className="space-y-2">
              {enabled.map((e) => {
                const link = MODULE_LINKS[e.key];
                const Icon = link?.icon ?? FileText;
                const body = (
                  <>
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{PRODUCT_LABELS[e.key]}</span>
                      {link && <span className="block text-[11px] text-muted-foreground">{link.blurb}</span>}
                    </span>
                    {link && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </>
                );
                return (
                  <li key={e.key}>
                    {link ? (
                      <Link to={link.href} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ContentCard>
      </div>
    </div>
  );
}
