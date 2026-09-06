/**
 * Departments — how the company is organised, and who belongs where.
 *
 * Everyone in the organization may look; a person with "Invite and manage
 * team members" can add, rename, re-lead and archive. Archiving keeps the
 * department in the record and simply releases its people (rule 11).
 */
import { useMemo, useState } from "react";
import { Archive, Building2, Loader2, Plus, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/common/Avatar";
import { useAgency } from "@/lib/agency-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { useAvatarUrls } from "@/lib/data/use-account";
import { useOrganizationDepartments, useOrganizationDirectory } from "@/lib/data/use-directory";
import type { OrganizationDepartment } from "@/lib/data/directory";
import { errorMessage } from "@/lib/data/error-message";
import { cn } from "@/lib/utils";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export default function CompanyDepartments() {
  const { activeOrganization } = useAgency();
  const organizationId = activeOrganization?.id ?? null;
  const departments = useOrganizationDepartments(organizationId);
  const directory = useOrganizationDirectory(organizationId);
  const permissions = usePermissions();
  const canManage = permissions.canAsMember("team.manage");
  const avatars = useAvatarUrls(directory.people.map((p) => p.avatarPath));
  const [editing, setEditing] = useState<OrganizationDepartment | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membersOf = useMemo(() => {
    const m = new Map<string, typeof directory.people>();
    for (const p of directory.people) {
      const key = p.departmentId ?? "";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [directory.people]);

  const unassigned = membersOf.get("") ?? [];
  const close = () => { setComposing(false); setEditing(null); setError(null); };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Building2 className="h-6 w-6 text-primary" /> Departments
          </h1>
          <p className="text-sm text-muted-foreground">How your company is organised, and who belongs where.</p>
        </div>
        {canManage && !composing && (
          <Button type="button" size="sm" onClick={() => setComposing(true)}><Plus className="mr-1 h-4 w-4" /> New department</Button>
        )}
      </div>

      {composing && organizationId && (
        <DepartmentForm
          organizationId={organizationId}
          initial={editing}
          people={directory.people}
          saving={departments.save.isPending}
          error={error}
          onCancel={close}
          onSave={(input) => departments.save.mutate(input, { onSuccess: close, onError: (e) => setError(errorMessage(e, "The department could not be saved.")) })}
        />
      )}

      {departments.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : departments.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load departments: {departments.error}</p>
      ) : departments.departments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No departments yet</p>
          <p className="text-xs text-muted-foreground">
            {canManage ? "Create the teams your company is actually organised into — Sales, Processing, Support — then put people in them from People." : "Your administrator has not set these up yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.departments.map((d) => {
            const members = membersOf.get(d.id) ?? [];
            const lead = directory.people.find((p) => p.userId === d.leadUserId);
            return (
              <section key={d.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground">{d.name}</h2>
                    {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(d); setComposing(true); }}>Edit</Button>
                      <Button
                        type="button" size="sm" variant="ghost" title="Archive — people are released, history is kept"
                        disabled={departments.archive.isPending}
                        onClick={() => departments.archive.mutate(d.id, { onError: (e) => setError(errorMessage(e, "Could not archive.")) })}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <UserRound className="h-3 w-3" /> {lead ? <>Led by <span className="font-semibold text-foreground">{lead.preferredName || lead.name}</span></> : "No lead set"} · {members.length} {members.length === 1 ? "person" : "people"}
                </p>
                {members.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {members.slice(0, 12).map((p) => (
                      <li key={p.membershipId} title={`${p.preferredName || p.name}${p.jobTitle ? ` · ${p.jobTitle}` : ""}`}>
                        <Avatar name={p.preferredName || p.name} url={p.avatarPath ? avatars.data?.[p.avatarPath] : null} size="sm" />
                      </li>
                    ))}
                    {members.length > 12 && <li className="self-center text-[11px] text-muted-foreground">+{members.length - 12}</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <p className={cn("mt-4 text-xs text-muted-foreground")}>
          {unassigned.length} {unassigned.length === 1 ? "person is" : "people are"} not in a department yet.{" "}
          {canManage && <Link to="/app/people" className="font-semibold text-primary hover:underline">Assign them from People</Link>}
        </p>
      )}
      {error && !composing && <p role="alert" className="mt-3 text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function DepartmentForm({
  organizationId, initial, people, saving, error, onSave, onCancel,
}: {
  organizationId: string;
  initial: OrganizationDepartment | null;
  people: { userId: string; name: string; preferredName: string | null }[];
  saving: boolean;
  error: string | null;
  onSave: (input: { id: string | null; organizationId: string; name: string; description: string | null; leadUserId: string | null; sort: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [leadUserId, setLeadUserId] = useState(initial?.leadUserId ?? "");
  const valid = name.trim().length > 0;

  return (
    <form
      className="mb-5 space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ id: initial?.id ?? null, organizationId, name, description: description || null, leadUserId: leadUserId || null, sort: initial?.sort ?? 100 }); }}
    >
      <p className="text-sm font-bold text-foreground">{initial ? "Edit department" : "New department"}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className={labelCls}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} required placeholder="Processing" />
        </label>
        <label className="text-sm sm:col-span-2"><span className={labelCls}>What it does (optional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} maxLength={300} />
        </label>
        <label className="text-sm"><span className={labelCls}>Lead</span>
          <select value={leadUserId} onChange={(e) => setLeadUserId(e.target.value)} className={inputCls}>
            <option value="">No lead</option>
            {people.map((p) => <option key={p.userId} value={p.userId}>{p.preferredName || p.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} {initial ? "Save changes" : "Create department"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
