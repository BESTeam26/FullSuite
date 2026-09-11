/**
 * The relationship at a glance — not one service, and not a CreditOps screen.
 *
 * A partner may be a CreditOps company with five hundred clients or somebody
 * who bought one build. This tab has to read correctly for both, so nothing on
 * it assumes end clients exist, and "no clients" is shown as an answer rather
 * than a gap.
 *
 * Money appears here only for somebody the database would give it to. Not
 * greyed out, not locked: absent (Dee, 2026-09-07 — "if they don't have
 * access, do not show it").
 */
import { useState } from "react";
import { HeartPulse, Loader2 } from "lucide-react";
import { PartnerImportAction } from "@/components/agency/partner/PartnerImportAction";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { Detail, Pill } from "@/components/agency/partner/partner-ui";
import {
  HEALTH_LABEL, HEALTH_TONE, PARTNER_HEALTHS, SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE,
  clientVolume, daysActive, formatDaysActive, rollUpServices,
  type PartnerHealth,
} from "@/lib/partners/partner-account";
import { usePartnerActions } from "@/lib/data/use-agency-partners";
import type { AgencyPartner } from "@/lib/data/agency-partners";
import type { PartnerService } from "@/lib/data/partner-services";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import { formatDate } from "@/lib/format-date";

export function PartnerOverviewTab({ partner, services, people, teams, clientCount, catalogue }: {
  partner: AgencyPartner;
  services: PartnerService[];
  people: AgencyPerson[];
  teams: AgencyTeam[];
  clientCount: number | null;
  catalogue: Record<string, string>;
}) {
  const actions = usePartnerActions();
  const [editingHealth, setEditingHealth] = useState(false);
  const [health, setHealth] = useState<PartnerHealth>(partner.health ?? "neutral");
  const [note, setNote] = useState(partner.healthNote ?? "");

  const roll = rollUpServices(services.map((s) => ({
    id: s.id, name: s.name, serviceType: s.serviceType, status: s.status,
  })));
  const volume = clientVolume(clientCount, partner.legacyClientVolume, partner.legacyActiveClients);
  const manager = people.find((p) => p.userId === partner.accountManagerId);
  const team = teams.find((t) => t.id === partner.teamId);
  const days = daysActive(partner.startedOn, new Date().toISOString());

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <ContentCard title="Relationship">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Company" value={partner.companyName} />
            <Detail label="Primary contact" value={partner.primaryContact} />
            <Detail label="Contact email" value={partner.contactEmail} />
            <Detail label="Phone" value={partner.phone} />
            <Detail label="Started" value={formatDate(partner.startedOn)}
              hint={days === null ? undefined : `${formatDaysActive(days)} with BES`} />
            <Detail label="BES SaaS plan" value={partner.saasPlan}
              hint="Their software subscription — separate from what BES does for them" />
            <Detail label="Account manager" value={manager?.name ?? null} />
            <Detail label="Team" value={team?.name ?? null} />
            <Detail label="Contract reference" value={partner.contractRef} />
          </dl>
          {partner.address && <Detail className="mt-3" label="Address" value={partner.address} />}
          {partner.notes && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Relationship notes</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{partner.notes}</p>
            </div>
          )}
          {partner.credentialMigrationRequired && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
              A legacy record for this partner carried a password or key. It was <strong>not</strong> copied
              into any field here — credentials need a mechanism that encrypts them and audits every
              read, which this record is not. Marked for that migration.
            </p>
          )}
        </ContentCard>

        <ContentCard title="Services running now">
          {services.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No service engagements recorded yet. A partner is the account; what BES sells
              them lives on the Services tab.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <li key={s.id}>
                    <Pill tone={SERVICE_STATUS_TONE[s.status]}>
                      {s.serviceType ? catalogue[s.serviceType] ?? s.name : s.name}
                      <span className="ml-1.5 font-normal opacity-70">{SERVICE_STATUS_LABEL[s.status]}</span>
                    </Pill>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {roll.live} running{roll.pending > 0 && ` · ${roll.pending} pending`}
                {roll.historical > 0 && ` · ${roll.historical} finished or cancelled, kept as history`}
              </p>
            </>
          )}
        </ContentCard>
      </div>

      <div className="space-y-3">
        <ContentCard
          title={<span className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-muted-foreground" /> Partner health</span>}
          action={
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => setEditingHealth((v) => !v)}>
              {editingHealth ? "Cancel" : partner.health ? "Change" : "Record"}
            </Button>
          }
        >
          {!editingHealth ? (
            partner.health ? (
              <>
                <Pill tone={HEALTH_TONE[partner.health]}>{HEALTH_LABEL[partner.health]}</Pill>
                {partner.healthNote && <p className="mt-2 text-sm text-foreground">{partner.healthNote}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Recorded {formatDate(partner.healthChangedAt)}
                  {partner.healthChangedBy &&
                    ` by ${people.find((p) => p.userId === partner.healthChangedBy)?.name ?? "a colleague"}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody has recorded how this relationship feels. It is a judgement someone
                makes — never worked out from revenue or client count.
              </p>
            )
          ) : (
            <div className="space-y-2">
              <OpsSelect aria-label="Partner health" size="field" value={health}
                onValueChange={(v) => setHealth(v as PartnerHealth)}
                options={PARTNER_HEALTHS.map((h) => ({ value: h, label: HEALTH_LABEL[h] }))} />
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="What happened? (optional)" aria-label="Health note" />
              <Button size="sm" disabled={actions.setHealth.isPending}
                onClick={async () => {
                  await actions.setHealth.mutateAsync({ id: partner.id, health, note });
                  setEditingHealth(false);
                }}>
                {actions.setHealth.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </ContentCard>

        <ContentCard title="End clients">
          {volume.kind === "canonical" ? (
            <>
              <p className="text-2xl font-bold tabular-nums text-foreground">{volume.count}</p>
              <p className="text-xs text-muted-foreground">
                {volume.count === 0
                  ? "None — which is normal for a build, retainer or staffing partner."
                  : "Counted from real client records, not a typed figure."}
              </p>
              {volume.legacy && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The old tracker said &ldquo;{volume.legacy}&rdquo;.
                </p>
              )}
            </>
          ) : volume.kind === "legacy_only" ? (
            <>
              <p className="text-2xl font-bold text-foreground">{volume.text}</p>
              <p className="text-xs text-muted-foreground">
                From the legacy tracker. No client records have been created in BES yet, so
                this is what somebody wrote down rather than a count.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Not recorded.</p>
          )}
        </ContentCard>

        <ContentCard title="Migration">
          <p className="mb-3 text-xs text-muted-foreground">
            Bring this partner&rsquo;s clients across from ClickUp — records, comments,
            attachments and logins. Running it again updates the same clients rather than
            creating duplicates.
          </p>
          <PartnerImportAction partner={partner} />
        </ContentCard>
      </div>
    </div>
  );
}
