import { useState } from "react";

/**
 * The legacy /app/fulfillment work-order shape.
 *
 * It lived in `agency-context` as a COMPATIBILITY ADAPTER over the canonical
 * `WorkItem`, and it moved here when this screen was archived — because the
 * adapter was only ever for this screen, not because BES stopped doing
 * fulfillment. The canonical fulfillment surfaces are live and untouched:
 * `work_items` with `scope = 'AGENCY'`, `fetchAgencyWork`, `useAgencyWork`,
 * `fulfillment_engagements` and `bes_may_fulfil()`.
 *
 * A future fulfillment queue must be built on those, NOT by restoring this.
 * It flattened a work item into a single named client and a fixed
 * `"Round 1 Processing"` type, and it took the owning organization from
 * `organizations[0]` — the first in the list, whichever that was.
 */
export type FulfillmentWorkOrder = {
  id: string;
  subAccountId: string;
  subAccountName: string;
  clientName: string;
  clientEmail: string;
  round: string;
  type:
    | "Round 1 Processing"
    | "Round 2 Escalation"
    | "CFPB Complaint"
    | "Experian Upload"
    | "FTC Filing"
    | "Address Verification";
  priority: "High" | "Urgent" | "Normal";
  assignedTo: string;
  slaHoursRemaining: number;
  status: "Queued" | "In Processing" | "Ready for QA" | "Completed" | "Blocked";
  dateSubmitted: string;
  itemCount: number;
};
import {
  Inbox,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  User,
  Building2,
  FileCheck2,
  Sparkles,
  Send,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { FulfillmentLiveChatModal } from "./FulfillmentLiveChatModal";

export const FulfillmentWorkspace = () => {
  /* This used to read `workOrders` and `updateWorkOrderStatus` from
     `agency-context`. Those were the compatibility adapter for THIS screen and
     were removed with it; the state is local now so the file still compiles as
     reference material. It renders nothing, which is what it did in
     production too — the array it read was never populated.

     Whoever builds the real BES fulfillment queue: do not restore this. The
     canonical engine is `work_items` (`scope = 'AGENCY'`, `division`,
     `team_id`, `assigned_to`), reached through `fetchAgencyWork` /
     `useAgencyWork`, authorized by `bes_may_fulfil()` +
     `fulfillment_engagements` + `in_scope()`, with department state in
     `client_department_statuses` and handoffs in
     `handoff_client_departments()`. All of that is live. */
  const [workOrders, setWorkOrders] = useState<FulfillmentWorkOrder[]>([]);
  const updateWorkOrderStatus = (
    id: string,
    status: FulfillmentWorkOrder["status"],
  ) => setWorkOrders((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [activeChatOrder, setActiveChatOrder] =
    useState<FulfillmentWorkOrder | null>(null);

  const filtered = workOrders.filter((wo) => {
    const matchesSearch =
      wo.clientName.toLowerCase().includes(search.toLowerCase()) ||
      wo.subAccountName.toLowerCase().includes(search.toLowerCase()) ||
      wo.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "All" || wo.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = (
    woId: string,
    status: FulfillmentWorkOrder["status"],
  ) => {
    updateWorkOrderStatus(woId, status);
    toast({
      title: "Work Order Updated",
      description: `Work order ${woId} moved to ${status}. Organization notification sent!`,
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500/20 text-status-warning border border-amber-500/30">
              <Inbox className="h-3.5 w-3.5 mr-1" /> HQ Done-For-You Fulfillment
              Desk
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
            Auto-Received Fulfillment Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Incoming work orders from organizations subscribed to HQ Done-For-You
            fulfillment.
          </p>
        </div>
      </div>

      {/* SLA Alert Header */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-status-warning">
        <Sparkles className="h-5 w-5 shrink-0" />
        <div className="text-xs">
          <span className="font-bold">
            Automated Fulfillment Routing Active:
          </span>{" "}
          All dispute files, Experian uploads, and CFPB complaint filings
          generated by subscriber organizations auto-stream directly into this
          queue with maker-checker QA safeguards.
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        {["All", "Queued", "In Processing", "Ready for QA", "Completed"].map(
          (st) => (
            <Button
              key={st}
              variant={filterStatus === st ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterStatus(st)}
              className={
                filterStatus === st
                  ? "bg-gradient-gold text-charcoal font-bold"
                  : "text-muted-foreground"
              }
            >
              {st}
            </Button>
          ),
        )}
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by client, organization, or work order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Work Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Order ID</th>
              <th className="px-6 py-3 font-medium">Organization</th>
              <th className="px-6 py-3 font-medium">Client Info</th>
              <th className="px-6 py-3 font-medium">Task Type & Round</th>
              <th className="px-6 py-3 font-medium">Assigned Specialist</th>
              <th className="px-6 py-3 font-medium">SLA Countdown</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((wo) => (
              <tr key={wo.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4 font-mono text-xs font-bold text-status-warning">
                  {wo.id}
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-xs flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                    {wo.subAccountName}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-xs">{wo.clientName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {wo.clientEmail}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline" className="text-[10px] w-fit">
                      {wo.type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {wo.round} · {wo.itemCount} items
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-muted-foreground">
                  {wo.assignedTo}
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium text-status-warning flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {wo.slaHoursRemaining}h
                    remaining
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    className={
                      wo.status === "In Processing"
                        ? "bg-blue-500/10 text-status-info border-blue-500/20"
                        : wo.status === "Ready for QA"
                          ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                          : wo.status === "Queued"
                            ? "bg-amber-500/10 text-status-warning border-amber-500/20"
                            : "bg-emerald-500/10 text-status-success border-emerald-500/20"
                    }
                  >
                    {wo.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveChatOrder(wo)}
                      className="h-8 text-xs font-semibold text-status-warning border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1" /> Live Stream
                      Chat
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <span className="sr-only">Open menu</span>
                          <Filter className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setActiveChatOrder(wo)}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-status-warning" />{" "}
                          Open Fulfillment Stream Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleStatusChange(wo.id, "In Processing")
                          }
                        >
                          Mark In Processing
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleStatusChange(wo.id, "Ready for QA")
                          }
                        >
                          Send to QA Review
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(wo.id, "Completed")}
                        >
                          Mark Completed & Notify Organization
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Live Chat Dialog */}
        <Dialog
          open={!!activeChatOrder}
          onOpenChange={(open) => !open && setActiveChatOrder(null)}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-status-warning" /> Live
                Stream Chat — Work Order Activity
              </DialogTitle>
            </DialogHeader>
            {activeChatOrder && (
              <FulfillmentLiveChatModal
                workOrder={activeChatOrder}
                onClose={() => setActiveChatOrder(null)}
              />
            )}
          </DialogContent>
        </Dialog>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mb-2 stroke-1 opacity-50" />
            <p className="font-semibold text-sm">No work orders found</p>
            <p className="text-xs">Adjust your search or status filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};
