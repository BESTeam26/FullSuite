import { useState } from "react";
import { CircleDot, Smile, Frown, Meh } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  ClassifiedItem,
  Disposition,
  Bureau,
} from "@/lib/credit-classification";

// ─── Detail Field ─────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function bureauStatus(
  item: ClassifiedItem,
  bureau: Bureau,
): "Positive" | "Negative" | "None" {
  if (!item.bureaus.includes(bureau)) return "None";
  return item.isNegative ? "Negative" : "Positive";
}

// ─── Item Row ──────────────────────────────────────────────────────────────────

/* ------------------------------------------------------------------ */
/* Per-bureau detail card                                              */
/*                                                                     */
/* The three bureaus show the same fields; only the accent colour and  */
/* the closing note differ. Written once so a field added here appears */
/* on all three (rule 13).                                             */
/* ------------------------------------------------------------------ */

interface BureauCard {
  name: string;
  border: string;
  heading: string;
  /** Bureau-specific footnote, omitted when there is nothing to say. */
  note?: { text: string; className: string };
}

const BUREAU_CARDS: BureauCard[] = [
  {
    name: "Equifax",
    border: "border-blue-200",
    heading: "text-blue-600",
  },
  {
    name: "Experian",
    border: "border-purple-200",
    heading: "text-purple-600",
    note: {
      text: "Account was in dispute — now resolved — report updated.",
      className: "bg-purple-500/5 text-purple-700",
    },
  },
  {
    name: "TransUnion",
    border: "border-emerald-200",
    heading: "text-emerald-600",
    note: {
      text: "Chapter 7 bankruptcy filed — verify discharge documentation.",
      className: "bg-emerald-500/5 text-emerald-700",
    },
  },
];

function BureauDetailCard({
  bureau,
  item,
  inDispute,
}: {
  bureau: BureauCard;
  item: ClassifiedItem;
  inDispute: boolean;
}) {
  return (
    <div className={`rounded-lg border ${bureau.border} bg-card p-3`}>
      <p
        className={`mb-2 text-center text-xs font-semibold uppercase ${bureau.heading}`}
      >
        {bureau.name}
      </p>
      <DetailField label="Account Name" value={item.name} />
      <DetailField
        label="Account Number"
        value={"••••••••" + item.id.slice(-4)}
      />
      <DetailField label="Account Type" value={item.subtype ?? item.kind} />
      <DetailField label="Account Status" value={item.status} />
      {item.openDate && (
        <DetailField label="Date Opened" value={item.openDate} />
      )}
      <DetailField label="Balance" value={item.balance ?? "$0.00"} />
      {item.dofd && <DetailField label="DOFD" value={item.dofd} />}
      <DetailField
        label="Dispute Status"
        value={inDispute ? "In Dispute" : "Not disputed"}
      />
      {/* Equifax additionally surfaces the AI reason when one exists. */}
      {bureau.name === "Equifax" && item.aiReason && (
        <div className="mt-2 rounded bg-blue-500/5 p-2 text-[11px] text-blue-700">
          {item.aiReason}
        </div>
      )}
      {bureau.note && (
        <div
          className={`mt-2 rounded p-2 text-[11px] ${bureau.note.className}`}
        >
          {bureau.note.text}
        </div>
      )}
    </div>
  );
}

