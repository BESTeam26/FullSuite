/**
 * One line per thing that happened on the partner's account, each saying
 * where it lives. Shared by the Overview's "Recent updates" and the Updates
 * page so the two never describe the same event differently.
 *
 * Internal routes stay in the portal; a deliverable's link — the only href
 * that is not a portal route — opens in a new tab.
 */
import { Link } from "react-router-dom";
import { Building2, ExternalLink, Flag, PackageCheck, UserPlus, Users, Wallet, Workflow, type LucideIcon } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { feedItemKey, feedKindLabel, isExternalHref, type FeedKind, type PartnerFeedItem } from "@/lib/portal/partner-feed";

const KIND_ICON: Record<FeedKind, LucideIcon> = {
  client_status: Users,
  client_added: UserPlus,
  project: Workflow,
  milestone: Flag,
  deliverable: PackageCheck,
  billing: Wallet,
  account: Building2,
};

function FeedLine({ item }: { item: PartnerFeedItem }) {
  const Icon = KIND_ICON[item.kind] ?? Building2;
  const external = isExternalHref(item.href);
  const body = (
    <>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm text-foreground">
          <span className="min-w-0 break-words">{item.title}</span>
          {external && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Opens in a new tab" />}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {feedKindLabel(item.kind)}
          {item.detail ? ` · ${item.detail}` : ""}
          {" · "}
          {formatDate(item.happenedAt?.slice(0, 10))}
        </span>
      </span>
    </>
  );
  const rowClass = "flex items-start gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (external) {
    return <a href={item.href!} target="_blank" rel="noopener noreferrer" className={rowClass}>{body}</a>;
  }
  if (item.href) return <Link to={item.href} className={rowClass}>{body}</Link>;
  return <div className="flex items-start gap-2 px-1 py-1.5">{body}</div>;
}

export function PartnerFeedList({ items }: { items: readonly PartnerFeedItem[] }) {
  return (
    <ul className="divide-y divide-border/50">
      {items.map((item, i) => (
        <li key={feedItemKey(item, i)}><FeedLine item={item} /></li>
      ))}
    </ul>
  );
}
