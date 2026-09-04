import { useState } from "react";
import { SubAccount } from "@/lib/agency-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User,
  MoreHorizontal,
  ArrowUpRight,
  Pin,
  ShieldCheck,
  Palette,
  FileText,
  CheckCircle2,
} from "lucide-react";

interface Props {
  subAccounts: SubAccount[];
  onSwitch: (id: string) => void;
  onTogglePin: (id: string) => void;
  onConfigureBranding: (sub: SubAccount) => void;
}

export const SubAccountsListView = ({
  subAccounts,
  onSwitch,
  onTogglePin,
  onConfigureBranding,
}: Props) => {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-10 text-center">Pin</TableHead>
            <TableHead>Sub-Account Company</TableHead>
            <TableHead>Plan & Modules</TableHead>
            <TableHead>Owner & Contact</TableHead>
            <TableHead>End-Clients</TableHead>
            <TableHead>SaaS Revenue</TableHead>
            <TableHead>Fulfillment Desk</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subAccounts.map((sub) => (
            <TableRow
              key={sub.id}
              className="hover:bg-muted/30 transition-colors"
            >
              <TableCell className="text-center">
                <button
                  onClick={() => onTogglePin(sub.id)}
                  className="text-muted-foreground hover:text-amber-500 transition-colors"
                  title={sub.isPinned ? "Unpin account" : "Pin to top"}
                >
                  <Pin
                    className={`h-4 w-4 ${sub.isPinned ? "fill-amber-500 text-status-warning" : ""}`}
                  />
                </button>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-emerald text-white font-bold text-xs shadow-sm">
                    {sub.code.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm text-foreground">
                        {sub.name}
                      </p>
                      {sub.branding?.customDomain && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 text-status-warning border-amber-500/30"
                        >
                          {sub.branding.customDomain}
                        </Badge>
                      )}
                    </div>
                    {sub.address && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {sub.address}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <Badge variant="outline" className="text-xs font-semibold">
                  {sub.plan}
                </Badge>
              </TableCell>

              <TableCell>
                <div className="text-xs">
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" />{" "}
                    {sub.ownerName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {sub.ownerEmail}
                  </p>
                </div>
              </TableCell>

              <TableCell className="font-bold text-sm">
                {sub.activeClients}
              </TableCell>

              <TableCell className="font-bold text-status-success">
                ${sub.monthlyRevenue.toLocaleString()}
              </TableCell>

              <TableCell>
                {sub.isFulfillmentSubscriber ? (
                  <Badge variant="success" className="text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> BES fulfillment engaged
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="text-[10px]">
                    Self-Managed
                  </Badge>
                )}
              </TableCell>

              <TableCell>
                <Badge
                  variant={sub.status === "Active" ? "success" : "warning"}
                >
                  {sub.status}
                </Badge>
              </TableCell>

              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSwitch(sub.id)}
                    className="h-8 px-2 text-xs font-semibold text-status-warning border-amber-500/30 hover:bg-amber-500/10"
                  >
                    Enter Workspace <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSwitch(sub.id)}>
                        Switch to Workspace
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onConfigureBranding(sub)}
                      >
                        <Palette className="h-3.5 w-3.5 mr-1.5 text-status-warning" />{" "}
                        Whitelabel Branding
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTogglePin(sub.id)}>
                        {sub.isPinned ? "Unpin Account" : "Pin Account"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
