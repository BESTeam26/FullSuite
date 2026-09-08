/**
 * The Access Inspector — WHY, not just whether.
 *
 * Dee, §38, with the example spelled out:
 *
 *   CreditOps           ALLOWED   Reason: assigned operational scope
 *   BES CRM             DENIED    Reason: no BES CRM scope
 *   Partner Kevin H.    ALLOWED   Reason: Team Daniel assignment
 *   Finance             DENIED    Reason: financial permission false
 *
 * The reason is the whole feature. "Denied" on its own sends somebody to ask
 * why; "via team Daniel" tells them what to change. Every row here carries
 * one, and the reasons come from the database — the same expressions the
 * policies use — rather than being narrated by this file.
 *
 * ── WHAT IT DOES NOT CLAIM ─────────────────────────────────────────────────
 *
 * The conversation list mirrors `channel_notifiable`, which is deliberately
 * NARROWER than `channel_visible`. So it can under-report a channel the
 * person can actually open, and it says so on the panel instead of implying
 * exactness. A preview that overstates access is dangerous; one that
 * understates it and admits which is which is merely honest.
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, ShieldQuestion } from "lucide-react";
import { useViewAs } from "@/lib/agency/view-as-context";
import { visibleRoutes, AGENCY_ROUTES, accessTo } from "@/lib/agency/navigation";
import type { PreviewScopeRow } from "@/lib/data/view-as";
import { cn } from "@/lib/utils";

export function AccessInspector() {
  const { access, effectiveRole, effectiveCan, previewing } = useViewAs();
  const [openGroup, setOpenGroup] = useState<string | null>("modules");

  const modules = useMemo(() => {
    const ctx = { role: effectiveRole, can: effectiveCan };
    const shown = new Set(visibleRoutes(ctx).map((r) => r.spec.path));
    return AGENCY_ROUTES.map((spec) => ({
      path: spec.path,
      label: spec.label,
      access: accessTo(spec, ctx),
      visible: shown.has(spec.path),
      /* The reason, in the terms the authority actually used. */
      reason:
        accessTo(spec, ctx) === "allow"
          ? spec.permission
            ? `holds ${spec.permission}`
            : `role is at least ${spec.minRole.replace("agency_", "")}`
          : accessTo(spec, ctx) === "locked"
            ? "the feature is not finished — nobody can open it"
            : spec.permission && !effectiveCan(spec.permission)
              ? `does not hold ${spec.permission}`
              : `role is below ${spec.minRole.replace("agency_", "")}`,
    }));
  }, [effectiveRole, effectiveCan]);

  if (!previewing || !access) return null;

  const p = access.profile;
  const security = access.capabilities.filter((c) => c.securityRelevant);
  const granted = access.capabilities.filter((c) => c.allowed);

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <header className="flex items-center gap-2">
        <ShieldQuestion className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-bold text-foreground">Access details</h2>
        <span className="text-[11px] text-muted-foreground">
          why {p.name} sees what they see
        </span>
      </header>

      {/* Who they are */}
      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Role" value={p.role?.replace("agency_", "") ?? "none"} />
        <Fact label="Status" value={p.status ?? "unknown"}
          tone={p.status === "active" ? undefined : "danger"} />
        <Fact label="Scope" value={p.scope ?? "none"} />
        <Fact label="Division" value={p.division ?? p.scopeDivision ?? "none"} />
        <Fact label="Department" value={p.department ?? "none"} />
        <Fact label="Reports to" value={p.reportsTo ?? "nobody"} />
        <Fact label="Position"
          value={p.positions.length === 0 ? "no seat" :
            p.positions.map((x) => `${x.title}${x.type === "permanent" ? "" : ` (${x.type})`}`).join(", ")} />
        <Fact label="Teams"
          value={p.teams.length === 0 ? "none" :
            p.teams.map((t) => `${t.name}${t.isLead ? " (lead)" : ""}`).join(", ")} />
        <Fact label="Job title" value={p.jobTitle ?? "not set"} />
      </dl>

      {p.status !== "active" && (
        <p className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          This membership is <strong>{p.status}</strong>. Everything below is denied by that alone —
          `is_staff_of` reads the status, so nothing else is consulted.
        </p>
      )}

      <Group id="modules" label={`Modules — ${modules.filter((m) => m.visible).length} of ${modules.length} visible`}
        open={openGroup === "modules"} onToggle={setOpenGroup}>
        <ul className="space-y-0.5">
          {modules.map((m) => (
            <Row key={m.path} name={m.label} allowed={m.access === "allow"}
              locked={m.access === "locked"} reason={m.reason} />
          ))}
        </ul>
      </Group>

      <Group id="partners" label={`Partners — ${access.partners.filter((x) => x.allowed).length} of ${access.partners.length}`}
        open={openGroup === "partners"} onToggle={setOpenGroup}>
        <ScopeList rows={access.partners} empty="No partners exist yet." />
      </Group>

      <Group id="services" label={`Service engagements — ${access.services.filter((x) => x.allowed).length} of ${access.services.length}`}
        open={openGroup === "services"} onToggle={setOpenGroup}>
        <ScopeList rows={access.services} empty="No service engagements exist yet." />
      </Group>

      <Group id="channels" label={`Conversations — ${access.channels.filter((x) => x.allowed).length} of ${access.channels.length}`}
        open={openGroup === "channels"} onToggle={setOpenGroup}>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            This list mirrors the notification rule, which is deliberately narrower than the
            reading rule — so it may show fewer conversations than they can actually open, never
            more.
          </p>
          <ScopeList rows={access.channels} empty="No conversations yet." />
      </Group>

      <Group id="capabilities" label={`Capabilities — ${granted.length} of ${access.capabilities.length} held`}
        open={openGroup === "capabilities"} onToggle={setOpenGroup}>
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          Security-relevant ones first. The source is the rule that decided it.
        </p>
        <ul className="space-y-0.5">
          {[...security, ...access.capabilities.filter((c) => !c.securityRelevant)].map((c) => (
            <Row key={c.key} name={c.label} allowed={c.allowed} reason={c.source}
              detail={c.key} />
          ))}
        </ul>
      </Group>
    </section>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-semibold",
        tone === "danger" ? "text-status-danger" : "text-foreground")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function Group({
  id, label, open, onToggle, children,
}: {
  id: string; label: string; open: boolean;
  onToggle: (id: string | null) => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-bold text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

function ScopeList({ rows, empty }: { rows: PreviewScopeRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <Row key={r.id} name={r.name} allowed={r.allowed} reason={r.reason} detail={r.context} />
      ))}
    </ul>
  );
}

function Row({
  name, allowed, locked, reason, detail,
}: {
  name: string; allowed: boolean; locked?: boolean; reason: string; detail?: string | null;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-xs odd:bg-muted/30">
      <span className="shrink-0">
        {locked ? <Minus className="h-3 w-3 text-muted-foreground" aria-label="Locked" />
                : allowed ? <Check className="h-3 w-3 text-status-success" aria-label="Allowed" />
                          : <Minus className="h-3 w-3 text-muted-foreground" aria-label="Denied" />}
      </span>
      <span className="min-w-0 font-semibold text-foreground">{name}</span>
      {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
      <span className={cn("ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
        locked ? "bg-muted text-muted-foreground"
               : allowed ? "bg-status-success/10 text-status-success"
                         : "bg-muted text-muted-foreground")}>
        {locked ? "NOT READY" : allowed ? "ALLOWED" : "DENIED"}
      </span>
      <span className="w-full text-[10px] leading-snug text-muted-foreground">{reason}</span>
    </li>
  );
}
