/**
 * Route-level entitlement guard.
 *
 * The sidebar already hides modules an organization is not entitled to, and the
 * database now refuses their records. This closes the middle: typing the URL.
 * Rule 3 requires both layers every time — hiding a link is presentation, and
 * a module that renders (however empty) for a customer who has not bought it is
 * the wrong answer to a direct navigation.
 *
 * BES Agency HQ is not entitlement-gated. Its CreditOps and FundingOps screens
 * are BES's own fulfillment workspace across every customer it serves, not a
 * product the agency subscribes to (rule 16: fulfillment is not subscription).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import type { ProductKey } from "@/lib/bes-domain";

const NotEntitled = ({ product }: { product: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Lock className="h-5 w-5" />
    </div>
    <h1 className="text-lg font-bold text-foreground">
      {product} is not enabled for this organization
    </h1>
    <p className="max-w-md text-sm text-muted-foreground">
      This module is not part of the current plan. Ask your BES account manager
      to enable it.
    </p>
    <Link
      to="/app"
      className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
    >
      Back to Home
    </Link>
  </div>
);

export const RequireEntitlement = ({
  product,
  label,
  children,
}: {
  product: ProductKey;
  /** Human name for the refusal message. */
  label: string;
  children: ReactNode;
}) => {
  const { viewMode, isProductOn } = useAgency();

  // BES HQ works every customer it is engaged for; the gate is the fulfillment
  // relationship, enforced in the database, not an entitlement on BES itself.
  if (viewMode === "agency") return <>{children}</>;

  return isProductOn(product) ? (
    <>{children}</>
  ) : (
    <NotEntitled product={label} />
  );
};
