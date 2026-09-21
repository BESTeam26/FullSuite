/**
 * Client Info — the person this case is about.
 *
 * ── WHAT THIS REPLACED, AND WHY IT MATTERED ───────────────────────────────
 *
 * Every field here was a literal. Open any real client — a person BES is
 * actually working for — and the screen said Maria Gonzalez, born 10/29/1994,
 * +1 (844) 797-5866, 139 Coxe St, Hazleton PA. The same invented person on
 * all nineteen files. An agent reading a phone number off this screen would
 * have dialled a number belonging to nobody they meant to call.
 *
 * It also carried controls that did nothing: an email box held in React state
 * that no save ever read, an "Edit" pencil with no handler, and a Social
 * Security reveal that unmasked the literal `000-00-0000`. A dead visible
 * control is a defect in its own right (rule 21b).
 *
 * ── WHERE THE TRUTH LIVES ─────────────────────────────────────────────────
 *
 * The canonical `clients` row — the PERSON — not the credit case. Name, date
 * of birth and postal address are shared with FundingOps, the portals and the
 * dispute letters, which are written FROM the consumer's own address (rule 2).
 * `useClientFile` fetches the case, the person and the department statuses in
 * one request.
 *
 * ── GAPS ARE SHOWN AS GAPS ────────────────────────────────────────────────
 *
 * Six of nineteen clients have an address on file and six have a date of
 * birth. A blank reads "Not recorded", because a Metro 2 dispute needs the
 * address and the agent needs to know to collect it. Inventing a placeholder
 * is what put Maria Gonzalez here.
 *
 * Read-only on purpose. Editing a canonical identity is a governed write with
 * an audit trail, not a text box; until that exists, showing one would be the
 * same lie in a new shape.
 */
import { CreditMonitoringCard } from "./CreditMonitoringCard";
import { AdditionalLoginsCard } from "./AdditionalLoginsCard";
import { AgreementCard, PortalCard } from "./AgreementPortalCards";
import { useClientFile, type ClientFile } from "@/lib/data/client-file";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

function InfoCard({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

/** A blank is "Not recorded" and reads as muted — never a plausible-looking value. */
function Field({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  const missing = !value || !value.trim();
  return (
    <div className={cn(wide && "col-span-2")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm", missing ? "italic text-muted-foreground" : "font-medium text-foreground")}>
        {missing ? "Not recorded" : value}
      </p>
    </div>
  );
}

const AccountTab = ({ caseId }: { caseId?: string }) => {
  const { file, isLoading, error } = useClientFile(caseId);

  if (!caseId || (!isLoading && !file && !error)) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        This client could not be found, so there is nothing to show. Open one from Clients.
      </p>
    );
  }
  if (isLoading) {
    return <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading the client record…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-status-danger-tint p-6 text-sm text-status-danger">
        The client record could not be loaded. {error}
      </p>
    );
  }

  return <ClientInfo file={file as ClientFile} />;
};

function ClientInfo({ file }: { file: ClientFile }) {
  const id = file.identity;
  const cityLine = [id?.city, id?.state].filter(Boolean).join(", ");
  const address = [cityLine, id?.postalCode].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      {id?.needsReview && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-foreground">
          <strong className="font-bold">This record is flagged for review.</strong>{" "}
          {id.reviewNote?.trim() || "Somebody marked it as needing checking before it is relied on."}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <InfoCard title="Client information"
          note={id?.publicId ? `ID ${id.publicId}` : file.publicId ? `Case ${file.publicId}` : undefined}>
          <Field label="Full name" value={id?.fullName ?? file.name} />
          <Field label="Goes by" value={id?.preferredName ?? null} />
          <Field label="Date of birth" value={id?.dateOfBirth ? formatDate(id.dateOfBirth) : null} />
          <Field label="Program started" value={file.programStartedOn ? formatDate(file.programStartedOn) : null} />
          <Field label="Email" value={id?.email ?? file.email} />
          <Field label="Phone" value={id?.phone ?? file.phone} />
        </InfoCard>

        <InfoCard title="Address"
          note="Dispute letters are sent FROM this address">
          <Field label="Street" value={id?.addressLine1 ?? null} wide />
          <Field label="Apartment, suite" value={id?.addressLine2 ?? null} wide />
          <Field label="City, state, ZIP" value={address || null} wide />
          {!id?.addressLine1 && (
            <p className="col-span-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
              No address on file. A mailed dispute letter needs one, and the Metro 2
              identity checks compare against it — collect it before the first round.
            </p>
          )}
        </InfoCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <InfoCard title="This case">
          <Field label="Status" value={file.status} />
          <Field label="Round" value={file.round} />
          <Field label="Assigned agent" value={file.assignedAgentName} />
          <Field label="Partner" value={file.partnerName} />
          <Field label="Working notes" value={file.description} wide />
          <Field label="Next action" value={file.nextAction} wide />
        </InfoCard>

        <CreditMonitoringCard provider="IdentityIQ" />
      </div>

      <AdditionalLoginsCard />
      <AgreementCard />
      <PortalCard />
    </div>
  );
}

export default AccountTab;
