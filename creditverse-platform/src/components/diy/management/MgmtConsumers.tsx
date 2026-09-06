import { useState } from "react";
import {
  Search,
  Mail,
  Phone,
  ArrowRightLeft,
  Banknote,
  ShieldCheck,
} from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700",
  invited: "bg-blue-500/10 text-blue-700",
  "in-progress": "bg-amber-500/10 text-amber-700",
  "awaiting-reimport": "bg-purple-500/10 text-purple-700",
  completed: "bg-emerald-500/10 text-emerald-700",
  joined: "bg-slate-500/10 text-slate-600",
};

export const MgmtConsumers = () => {
  const { people, requestManagedCredit, requestFundingReadiness } =
    useDiyManagement();
  const [q, setQ] = useState("");

  const filtered = people.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.email.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consumers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your DIY credit consumers. One person, one identity across services.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search consumers..."
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">{p.name}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {p.attribution?.source}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {p.email}
                  </span>
                  {p.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {p.phone}
                    </span>
                  )}
                  {p.diy && (
                    <span className="flex items-center gap-1">
                      Journey: {p.diy.journeyStep.replace(/-/g, " ")} ·{" "}
                      {p.diy.progressPct}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    statusTone[p.diy?.status || "invited"] || statusTone.invited
                  }`}
                >
                  {(p.diy?.status || "invited").replace(/-/g, " ")}
                </span>
                <div className="flex items-center gap-3">
                  {p.creditops && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> CreditOps:{" "}
                      {p.creditops.status}
                    </span>
                  )}
                  {p.fundingops && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                      <Banknote className="h-3 w-3" /> FundingOps:{" "}
                      {p.fundingops.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => requestManagedCredit(p.id)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Request managed
                credit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => requestFundingReadiness(p.id)}
              >
                <Banknote className="h-3.5 w-3.5" /> Request funding readiness
              </Button>
              <Button disabled title="Sample content — this action connects when the live data model behind it exists" size="sm" variant="ghost">
                View journey
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
