import { useState } from "react";
import { SubAccount } from "@/lib/agency-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Pin, User, Palette, MoreHorizontal } from "lucide-react";
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

export const SubAccountsCardsView = ({
  subAccounts,
  onSwitch,
  onToggleDFY,
  onTogglePin,
  onConfigureBranding,
}: Props) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {subAccounts.map((sub) => (
        <Card
          key={sub.id}
          className={`p-5 border-border hover:border-amber-500/50 transition-all flex flex-col justify-between relative ${
            sub.isPinned ? "border-amber-500/40 bg-amber-500/[0.02]" : ""
          }`}
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-emerald text-white font-bold text-sm shadow-sm">
                  {sub.code.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-base text-foreground">
                      {sub.name}
                    </h3>
                    {sub.isPinned && (
                      <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" /> {sub.ownerName}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onSwitch(sub.id)}>
                    Switch to this Sub-Account Workspace
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onConfigureBranding(sub)}>
                    <Palette className="h-3.5 w-3.5 mr-1.5 text-amber-500" />{" "}
                    Configure Whitelabel Branding
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTogglePin(sub.id)}>
                    {sub.isPinned ? "Unpin Account" : "Pin Account to Top"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleDFY(sub.id)}>
                    Toggle Done-For-You Fulfillment
                  </DropdownMenuItem>
                  <DropdownMenuItem>View Account Billing</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-500">
                    Pause Sub-Account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Plan:</span>
                <Badge variant="outline" className="text-[11px] font-semibold">
                  {sub.plan}
                </Badge>
              </div>

              {sub.branding?.customDomain && (
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Custom Domain:</span>
                  <span className="font-mono text-amber-500 text-[11px]">
                    {sub.branding.customDomain}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  Active End-Clients:
                </span>
                <span className="font-bold text-foreground">
                  {sub.activeClients}
                </span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  Monthly SaaS Revenue:
                </span>
                <span className="font-bold text-emerald-600">
                  ${sub.monthlyRevenue.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  Fulfillment Status:
                </span>
                {sub.isFulfillmentSubscriber ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    HQ Fulfillment Subscriber
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-slate-400 text-[10px]"
                  >
                    Self-Managed
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConfigureBranding(sub)}
              className="text-xs text-muted-foreground hover:text-amber-500"
            >
              <Palette className="h-3.5 w-3.5 mr-1" /> Whitelabel
            </Button>
            <Button
              size="sm"
              onClick={() => onSwitch(sub.id)}
              className="bg-gradient-gold text-charcoal font-bold text-xs"
            >
              Enter Workspace <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};
