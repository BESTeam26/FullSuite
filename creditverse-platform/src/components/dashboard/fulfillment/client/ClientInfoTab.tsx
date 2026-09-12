/**
 * Everything about the PERSON, in one place.
 *
 * Dee, 2026-09-12: "Do not keep separate giant cards for Sensitive Identity
 * and Credit Monitoring." Contact details were at the top of the page, the
 * round was in an assignment card, and the SSN and the monitoring login were
 * in a third panel down the right-hand side — three places to look for facts
 * about one person.
 *
 * The protected half is unchanged in every way that matters: still encrypted
 * in the Vault, still masked, still revealed one field at a time, still
 * audited before the value is returned, still capability-gated. It simply
 * sits where somebody looks for it.
 */
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { ClientSecretsPanel } from "@/components/dashboard/fulfillment/ClientSecretsPanel";
import { FundingReadinessCard } from "@/components/dashboard/fulfillment/FundingReadinessCard";
import { formatDate } from "@/lib/format-date";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-0.5 break-words text-xs text-foreground">
      {value || <span className="text-muted-foreground">Not recorded</span>}
    </p>
  </div>
);

export function ClientInfoTab({
  client,
  hasFunding,
}: {
  client: FulfillmentClient;
  /* The funding card appears only when a funding relationship exists. Dee:
     "Do not show an empty Funding card on every CreditOps client." */
  hasFunding: boolean;
}) {
  const c = client as FulfillmentClient & {
    dateOfBirth?: string | null;
    address?: string | null;
  };

  return (
    <div className="space-y-3">
      <ContentCard title="Contact">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={client.name} />
          <Field label="Phone" value={client.phone} />
          <Field label="Email" value={client.email} />
          <Field label="Address" value={c.address} />
        </div>
      </ContentCard>

      <ContentCard title="Credit file">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Current round" value={client.round} />
          <Field label="Credit status" value={client.status} />
          <Field label="Date of birth" value={c.dateOfBirth ? formatDate(c.dateOfBirth) : null} />
          <Field label="Client since" value={client.createdAt ? formatDate(client.createdAt) : null} />
        </div>
      </ContentCard>

      {/* Identity, monitoring and portal access. Its own component because the
          reveal/copy/audit behaviour is genuinely intricate and belongs in one
          tested place — not because it is a separate subject. */}
      <ClientSecretsPanel clientId={client.id} />

      {hasFunding && <FundingReadinessCard fulfillmentClientId={client.id} />}
    </div>
  );
}