export function ItemRow({
  item,
  showActions,
  onToggleDisposition,
  expanded,
  onExpand,
}: {
  item: ClassifiedItem;
  showActions?: boolean;
  onToggleDisposition?: (id: string, disp: Disposition) => void;
  expanded: boolean;
  onExpand: (id: string) => void;
}) {
  const [localDisp, setLocalDisp] = useState<Disposition>(item.disposition);

  const handleToggle = (disp: Disposition) => {
    setLocalDisp(disp);
    onToggleDisposition?.(item.id, disp);
  };

  const statusIcon =
    localDisp === "dispute" || item.isNegative ? (
      <Frown className="h-4 w-4 text-red-500" />
    ) : localDisp === "open-positive" || localDisp === "closed-positive" ? (
      <Smile className="h-4 w-4 text-emerald-500" />
    ) : (
      <Meh className="h-4 w-4 text-amber-500" />
    );

  const eq = bureauStatus(item, "EQ");
  const ex = bureauStatus(item, "EX");
  const tu = bureauStatus(item, "TU");

  const StatusBadge = ({
    status,
  }: {
    status: "Positive" | "Negative" | "None";
  }) => (
    <Badge
      variant="outline"
      className={
        status === "Positive"
          ? "border-emerald-500/30 text-emerald-600"
          : status === "Negative"
            ? "border-red-500/30 text-red-600"
            : "text-muted-foreground"
      }
    >
      {status === "Positive" && <Smile className="mr-1 h-3 w-3" />}
      {status === "Negative" && <Frown className="mr-1 h-3 w-3" />}
      {status}
    </Badge>
  );

  return (
    <>
      <tr className="border-b border-border transition-colors hover:bg-muted/20">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-xs font-semibold uppercase">{item.name}</p>
              {item.kind === "Account" && item.subtype && (
                <p className="text-[10px] text-muted-foreground">
                  {item.subtype}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs">
          <p>{item.balance ?? "$0.00"}</p>
          <p className="text-[10px] text-muted-foreground">
            {item.kind === "Account"
              ? "Accounts"
              : item.kind === "Inquiry"
                ? "INQUIRY"
                : "Information"}
          </p>
        </td>
        <td className="px-3 py-2.5 text-center">
          <StatusBadge status={eq} />
        </td>
        <td className="px-3 py-2.5 text-center">
          <StatusBadge status={ex} />
        </td>
        <td className="px-3 py-2.5 text-center">
          <StatusBadge status={tu} />
        </td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {showActions && (
              <button
                onClick={() =>
                  handleToggle(
                    localDisp === "dispute" ? "undisputed" : "dispute",
                  )
                }
                className="rounded-md px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => onExpand(item.id)}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-4 md:grid-cols-3">
              {BUREAU_CARDS.map((bureau) => (
                <BureauDetailCard
                  key={bureau.name}
                  bureau={bureau}
                  item={item}
                  inDispute={localDisp === "dispute"}
                />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  count,
  tone,
  onExpose,
  exposed,
}: {
  title: string;
  subtitle: string;
  count: number;
  tone: string;
  onExpose: () => void;
  exposed: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 px-4 py-3 ${tone}`}
    >
      <div>
        <p className="text-sm font-bold">
          {title}{" "}
          <span className="font-normal opacity-80">— {count} Items</span>
        </p>
        <p className="text-xs opacity-80">{subtitle}</p>
      </div>
      <button
        onClick={onExpose}
        className="rounded-lg border border-white/30 px-3 py-1 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        {exposed ? "Collapse All Data" : "Expose All Data"}
      </button>
    </div>
  );
}

// ─── Item Table Section ───────────────────────────────────────────────────────

export function ItemTableSection({
  title,
  subtitle,
  items,
  tone,
  showActions,
  onToggleDisposition,
  exposedSectionsKey,
  exposed,
  onExpose,
  expandedItemId,
  onToggleExpand,
}: {
  title: string;
  subtitle: string;
  items: ClassifiedItem[];
  tone: string;
  showActions?: boolean;
  onToggleDisposition?: (id: string, disp: Disposition) => void;
  exposedSectionsKey: string;
  exposed: boolean;
  onExpose: () => void;
  expandedItemId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        count={items.length}
        tone={tone}
        onExpose={onExpose}
        exposed={exposed}
      />
      <div className="bg-card p-3">
        <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>
        {exposed && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Account Name</th>
                  <th className="px-3 py-2 font-medium">
                    Balance/High Balance
                  </th>
                  <th className="px-3 py-2 font-medium text-center">Equifax</th>
                  <th className="px-3 py-2 font-medium text-center">
                    Experian
                  </th>
                  <th className="px-3 py-2 font-medium text-center">
                    TransUnion
                  </th>
                  <th className="px-3 py-2 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    showActions={showActions}
                    expanded={expandedItemId === item.id}
                    onExpand={onToggleExpand}
                    onToggleDisposition={onToggleDisposition}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
