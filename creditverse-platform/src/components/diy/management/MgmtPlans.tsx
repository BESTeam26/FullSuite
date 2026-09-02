import { CreditCard, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const plans = [
  { id: "free", label: "Free", note: "Limited access for self-service review" },
  {
    id: "one-time",
    label: "One-Time",
    note: "Single report + analysis purchase",
  },
  {
    id: "monthly",
    label: "Monthly",
    note: "Recurring subscription for ongoing DIY",
  },
  { id: "included", label: "Included", note: "Bundled with another service" },
  { id: "invite", label: "Invite Only", note: "Closed beta / partner invite" },
];

export const MgmtPlans = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Plans &amp; Pricing</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Frontend plan states. No payment processing in this shell — billing is
        backend-required.
      </p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <Card key={p.id} className="p-5">
          <div className="flex items-center justify-between">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <Badge variant="outline" className="text-[10px]">
              {p.id}
            </Badge>
          </div>
          <h2 className="mt-3 text-lg font-bold">{p.label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
        </Card>
      ))}
    </div>

    <Card className="flex items-start gap-3 bg-muted/30 p-6">
      <Lock className="mt-0.5 h-5 w-5 text-amber-600" />
      <div className="text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">
          Billing &amp; payments not implemented
        </p>
        <p className="mt-1">
          Plan states are frontend-only in this shell. Real subscriptions,
          invoicing, and commission payouts require a payment processor, webhook
          handlers, and compliance review before launch.
        </p>
      </div>
    </Card>
  </div>
);

export const MgmtSettings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          DIY Credit Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization-level DIY program configuration.
        </p>
      </div>
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Entitlements</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          DIY Credit must be enabled to show this module. CreditOps and
          FundingOps are independent — DIY does not require either.
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span>DIY Credit enabled</span>
            <Badge className="bg-emerald-500/10 text-emerald-700">Yes</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span>CreditOps (upgrade path)</span>
            <Badge variant="outline">Independent</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span>FundingOps (continuation path)</span>
            <Badge variant="outline">Independent</Badge>
          </div>
        </div>
      </Card>
      <Card className="bg-muted/30 p-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            Privacy &amp; access:
          </span>{" "}
          Referral attribution does not grant the partner access to a consumer's
          full DIY account. Partners only see information specifically
          authorized for their role/service relationship. Sensitive credit
          reports, evidence, and internal BES data follow explicit permissions.
        </p>
      </Card>
    </div>
  );
};
