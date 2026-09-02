import { Building2, Boxes, Users, ShieldCheck, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAgency } from "@/lib/agency-context";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { SectionCard, Field, StatusBadge, ToggleRow } from "../shared";
import type { EntitlementState } from "@/lib/agency-settings-context";

/* ---------------- Agency & Branding ---------------- */
export const AgencyBrandingSection = () => {
  const { agency, setAgency, markSaved } = useAgencySettings();
  return (
    <SectionCard
      icon={Building2}
      title="Agency & Brand"
      description="BES company identity, support information, platform URLs, and global branding."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name">
          <Input
            value={agency.name}
            onChange={(e) => setAgency({ name: e.target.value })}
          />
        </Field>
        <Field label="Support email">
          <Input
            value={agency.supportEmail}
            onChange={(e) => setAgency({ supportEmail: e.target.value })}
          />
        </Field>
        <Field label="Support phone">
          <Input
            value={agency.supportPhone}
            onChange={(e) => setAgency({ supportPhone: e.target.value })}
          />
        </Field>
        <Field label="Platform URL">
          <Input
            value={agency.platformUrl}
            onChange={(e) => setAgency({ platformUrl: e.target.value })}
          />
        </Field>
        <Field label="Legal / terms URL">
          <Input
            value={agency.legalUrl}
            onChange={(e) => setAgency({ legalUrl: e.target.value })}
          />
        </Field>
        <Field label="Timezone">
          <Input
            value={agency.timezone}
            onChange={(e) => setAgency({ timezone: e.target.value })}
          />
        </Field>
        <Field label="Default currency">
          <Input
            value={agency.currency}
            onChange={(e) => setAgency({ currency: e.target.value })}
          />
        </Field>
        <Field label="Logo URL" hint="Used across portals and emails.">
          <Input
            value={agency.logoUrl}
            placeholder="https://…/logo.png"
            onChange={(e) => setAgency({ logoUrl: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          className="bg-gradient-green text-white hover:opacity-90"
          onClick={markSaved}
        >
          Save brand settings
        </Button>
      </div>
    </SectionCard>
  );
};

/* ---------------- Sub-Accounts ---------------- */
export const SubAccountsSection = () => {
  const { subAccounts, switchToSubAccount, toggleFulfillmentSubscription } =
    useAgency();
  return (
    <SectionCard
      icon={Network}
      title="Sub-Accounts"
      description="Create, activate, suspend, and configure customer organizations. Archive instead of hard-delete to preserve operational history."
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Organization</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">DFY</th>
              <th className="px-4 py-2.5 font-medium">Clients</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subAccounts.map((s) => (
              <tr key={s.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.ownerName} · {s.code}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px]">
                    {s.plan}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge state={s.status} />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleFulfillmentSubscription(s.id)}
                    className={`text-[11px] font-medium ${s.isFulfillmentSubscriber ? "text-emerald-600" : "text-muted-foreground"}`}
                  >
                    {s.isFulfillmentSubscriber ? "Subscribed" : "Self-managed"}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.activeClients}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => switchToSubAccount(s.id)}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

/* ---------------- Products & Entitlements ---------------- */
export const ProductsSection = () => {
  const { products, setProductState } = useAgencySettings();
  const states: EntitlementState[] = [
    "Active",
    "Trial",
    "Suspended",
    "Cancelled",
  ];
  return (
    <SectionCard
      icon={Boxes}
      title="Products & Entitlements"
      description="Control which products exist and what each Sub-Account has activated. Supports Active / Trial / Suspended / Cancelled, plans, limits, and add-ons."
    >
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.key} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  Plan: {p.plan} · Limit: {p.limit}
                </p>
                {p.addons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.addons.map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="text-[10px] border-primary/30 text-primary"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {states.map((st) => (
                  <button
                    key={st}
                    onClick={() => setProductState(p.key, st)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      p.state === st
                        ? "bg-gradient-green text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

/* ---------------- Agency Users ---------------- */
export const AgencyUsersSection = () => {
  const { users, toggleUserActive, toggleUserAssignedOnly } =
    useAgencySettings();
  return (
    <SectionCard
      icon={Users}
      title="Agency Users"
      description="BES employees only. Every user follows an explicit lifecycle: Invited → Role Assigned → Scope Assigned → Delivery Assignments → Access Approved."
    >
      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-green text-xs font-semibold text-white">
                {u.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{u.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {u.email} · {u.role} · {u.scope}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Assigned only
                </span>
                <Switch
                  checked={u.assignedOnly}
                  onCheckedChange={() => toggleUserAssignedOnly(u.id)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Active
                </span>
                <Switch
                  checked={u.active}
                  onCheckedChange={() => toggleUserActive(u.id)}
                />
              </div>
              <StatusBadge state={u.active ? "Active" : "Suspended"} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

/* ---------------- Roles & Permissions ---------------- */
export const RolesPermissionsSection = () => {
  const { permissions } = useAgencySettings();
  const cols: { key: keyof (typeof permissions)[number]; label: string }[] = [
    { key: "view", label: "View" },
    { key: "create", label: "Create" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete" },
    { key: "assign", label: "Assign" },
    { key: "approve", label: "Approve" },
    { key: "export", label: "Export" },
    { key: "manageSettings", label: "Settings" },
  ];
  return (
    <SectionCard
      icon={ShieldCheck}
      title="Roles & Permissions"
      description="Role = what can they do. Scope = where. Assignment = which records. One centralized authorization engine — fail closed when context is missing."
    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Role</th>
              {cols.map((c) => (
                <th key={c.key} className="px-3 py-2.5 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {permissions.map((p) => (
              <tr key={p.role} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">
                  {p.role}
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-3 text-center">
                    {p[c.key] ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

/* ---------------- Divisions / Departments / Teams ---------------- */
export const AgencyStructureSection = () => (
  <SectionCard
    icon={Network}
    title="Agency Structure"
    description="Divisions, departments, teams, job roles, and work types. Department is operational structure, not automatically a security rank."
  >
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Divisions
        </p>
        <div className="space-y-2">
          {["CreditOps Division", "FundingOps Division", "Fulfillment"].map(
            (d) => (
              <div
                key={d}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <span className="font-medium text-foreground">{d}</span>
                <Badge variant="outline" className="text-[10px]">
                  Active
                </Badge>
              </div>
            ),
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Teams
        </p>
        <div className="space-y-2">
          {[
            { t: "Processing Team", l: "Carlos Mendoza" },
            { t: "QA Team", l: "Keila Betancourt" },
            { t: "Complaints", l: "Unassigned" },
          ].map((tm) => (
            <div
              key={tm.t}
              className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium text-foreground">{tm.t}</span>
              <span className="text-[11px] text-muted-foreground">
                Lead: {tm.l}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </SectionCard>
);
