/**
 * The partner's agreements: what they have signed, and what is waiting.
 *
 * A projection of `signature_requests` — the same rows the document builder
 * creates and the signing page completes. Nothing here is a portal-specific
 * copy, which is why a signed agreement stays readable here forever without
 * anybody filing a second one.
 */
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Loader2, PenLine } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PageLoadError } from "@/components/common/QueryState";

interface Agreement {
  id: string; title: string; status: string; service: string | null;
  sentAt: string | null; signedAt: string | null; expiresAt: string | null;
  signerName: string | null; signatureName: string | null; token: string | null;
}

const TONE: Record<string, string> = {
  signed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  sent: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  viewed: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  expired: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};
const LABEL: Record<string, string> = {
  signed: "Signed", sent: "Awaiting signature", viewed: "Awaiting signature",
  expired: "Expired", cancelled: "Cancelled",
};

export function PortalAgreements() {
  const auth = useAuth();
  const agreements = useQuery({
    queryKey: ["portal", "agreements"],
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
    queryFn: async (): Promise<Agreement[]> => {
      const { data, error } = await requireSupabase().rpc("my_partner_agreements" as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, title: r.title as string, status: r.status as string,
        service: (r.service as string) ?? null,
        sentAt: (r.sent_at as string) ?? null, signedAt: (r.signed_at as string) ?? null,
        expiresAt: (r.expires_at as string) ?? null,
        signerName: (r.signer_name as string) ?? null,
        signatureName: (r.signature_name as string) ?? null,
        token: (r.token as string) ?? null,
      }));
    },
  });

  if (agreements.isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>;
  }

  if (agreements.isError) return <PageLoadError what="Your agreements" />;

  const rows = agreements.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <FileSignature className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No agreements yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Anything BES sends you to sign appears here, and stays here once signed.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((a) => (
        <li key={a.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{a.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {a.service && <span>{a.service}</span>}
                {a.sentAt && <span>Sent {formatDate(a.sentAt.slice(0, 10))}</span>}
                {a.signedAt && <span>Signed {formatDate(a.signedAt.slice(0, 10))}</span>}
                {a.signatureName && <span>by {a.signatureName}</span>}
                {!a.signedAt && a.expiresAt && <span>Expires {formatDate(a.expiresAt.slice(0, 10))}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium",
                TONE[a.status] ?? "border-border bg-muted text-foreground")}>
                {LABEL[a.status] ?? a.status}
              </span>
              {a.token && (
                <a
                  href={`/sign/${a.token}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PenLine className="h-3.5 w-3.5" /> Sign
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
