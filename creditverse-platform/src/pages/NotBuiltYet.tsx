/**
 * A screen that says what is true when there is nothing real to show.
 *
 * Several screens used to be walkthroughs built on invented data — a client
 * portal with example balances, an affiliate portal with example commissions,
 * a DIY journey over a bundled credit report. They looked like features and
 * were fiction. Where the records behind a screen do not exist yet, this says
 * so plainly instead.
 */
import { Link } from "react-router-dom";
import { Construction } from "lucide-react";

export function NotBuiltYet({
  title,
  detail,
  backTo = "/app",
  backLabel = "Back to the workspace",
}: {
  title: string;
  detail: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Construction className="h-5 w-5" />
      </div>
      <h1 className="mt-3 text-lg font-bold text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{detail}</p>
      <Link
        to={backTo}
        className="mt-4 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        {backLabel}
      </Link>
    </main>
  );
}

export default NotBuiltYet;
