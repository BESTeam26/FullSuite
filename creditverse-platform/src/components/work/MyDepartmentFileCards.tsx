/**
 * The department files assigned to me, on a phone.
 *
 * The same data as the desktop table — `creditops_my_work` and the funding
 * department rows, both already filtered to actionable by the view — drawn as
 * cards that open the client in one tap.
 */
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { StatusPill } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import type { MyDepartmentFile } from "@/lib/data/my-department-files";

export function MyDepartmentFileCards({
  files, hrefFor,
}: {
  files: readonly MyDepartmentFile[];
  hrefFor: (f: MyDepartmentFile) => string;
}) {
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li key={f.key}>
          <Link to={hrefFor(f)}
            className="flex min-h-[64px] w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug text-foreground">
                {f.clientName}{f.filePurpose ? ` · ${f.filePurpose}` : ""}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <StatusPill status={f.status} />
                <span className="text-muted-foreground">{f.division} · {f.department}</span>
                <span className="text-muted-foreground">Updated {formatDate(f.updatedAt)}</span>
              </span>
            </span>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
