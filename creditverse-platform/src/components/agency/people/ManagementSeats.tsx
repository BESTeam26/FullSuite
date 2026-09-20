/**
 * Management seats — People & Teams › Structure is the canonical place for
 * organizational authority (Dee, 2026-09-20). A seat is placement: it says
 * where a person sits. Scope follows from the operational seats through the
 * database's placement helpers; capabilities (money, administration) stay
 * separate and are granted on Access. Administrators grant and end seats;
 * everyone on staff may read them, as the org chart does.
 */
import { useMemo, useState } from "react";
import { Briefcase, Loader2, Plus, X } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth/auth-context";
import { isAdminRole } from "@/lib/agency/navigation";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import { SEAT_KINDS, seatLabel, useManagementSeats, useSeatActions, type SeatKind } from "@/lib/data/management-seats";
import { formatDate } from "@/lib/format-date";

const NONE = "__none__";

export function ManagementSeats() {
  const auth = useAuth();
  const { toast } = useToast();
  const isAdmin = isAdminRole(auth.agencyMembership?.role);
  const seats = useManagementSeats();
  const members = useAgencyMembers();
  const tree = useOrganizationTree();
  const actions = useSeatActions();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ userId: string; seat: SeatKind; divisionId: string; departmentId: string; reason: string }>({ userId: NONE, seat: "department_manager", divisionId: NONE, departmentId: NONE, reason: "" });
  const [ending, setEnding] = useState<string | null>(null);
  const [endReason, setEndReason] = useState("");

  const nameOf = (id: string) => (members.data ?? []).find((m) => m.userId === id)?.name ?? "Someone";
  const divisions = useMemo(() => (tree.data?.divisions ?? []).filter((d) => !d.archived), [tree.data]);
  const departments = useMemo(() => (tree.data?.departments ?? []).filter((d) => !d.archived), [tree.data]);
  const divisionName = (id: string | null) => divisions.find((d) => d.id === id)?.name ?? null;
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;
  const people = (members.data ?? []).filter((m) => m.status === "active").map((m) => ({ value: m.userId, label: m.name }));

  const grant = () => {
    if (form.userId === NONE) return;
    if (form.seat === "division_manager" && form.divisionId === NONE) return;
    if (form.seat === "department_manager" && form.departmentId === NONE) return;
    actions.grant.mutate(
      { userId: form.userId, seat: form.seat, divisionId: form.divisionId === NONE ? null : form.divisionId, departmentId: form.departmentId === NONE ? null : form.departmentId, reason: form.reason },
      {
        onSuccess: () => { toast({ title: "Seat granted", description: "Scope follows placement from now; the change is on the person's history." }); setAdding(false); setForm({ userId: NONE, seat: "department_manager", divisionId: NONE, departmentId: NONE, reason: "" }); },
        onError: (e) => toast({ title: "Could not grant the seat", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };
  const end = (id: string) => actions.end.mutate({ id, reason: endReason }, {
    onSuccess: () => { toast({ title: "Seat ended", description: "The seat is closed as of today; its history stays." }); setEnding(null); setEndReason(""); },
    onError: (e) => toast({ title: "Could not end the seat", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <ContentCard title={<span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /> Management seats</span>}>
      <p className="mb-3 text-xs text-muted-foreground">
        Placement is scope: a Division or Department Manager reaches everything inside what they manage without team membership or partner
        assignment. Team Leads are set on their team below. Money and administration never come from a seat — they are capabilities on Access.
      </p>
      {seats.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {SEAT_KINDS.map((kind) => {
            /* Fixture accounts hold seats for the RLS matrix; the roster does not list them. */
            const known = new Set((members.data ?? []).map((m) => m.userId));
            const rows = (seats.data ?? []).filter((s) => s.seat === kind.value && known.has(s.userId));
            return (
              <li key={kind.value} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{kind.label}</span>
                  <span className="text-[10px] text-muted-foreground">{kind.scope}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{kind.value === "chief_operations" ? "Vacant — lands from Aaron's invitation on acceptance." : "Nobody seated."}</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {rows.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{nameOf(s.userId)}</span>
                          {s.divisionId && <Pill tone="border-primary/40 bg-primary/10 text-foreground">{divisionName(s.divisionId)}</Pill>}
                          {s.departmentId && <Pill tone="border-primary/40 bg-primary/10 text-foreground">{departmentName(s.departmentId)}</Pill>}
                          <span className="text-muted-foreground">since {formatDate(s.effectiveFrom)}</span>
                        </span>
                        {isAdmin && (ending === s.id ? (
                          <span className="inline-flex items-center gap-1">
                            <Input value={endReason} onChange={(e) => setEndReason(e.target.value)} placeholder="Reason" className="h-7 w-44 text-xs" />
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actions.end.isPending} onClick={() => end(s.id)}>End seat</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEnding(null)}><X className="h-3 w-3" /></Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEnding(s.id); setEndReason(""); }}>End</Button>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {isAdmin && (adding ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <label className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Person</span>
            <div className="mt-0.5"><OpsSelect size="field" value={form.userId} onValueChange={(v) => setForm((f) => ({ ...f, userId: v }))} options={[{ value: NONE, label: "Choose a person" }, ...people]} /></div></label>
          <label className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seat</span>
            <div className="mt-0.5"><OpsSelect size="field" value={form.seat} onValueChange={(v) => setForm((f) => ({ ...f, seat: v as SeatKind }))} options={SEAT_KINDS.map((k) => ({ value: k.value, label: k.label }))} /></div></label>
          {form.seat === "division_manager" && (
            <label className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Division</span>
              <div className="mt-0.5"><OpsSelect size="field" value={form.divisionId} onValueChange={(v) => setForm((f) => ({ ...f, divisionId: v }))} options={[{ value: NONE, label: "Choose a division" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]} /></div></label>
          )}
          {form.seat === "department_manager" && (
            <label className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department</span>
              <div className="mt-0.5"><OpsSelect size="field" value={form.departmentId} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v }))} options={[{ value: NONE, label: "Choose a department" }, ...departments.map((d) => ({ value: d.id, label: `${d.name}${divisionName(d.divisionId) ? ` · ${divisionName(d.divisionId)}` : ""}` }))]} /></div></label>
          )}
          <label className="text-xs sm:col-span-2"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason</span>
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why this seat, from when" className="mt-0.5 h-8 text-xs" /></label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={actions.grant.isPending} onClick={grant}>{actions.grant.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Grant seat</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Grant a seat</Button>
      ))}
    </ContentCard>
  );
}
