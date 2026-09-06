/**
 * "Latest from your company" on Home: the most recent announcements, but only
 * when the organization's hub has Announcements switched on. One shared query
 * key with the Announcements page, so this adds no request when both are open.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Megaphone, Pin } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { useAnnouncements } from "@/lib/data/use-intranet";

export function CompanyFeedCard({ organizationId, active }: { organizationId: string; active: boolean }) {
  const board = useAnnouncements(active ? organizationId : null);
  if (!active) return null;
  const published = board.announcements.filter((a) => a.publishedAt).slice(0, 3);
  if (board.isLoading) return <div className="h-32 rounded-xl border border-border bg-card" aria-busy="true" />;
  if (published.length === 0) return null;

  return (
    <section aria-labelledby="company-feed-title" className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="company-feed-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Megaphone className="h-4 w-4 text-primary" /> Latest from your company
        </h2>
        <Link to="/app/announcements" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          All announcements <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {published.map((a) => (
          <li key={a.id} className="py-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              {a.pinned && <Pin className="h-3 w-3 text-primary" aria-label="Pinned" />}
              {a.title}
              {a.tag && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{a.tag}</span>}
            </p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
            <p className="text-[10px] text-muted-foreground">{a.publishedAt ? formatDate(a.publishedAt) : ""}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
