import { Building2, ArrowRight, ArrowUpRight, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { SubAccount } from "@/lib/agency-context";

function SubAccountMiniCard({
  sub,
  onClick,
}: {
  sub: SubAccount;
  onClick: () => void;
}) {
  const statusColor =
    sub.status === "Active"
      ? "hover:border-emerald-500/50 group-hover:text-emerald-500"
      : sub.status === "At Risk"
        ? "hover:border-amber-500/50 group-hover:text-amber-500"
        : "hover:border-blue-500/50 group-hover:text-blue-500";

  return (
    <Card
      className={`p-4 border-border hover:shadow-md transition-all cursor-pointer group ${statusColor}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold text-sm shadow-sm">
          {sub.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm text-foreground truncate transition-colors">
            {sub.name}
          </h3>
          <p className="text-[11px] text-muted-foreground truncate">
            {sub.ownerName}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="font-semibold text-foreground">
            {sub.activeClients ?? 0}
          </span>{" "}
          <span>clients</span>
        </div>
        <Badge variant="outline" className="text-[10px] font-semibold">
          {sub.plan}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span
          className={`text-[10px] font-medium ${
            sub.status === "Active"
              ? "text-emerald-600 dark:text-emerald-400"
              : sub.status === "At Risk"
                ? "text-amber-600 dark:text-amber-400"
                : "text-blue-600 dark:text-blue-400"
          }`}
        >
          {sub.status}
        </span>
        <span className="text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-foreground/70">
          Enter <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </Card>
  );
}

export const SubAccountMiniGrid = ({
  subAccounts,
  onSwitch,
}: {
  subAccounts: SubAccount[];
  onSwitch: (id: string) => void;
}) => {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Connected Sub-Accounts
          </h2>
          <Badge
            variant="outline"
            className="text-[10px] font-semibold border-border"
          >
            {subAccounts.length} companies
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/app/subaccounts")}
          className="shrink-0"
        >
          View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {subAccounts.map((sub) => (
          <SubAccountMiniCard
            key={sub.id}
            sub={sub}
            onClick={() => onSwitch(sub.id)}
          />
        ))}
      </div>
    </div>
  );
};
