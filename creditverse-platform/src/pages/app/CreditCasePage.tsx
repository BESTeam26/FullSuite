/**
 * A CreditOps client, as its own page.
 *
 * Dee, 2026-09-22, having asked three times: *"I told you to OPEN it instead
 * of a layer into another layer... That's friction."*
 *
 * It was a panel over the list, with Manage opening a second panel over that.
 * A client now has an address. That means a URL you can send somebody, a back
 * button that goes back to the list, "open in a new tab" on the row, and — the
 * point — nothing stacked on top of anything.
 *
 * The card itself is the same component the workspace used, unchanged. Only
 * where it is mounted has moved, which is why the four sections, the checklist
 * and Complete Work all behave exactly as they did.
 *
 * ── THE PROVIDERS ARE THE WORKSPACE'S ─────────────────────────────────────
 *
 * `ClientWorkWorkspace` reads the CreditOps store and access context, so this
 * route mounts the same two providers the workspace page does. The store is
 * RLS-scoped, so a client id the caller may not see resolves to nothing and
 * the card says so rather than claiming a record.
 */
import { useNavigate, useParams } from "react-router-dom";
import { ClientWorkWorkspace } from "@/components/dashboard/fulfillment/ClientWorkWorkspace";
import {
  CreditOpsStoreProvider,
} from "@/lib/fulfillment/creditops-client-store";
import { CreditOpsAccessProvider } from "@/lib/fulfillment/creditops-access";

export default function CreditCasePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="p-6">
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No client was named in the address.
        </p>
      </div>
    );
  }

  return (
    <CreditOpsStoreProvider>
      <CreditOpsAccessProvider>
        <div className="mx-auto max-w-5xl p-4 md:p-6">
          <ClientWorkWorkspace
            clientId={id}
            /* Back to the list they came from, not to whatever was before. */
            onBack={() => navigate("/app/creditops")}
            backLabel="Back to clients"
          />
        </div>
      </CreditOpsAccessProvider>
    </CreditOpsStoreProvider>
  );
}
