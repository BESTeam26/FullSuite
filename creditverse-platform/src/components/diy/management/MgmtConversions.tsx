import {
  ArrowRightLeft,
  Banknote,
  ShieldCheck,
  Check,
  X,
  Clock,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const stateTone: Record<string, string> = {
  suggested: "bg-slate-500/10 text-slate-600",
  offered: "bg-blue-500/10 text-blue-700",
  requested: "bg-amber-500/10 text-amber-700",
  accepted: "bg-emerald-500/10 text-emerald-700",
  declined: "bg-red-500/10 text-red-600",
  completed: "bg-emerald-600/10 text-emerald-700",
};

const typeLabel: Record<string, string> = {
  diy_to_managed_credit: "DIY → Managed Credit",
  diy_to_funding_readiness: "DIY → Funding Readiness",
  diy_to_fundingops: "DIY → FundingOps",
  managed_credit_to_fundingops: "Managed Credit → FundingOps",
  fundingops_to_diy: "FundingOps → DIY",
  fundingops_to_managed_credit: "FundingOps → Managed Credit",
};

export const MgmtConversions = () => {
  const { conversions, people, acceptConversion, declineConversion } =
    useDiyManagement();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Service transitions across the ecosystem. Counted only when enrollment
          actually changes.
        </p>
      </div>

      <div className="space-y-3">
        {conversions.map((c) => {
          const person = people.find((p) => p.id === c.personId);
          const pending = c.state === "requested";
          return (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-bold">
                      {typeLabel[c.type] || c.type}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {c.state}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {person?.name} · {person?.email}
                  </p>
                  {c.note && (
                    <p className="mt-2 max-w-xl rounded-lg bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                      {c.note}
                    </p>
                  )}
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {c.createdDate}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pending ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => declineConversion(c.personId)}
                      >
                        <X className="h-3.5 w-3.5" /> Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => acceptConversion(c.personId)}
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </Button>
                    </>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        stateTone[c.state] || stateTone.suggested
                      }`}
                    >
                      {c.state}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 text-amber-600" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">
              Funding readiness ≠ funding approval.
            </p>
            <p className="mt-1">
              Credit improvement does not guarantee funding. A funding-readiness
              review may identify credit or other readiness factors — but other
              blockers (revenue, time in business, banking, documents, entity,
              industry) may also apply.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
