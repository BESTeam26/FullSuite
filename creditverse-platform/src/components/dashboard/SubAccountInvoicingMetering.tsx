import { useState } from "react";
import { useAgency } from "@/lib/agency-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  Receipt,
  CreditCard,
  Building2,
  Download,
  Zap,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv } from "@/lib/export-csv";

interface InvoicingItem {
  id: string;
  subAccountName: string;
  planFee: number;
  perClientFee: number;
  dfyFulfillmentFee: number;
  totalDue: number;
  status: "Paid" | "Pending Invoice" | "Overdue";
  dueDate: string;
}

export const SubAccountInvoicingMetering = () => {
  const { subAccounts } = useAgency();
  const { toast } = useToast();
  const [meteredSearch, setMeteredSearch] = useState("");

  const items: InvoicingItem[] = subAccounts.map((sub) => {
    const planFee =
      sub.plan === "Full Suite"
        ? 2499
        : sub.plan === "CreditOps"
          ? 999
          : sub.plan === "FundingOps"
            ? 1499
            : 499;
    const perClientFee = sub.activeClients * 12; // $12 per active client meter
    const dfyFulfillmentFee = sub.isFulfillmentSubscriber
      ? sub.activeClients * 25
      : 0; // $25 per client fulfillment fee
    const totalDue = planFee + perClientFee + dfyFulfillmentFee;

    return {
      id: `INV-${sub.code}-2026-08`,
      subAccountName: sub.name,
      planFee,
      perClientFee,
      dfyFulfillmentFee,
      totalDue,
      status: sub.status === "Active" ? "Paid" : "Pending Invoice",
      dueDate: "Sep 01, 2026",
    };
  });

  const totalPlatformMRR = items.reduce((acc, curr) => acc + curr.totalDue, 0);

  const handleGenerateInvoice = (name: string) => {
    toast({
      title: "Automated Invoice Dispatched",
      description: `Stripe invoice generated and sent to owner of ${name}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground font-medium">
            Total B2B Platform Recurring Revenue
          </p>
          <p className="text-2xl font-black text-status-success mt-1">
            ${totalPlatformMRR.toLocaleString()}/mo
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-status-success" /> SaaS +
            Metering + DFY Fees
          </p>
        </Card>

        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground font-medium">
            Organization Base Plans
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            ${items.reduce((acc, c) => acc + c.planFee, 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Fixed monthly subscription base
          </p>
        </Card>

        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground font-medium">
            Per-Active-Client Metered Fees
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            $
            {items.reduce((acc, c) => acc + c.perClientFee, 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            $12 per active end-client
          </p>
        </Card>

        <Card className="p-4 border-border bg-card">
          <p className="text-xs text-muted-foreground font-medium">
            HQ DFY Fulfillment Metered Revenue
          </p>
          <p className="text-2xl font-bold text-status-warning mt-1">
            $
            {items
              .reduce((acc, c) => acc + c.dfyFulfillmentFee, 0)
              .toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            $25 per client automated fulfillment
          </p>
        </Card>
      </div>

      {/* Metered Invoicing Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-status-warning" /> Automated
              Metered Invoicing Ledger
            </h3>
            <p className="text-xs text-muted-foreground">
              Real-time usage metering for active end-clients, base plans, and
              DFY fulfillment fees.
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadCsv("billing-ledger", ["Organization", "Plan fee", "Per-client fee", "DFY fulfillment fee", "Total due", "Status", "Due date"], items.map((i) => [i.subAccountName, i.planFee, i.perClientFee, i.dfyFulfillmentFee, i.totalDue, i.status, i.dueDate]))}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export Billing Ledger CSV
          </Button>
        </div>

        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Organization Company</TableHead>
              <TableHead>Base Plan Fee</TableHead>
              <TableHead>Metered Client Usage ($12/cl)</TableHead>
              <TableHead>DFY Fulfillment Meter ($25/cl)</TableHead>
              <TableHead>Total Billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoice Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs font-bold text-status-warning">
                  {item.id}
                </TableCell>
                <TableCell className="font-bold text-sm">
                  {item.subAccountName}
                </TableCell>
                <TableCell className="text-xs font-semibold">
                  ${item.planFee.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs font-semibold text-status-success">
                  ${item.perClientFee.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs font-semibold text-status-warning">
                  {item.dfyFulfillmentFee > 0
                    ? `$${item.dfyFulfillmentFee.toLocaleString()}`
                    : "—"}
                </TableCell>
                <TableCell className="font-bold text-sm text-foreground">
                  ${item.totalDue.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      item.status === "Paid"
                        ? "bg-emerald-500/10 text-status-success"
                        : "bg-amber-500/10 text-status-warning"
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateInvoice(item.subAccountName)}
                    className="h-8 text-xs font-semibold text-status-warning border-amber-500/30 hover:bg-amber-500/10"
                  >
                    <Zap className="h-3.5 w-3.5 mr-1" /> Dispatch Stripe Invoice
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
