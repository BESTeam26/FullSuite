/**
 * The birthday strip itself: today's greetings first, then who is coming up.
 * One component for both hubs — BES HQ's own people and a customer's team —
 * because the presentation is identical and only the source differs (rule 6).
 */
import { Cake } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { useAvatarUrls } from "@/lib/data/use-account";
import { birthdayGreeting, birthdayLabel, whenLabel } from "@/lib/greetings/birthday";

export interface BirthdayRow {
  id: string;
  name: string;
  avatarPath?: string | null;
  birthMonth: number;
  birthDay: number;
  daysAway: number;
  /** Shown after the name, e.g. "client". */
  note?: string;
}

export function BirthdayList({
  title,
  from,
  rows,
  upcomingLimit = 6,
}: {
  title: string;
  /** Whose good wishes the greeting carries. */
  from: string;
  rows: BirthdayRow[];
  upcomingLimit?: number;
}) {
  const avatars = useAvatarUrls(rows.map((r) => r.avatarPath));
  if (rows.length === 0) return null;
  const today = rows.filter((r) => r.daysAway === 0);
  const soon = rows.filter((r) => r.daysAway > 0).slice(0, upcomingLimit);

  return (
    <section aria-label={title} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Cake className="h-4 w-4 text-amber-600" /> {title}
      </p>
      {today.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {today.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm text-foreground">
              <Avatar name={r.name} url={r.avatarPath ? avatars.data?.[r.avatarPath] : null} size="sm" />
              <span>{birthdayGreeting(r.name, from)}</span>
            </li>
          ))}
        </ul>
      )}
      {soon.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {soon.map((r) => (
            <li key={r.id}>
              <span className="font-semibold text-foreground">{r.name}</span>
              {r.note ? ` (${r.note})` : ""} · {birthdayLabel(r.birthMonth, r.birthDay)}, {whenLabel(r.daysAway)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
