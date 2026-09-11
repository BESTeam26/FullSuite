/**
 * Sensitive Identity, Credit Monitoring and Portal Access on a client record.
 *
 * ── MASKING IS NOT THE SECURITY ────────────────────────────────────────────
 *
 * The list this renders carries no secret values at all — only that a secret
 * exists and what it is for. A value arrives one at a time, from a database
 * function that checks the capability and writes an audit row BEFORE it
 * answers. So an unauthorized viewer is not shown dots over a value that was
 * in the payload all along; the value never left the server (rule 1).
 *
 * The dots are therefore a convenience against somebody reading over a
 * shoulder, which is a real risk in a call centre and a different one from
 * authorization.
 *
 * Revealing is deliberate and it is logged. Hiding again drops the value from
 * memory, so a panel left open on a screen is not still holding an SSN.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  fetchClientSecretsForWorkFile, revealClientSecret,
  type ClientSecret, type ClientSecretKind,
} from "@/lib/data/client-secrets";
import { formatDate } from "@/lib/format-date";

const SECTIONS: { kind: ClientSecretKind; title: string; blurb: string }[] = [
  { kind: "ssn", title: "Sensitive Identity", blurb: "Held encrypted. Every reveal is recorded." },
  { kind: "monitoring", title: "Credit Monitoring", blurb: "The client's monitoring provider login." },
  { kind: "cfpb", title: "Portal Access", blurb: "Complaint portal accounts BES created." },
];

function SecretRow({ secret, canReveal }: { secret: ClientSecret; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const reveal = async () => {
    if (value) { setValue(null); return; }   // hide, and drop it from memory
    setBusy(true);
    try {
      setValue(await revealClientSecret(secret.id));
    } catch (e) {
      toast({ title: "Could not reveal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      /* Fetched fresh rather than copying what is on screen, so Copy works
         without revealing first — and is audited exactly the same way. */
      const v = value ?? (await revealClientSecret(secret.id));
      await navigator.clipboard.writeText(v);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      toast({ title: "Could not copy", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {secret.label ?? secret.provider ?? "Stored value"}
        </p>
        {secret.username && (
          <p className="truncate text-[11px] text-muted-foreground">{secret.username}</p>
        )}
        {secret.lastRotatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Updated {formatDate(secret.lastRotatedAt)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
          {value ?? "••••••••••"}
        </code>
        {canReveal && secret.hasValue ? (
          <>
            <button
              type="button"
              onClick={() => void reveal()}
              disabled={busy}
              aria-label={value ? "Hide" : "Reveal"}
              aria-pressed={!!value}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                    : value ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy"
              className="flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? <><Check className="h-3.5 w-3.5 text-status-success" /> Copied</>
                      : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {secret.hasValue ? "Permission required" : "Nothing stored"}
          </span>
        )}
      </div>
    </div>
  );
}

export function ClientSecretsPanel({ clientId }: { clientId: string }) {
  /* `clientId` here is the CreditOps work-file id, which is what every caller
     holds; the secrets hang off the canonical person behind it. */
  const perms = useAgencyPermissions();
  const canReveal = perms.can("creditops.clients.sensitive");
  const q = useQuery({
    queryKey: ["client-secrets", clientId],
    queryFn: () => fetchClientSecretsForWorkFile(clientId),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const secrets = q.data ?? [];
  if (q.isLoading) {
    return <ContentCard title="Identity &amp; Access"><p className="text-xs text-muted-foreground">Loading…</p></ContentCard>;
  }
  if (secrets.length === 0) {
    return (
      <ContentCard title="Identity &amp; Access">
        <p className="text-xs text-muted-foreground">
          Nothing on file yet. An SSN, monitoring login or portal account added here is
          encrypted, and every reveal is recorded.
        </p>
      </ContentCard>
    );
  }

  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => {
        const rows = secrets.filter((s) => s.kind === section.kind);
        if (rows.length === 0) return null;
        return (
          <ContentCard key={section.kind} title={section.title}>
            <p className="mb-2 text-[11px] text-muted-foreground">{section.blurb}</p>
            <div className="space-y-2">
              {rows.map((s) => <SecretRow key={s.id} secret={s} canReveal={canReveal} />)}
            </div>
          </ContentCard>
        );
      })}
      {!canReveal && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          You can see what is on file. Revealing a value needs the client-identity permission.
        </p>
      )}
    </div>
  );
}
