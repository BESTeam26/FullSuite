/**
 * One piece of content, as it appears on the calendar.
 *
 * Dee, 2026-09-13: "Each calendar card should quickly show: Partner, content
 * title, platform, content type, campaign, assignee/avatar, status, approval
 * state. Keep the card compact."
 *
 * Compact and eight facts pull against each other, so the card is ordered by
 * what a person scanning a month actually needs: the title, then who it is
 * for, then the two things that decide whether it can go out — its status and
 * where it stands with the partner. Platform is carried by the card's own
 * colour, which is why the legend exists; repeating it as text as well would
 * cost a line for nothing.
 */
import { AlertCircle, Check, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPROVAL_LABEL, approvalStateOf, type ApprovalState, type MarketingWorkItem } from "@/lib/marketing/marketing-domain";
import { CHANNEL_TONE, DEFAULT_TONE, initials } from "./content-visuals";

const APPROVAL_ICON: Record<ApprovalState, typeof Check | null> = {
  none: null,
  awaiting: Clock,
  changes_requested: AlertCircle,
  approved: Check,
};
const APPROVAL_TONE: Record<ApprovalState, string> = {
  none: "",
  awaiting: "text-purple-800",
  changes_requested: "text-orange-800",
  approved: "text-emerald-800",
};

export function ContentCard({
  item,
  showPartner,
  draggable,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  item: MarketingWorkItem;
  showPartner: boolean;
  draggable: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const approval = approvalStateOf(item);
  const ApprovalIcon = APPROVAL_ICON[approval];
  const who = showPartner ? item.partnerName ?? "BES" : null;

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={[item.title, who, item.contentType, item.channel, item.campaignName, item.statusLabel]
        .filter(Boolean).join(" · ")}
      className={cn(
        "w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-sm",
        CHANNEL_TONE[item.channel ?? ""] ?? DEFAULT_TONE,
        dragging && "opacity-50",
        item.isTerminal && "opacity-75",
      )}
    >
      <span className={cn("block truncate font-semibold", item.statusKey === "published" && "line-through")}>
        {item.title}
      </span>
      <span className="block truncate opacity-80">
        {[who, item.contentType, item.campaignName].filter(Boolean).join(" · ") || "—"}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 opacity-90">
        <span className="inline-flex min-w-0 items-center gap-0.5">
          <User className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.assigneeName ? initials(item.assigneeName) : "—"}</span>
        </span>
        <span className="truncate font-medium">{item.statusLabel ?? ""}</span>
        {ApprovalIcon && (
          <span className={cn("ml-auto inline-flex shrink-0 items-center", APPROVAL_TONE[approval])}
            aria-label={APPROVAL_LABEL[approval]}>
            <ApprovalIcon className="h-3 w-3" />
          </span>
        )}
      </span>
    </button>
  );
}
