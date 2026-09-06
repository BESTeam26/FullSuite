/**
 * The CreditOps ⇄ FundingOps hand-off, on both client files.
 *
 *   CreditOps file:  shows the linked funding client (if any) and, while it is
 *                    in Credit Readiness, "Return to FundingOps — qualified".
 *   FundingOps file: shows the linked CreditOps client (if any) and, while the
 *                    funding status allows, "Send to CreditOps for readiness".
 *
 * Rules come from lib/fulfillment/handoff-domain.ts; the writes are the two
 * database functions (atomic, activity on both records, policies decide).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Landmark, Loader2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { fetchLinkedFundingClient, handoffToCreditOps, handoffToFundingOps } from "@/lib/data/handoff";
import { canReturnToFundingOps, canSendToCreditOps } from "@/lib/fulfillment/handoff-domain";

const linkedKey = (fulfillmentClientId: string) => ["funding", "linked-to-credit", fulfillmentClientId];

function useEntitlements() {
  const agency = useAgency();
  const isAgencyView = agency.viewMode === "agency";
  return {
    creditOpsEntitled: isAgencyView || agency.isProductOn("creditOps"),
    fundingOpsEntitled: isAgencyView || agency.isProductOn("fundingOps"),
    isAgencyView,
  };
}

/** On the CreditOps client file. */
export function FundingReadinessCard({ fulfillmentClientId }: { fulfillmentClientId: string }) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const { fundingOpsEntitled, creditOpsEntitled, isAgencyView } = useEntitlements();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = useQuery({
    queryKey: linkedKey(fulfillmentClientId),
    queryFn: () => fetchLinkedFundingClient(fulfillmentClientId),
    enabled: live && fundingOpsEntitled,
    staleTime: 15_000,
  });
  if (!live || !fundingOpsEntitled) return null;
  const f = linked.data ?? null;
  const decision = canReturnToFundingOps({
    fundingStatus: f?.status ?? "",
    linkedFulfillmentClientId: f ? fulfillmentClientId : null,
    creditOpsEntitled,
    fundingOpsEntitled,
  });
  const fundingPath = isAgencyView ? `/app/fundingops?client=${f?.id}` : `/app/funding-workspace?client=${f?.id}`;

  const returnToFunding = async () => {
    setBusy(true); setError(null);
    try {
      await handoffToFundingOps(fulfillmentClientId);
      await queryClient.invalidateQueries({ queryKey: ["funding"] });
      await queryClient.invalidateQueries({ queryKey: ["fundingops", "clients"] });
    } catch (e) { setError(errorMessage(e, "Could not return this client to FundingOps.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Landmark className="h-4 w-4 text-primary" /> Funding
      </h3>
      {linked.isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
      ) : !f ? (
        <p className="mt-2 text-xs text-muted-foreground">No linked funding client. A funding file sent here for readiness will appear with its status.</p>
      ) : (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-foreground">
            Linked funding client: <Link to={fundingPath} className="font-semibold text-primary underline-offset-2 hover:underline">{f.name}</Link>
            {" · "}<span className="font-medium">{f.status}</span>
          </p>
          {f.status === "Credit Readiness" && (
            <button
              type="button"
              onClick={() => void returnToFunding()}
              disabled={!decision.allowed || busy}
              title={"reason" in decision ? decision.reason : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
              Return to FundingOps — qualified
            </button>
          )}
          {error && <p role="alert" className="text-status-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** On the FundingOps client file. */
export function SendToCreditOpsCard({
  fundingClientId,
  fundingStatus,
  linkedFulfillmentClientId,
  onChanged,
}: {
  fundingClientId: string;
  fundingStatus: string;
  linkedFulfillmentClientId: string | null;
  onChanged?: () => void;
}) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const { creditOpsEntitled, fundingOpsEntitled, isAgencyView } = useEntitlements();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!live || !creditOpsEntitled) return null;
  const decision = canSendToCreditOps({ fundingStatus, linkedFulfillmentClientId, creditOpsEntitled, fundingOpsEntitled });
  const creditPath = isAgencyView ? `/app/creditops?client=${linkedFulfillmentClientId}` : `/app/operations?client=${linkedFulfillmentClientId}`;

  const send = async () => {
    setBusy(true); setError(null);
    try {
      await handoffToCreditOps(fundingClientId, linkedFulfillmentClientId);
      await queryClient.invalidateQueries({ queryKey: ["fundingops", "clients"] });
      await queryClient.invalidateQueries({ queryKey: ["creditops", "clients"] });
      onChanged?.();
    } catch (e) { setError(errorMessage(e, "Could not send this client to CreditOps.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <FileText className="h-4 w-4 text-primary" /> Funding readiness (CreditOps)
      </h3>
      <div className="mt-2 space-y-2 text-xs">
        {linkedFulfillmentClientId ? (
          <p className="text-foreground">
            Linked CreditOps client: <Link to={creditPath} className="font-semibold text-primary underline-offset-2 hover:underline">open file</Link>
            {fundingStatus === "Credit Readiness" && <span className="ml-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-status-warning">In credit readiness</span>}
          </p>
        ) : (
          <p className="text-muted-foreground">Not yet sent to CreditOps.</p>
        )}
        {fundingStatus !== "Credit Readiness" && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!decision.allowed || busy}
            title={"reason" in decision ? decision.reason : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
            Send to CreditOps for readiness
          </button>
        )}
        {"reason" in decision && fundingStatus !== "Credit Readiness" && <p className="text-muted-foreground">{decision.reason}</p>}
        {error && <p role="alert" className="text-status-danger">{error}</p>}
      </div>
    </div>
  );
}
