/**
 * People — the company directory of the Organization Hub.
 *
 * Who works here, what they do, how to reach them, grouped by department.
 * Everyone in the organization may look; only a person with "Invite and
 * manage team members" can move someone between departments. Birthdays appear
 * only for people who chose to show them (0073).
 */
import { useMemo, useState } from "react";
import { Building2, Cake, Mail, Phone, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/common/Avatar";
import { useAgency } from "@/lib/agency-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { useAvatarUrls } from "@/lib/data/use-account";
import { useOrganizationDepartments, useOrganizationDirectory } from "@/lib/data/use-directory";
import type { DirectoryPerson } from "@/lib/data/directory";
import { ORG_ROLE_LABELS } from "@/lib/fulfillment/role-access-defaults";
import { birthdayLabel } from "@/lib/greetings/birthday";
import { errorMessage } from "@/lib/data/error-message";

const UNASSIGNED = "Not in a department yet";

export default function CompanyPeople() {
  const { activeOrganization } = useAgency();
  const organizationId = activeOrganization?.id ?? null;
  const directory = useOrganizationDirectory(organizationId);
  const departments = useOrganizationDepartments(organizationId);
  const permissions = usePermissions();
  const canManage = permissions.canAsMember("team.manage");
  const avatars = useAvatarUrls(directory.people.map((p) => p.avatarPath));
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = directory.people.filter((p) =>
      !needle ||
      [p.name, p.preferredName, p.email, p.jobTitle, p.departmentName].some((v) => v?.toLowerCase().includes(needle)),
    );
    const m = new Map<string, DirectoryPerson[]>();
    for (const person of matched) {
      const key = person.departmentName ?? UNASSIGNED;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(person);
    }
    /* Departments in their own order, with the unassigned group last. */
    const order = [...departments.departments.map((d) => d.name), UNASSIGNED];
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [directory.people, departments.departments, q]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Users className="h-6 w-6 text-primary" /> People
          </h1>
          <p className="text-sm text-muted-foreground">
            Everyone at {activeOrganization?.name.replace(/^\[TEST\]\s*/, "") ?? "your organization"}, and how to reach them.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full pl-9" aria-label="Search people" />
        </div>
      </div>

      {directory.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : directory.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load the directory: {directory.error}</p>
      ) : directory.people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nobody has joined yet. Invite your team from Settings.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody matches “{q}”.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([department, people]) => (
            <section key={department} aria-label={department}>
              <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3 w-3" /> {department} <span className="font-normal">· {people.length}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {people.map((p) => (
                  <li key={p.membershipId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <Avatar name={p.preferredName || p.name} url={p.avatarPath ? avatars.data?.[p.avatarPath] : null} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{p.preferredName || p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.jobTitle || ORG_ROLE_LABELS[p.platformRole] || "Team member"}</p>
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                          <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> <a href={`mailto:${p.email}`} className="truncate hover:text-foreground hover:underline">{p.email}</a></p>
                          {p.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> <a href={`tel:${p.phone}`} className="hover:text-foreground hover:underline">{p.phone}</a></p>}
                          {p.birthMonth && p.birthDay && <p className="flex items-center gap-1.5"><Cake className="h-3 w-3 shrink-0" /> {birthdayLabel(p.birthMonth, p.birthDay)}</p>}
                        </div>
                      </div>
                    </div>
                    {canManage && departments.departments.length > 0 && (
                      <label className="mt-3 block text-[11px] text-muted-foreground">
                        Department
                        <select
                          value={p.departmentId ?? ""}
                          onChange={(e) => directory.setDepartment.mutate({ membershipId: p.membershipId, departmentId: e.target.value || null })}
                          disabled={directory.setDepartment.isPending}
                          className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          aria-label={`Department for ${p.name}`}
                        >
                          <option value="">Not in a department</option>
                          {departments.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {directory.setDepartment.error && (
        <p role="alert" className="mt-3 text-xs text-status-danger">{errorMessage(directory.setDepartment.error, "That change was not saved.")}</p>
      )}
    </div>
  );
}
