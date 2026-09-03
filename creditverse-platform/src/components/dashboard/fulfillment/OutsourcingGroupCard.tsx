/**
 * OutsourcingGroupCard — contract details for the outsourcing group currently
 * in scope. Shown beneath the client list so an agent can see who the work
 * belongs to without leaving the list.
 */

import { ContentCard } from "@/components/dashboard/DivisionLayout";
import type { OutsourcingGroup } from "@/lib/fulfillment/ops-client-domain";
import { cn } from "@/lib/utils";

export function OutsourcingGroupCard({ group }: { group: OutsourcingGroup }) {
  return (
    <div className="mt-6">
      <ContentCard title="Outsourcing Group">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Group",
                  "Partner",
                  "Contact",
                  "Contract",
                  "Clients",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-muted/30">
                <td className="px-4 py-2.5 text-foreground">{group.name}</td>
                <td className="px-4 py-2.5 text-foreground">
                  {group.partnerName}
                </td>
                <td className="px-4 py-2.5 text-foreground">
                  {group.contactEmail}
                </td>
                <td className="px-4 py-2.5 text-foreground">
                  {group.contractRef ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-foreground">
                  {group.clientCount}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      group.status === "Active"
                        ? "bg-emerald-500/10 text-status-success border-emerald-500/30"
                        : "bg-amber-500/10 text-status-warning border-amber-500/30",
                    )}
                  >
                    {group.status}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContentCard>
    </div>
  );
}
