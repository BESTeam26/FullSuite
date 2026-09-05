import { Plus } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { useDiy } from "@/lib/diy/diy-context";
import { Button } from "@/components/ui/button";

const statusColor: Record<string, string> = {
  Delivered: "text-status-success bg-emerald-500/15",
  "In Transit": "text-sky-300 bg-sky-500/15",
  Mailed: "text-purple-300 bg-purple-500/15",
  Printed: "text-status-warning bg-amber-500/15",
  Returned: "text-red-300 bg-red-500/15",
};

export const MailView = () => {
  const { mail, addMail } = useDiy();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mail tracking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every piece of certified mail you send. Delivery proof is part
            of your audit trail.
          </p>
        </div>
        <Button
          onClick={() =>
            addMail({
              id: `m${Date.now()}`,
              recipient: "TransUnion Dispute Department",
              items: ["Chase Bank"],
              tracking: `9405 5018 9956 ${Date.now().toString().slice(-4)}`,
              sentDate: formatDate(new Date()),
              status: "Printed",
              method: "USPS Certified",
            })
          }
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New mail piece
        </Button>
      </div>

      <div className="space-y-3">
        {mail.map((m) => (
          <div
            key={m.id}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{m.recipient}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Items: {m.items.join(", ")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusColor[m.status]}`}
              >
                {m.status}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg bg-navy-deep/60 p-2.5">
                <p className="text-muted-foreground">Method</p>
                <p className="mt-0.5 font-semibold text-foreground">{m.method}</p>
              </div>
              <div className="rounded-lg bg-navy-deep/60 p-2.5">
                <p className="text-muted-foreground">Sent</p>
                <p className="mt-0.5 font-semibold text-foreground">{formatDate(m.sentDate)}</p>
              </div>
              <div className="rounded-lg bg-navy-deep/60 p-2.5">
                <p className="text-muted-foreground">Tracking</p>
                <p className="mt-0.5 font-mono text-[10px] text-foreground">
                  {m.tracking}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
