import { useState } from "react";
import { SubAccount } from "@/lib/agency-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  Pin,
  User,
  CheckCircle2,
  ShieldCheck,
  Palette,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  subAccounts: SubAccount[];
  onSwitch: (id: string) => void;
  onToggleDFY: (id: string) => void;
  onTogglePin: (id: string) => void;
  onConfigureBranding: (sub: SubAccount) => void;
}

const KANBAN_STAGES: Array<{
  id: SubAccount["status"];
  label: string;
  color: string;
}> = [
  {
    id: "Active",
    label: "Active Sub-Accounts",
    color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-500",
  },
  {
    id: "Pending Onboarding",
    label: "Pending Onboarding",
    color: "border-amber-500/40 bg-amber-500/5 text-amber-500",
  },
  {
    id: "At Risk",
    label: "At Risk / High Churn",
    color: "border-red-500/40 bg-red-500/5 text-red-500",
  },
  {
    id: "Paused",
    label: "Paused / Inactive",
    color: "border-slate-500/40 bg-slate-500/5 text-slate-400",
  },
];

export const SubAccountsBoardView = ({
  subAccounts,
  onSwitch,
  onToggleDFY,
  onTogglePin,
  onConfigureBranding,
}: Props) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {KANBAN_STAGES.map((stage) => {
        const stageAccounts = subAccounts.filter((s) => s.status === stage.id);

        return (
          <div
            key={stage.id}
            className="rounded-xl border border-border bg-card/60 p-4 flex flex-col h-full min-h-[500px]"
          >
            <div
              className={`flex items-center justify-between border-b border-border pb-3 mb-3 px-1`}
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`font-bold text-xs ${stage.color}`}
                >
                  {stage.label}
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">
                  ({stageAccounts.length})
                </span>
              </div>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {stageAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No sub-accounts in this stage
                </div>
              ) : (
                stageAccounts.map((sub) => (
                  <Card
                    key={sub.id}
                    className="p-4 border-border hover:border-amber-500/50 transition-all flex flex-col justify-between space-y-3 relative group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-emerald text-white font-bold text-xs shrink-0">
                            {sub.code.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm truncate">
                              {sub.name}
                            </h4>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                              <User className="h-3 w-3" /> {sub.ownerName}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onTogglePin(sub.id)}
                            className="text-muted-foreground hover:text-amber-500 p-1"
                            title={
                              sub.isPinned ? "Unpin account" : "Pin account"
                            }
                          >
                            <Pin
                              className={`h-3.5 w-3.5 ${sub.isPinned ? "fill-amber-500 text-amber-500" : ""}`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">
                            Plan:
                          </span>
                          <span className="font-semibold text-foreground text-[11px]">
                            {sub.plan}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">
                            Clients:
                          </span>
                          <span className="font-bold text-foreground text-[11px]">
                            {sub.activeClients}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">
                            SaaS MRR:
                          </span>
                          <span className="font-bold text-emerald-600 text-[11px]">
                            ${sub.monthlyRevenue.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {sub.isFulfillmentSubscriber ? (
                        <Badge className="mt-2.5 w-full justify-center bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> HQ DFY
                          Subscriber
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="mt-2.5 w-full justify-center text-slate-400 text-[10px]"
                        >
                          Self-Managed
                        </Badge>
                      )}
                    </div>

                    <div className="pt-2 border-t flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onConfigureBranding(sub)}
                        className="h-7 text-[11px] text-muted-foreground hover:text-amber-500 px-2"
                      >
                        <Palette className="h-3 w-3 mr-1" /> Whitelabel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onSwitch(sub.id)}
                        className="h-7 bg-gradient-gold text-charcoal font-bold text-[11px] px-2"
                      >
                        Enter <ArrowUpRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
