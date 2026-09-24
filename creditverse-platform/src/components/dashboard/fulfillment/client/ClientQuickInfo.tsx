/**
 * The column that answers "who is this and where are they up to" without
 * leaving the work.
 *
 * Dee's mockup, 2026-09-24: a narrow column beside the work holding Contact,
 * the Credit File, and the actions the current department owes. An agent
 * writing a complaint needs the client's phone number and their round in
 * front of them; making that a tab they leave the checklist to open is the
 * friction the whole redesign is about.
 *
 * Every value here is read from the canonical client record the rest of the
 * page uses. Nothing is fetched twice and nothing is editable here — this is
 * the reference column; changing things is the header and Manage this client.
 */
import { CalendarClock, CreditCard, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-3 py-2 text-xs font-bold text-foreground">{title}</h2>
      <div className="space-y-2.5 p-3">{children}</div>
    </section>
  );
}

function Line({
  icon: Icon, label, value,
}: { icon: typeof Phone; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {/* "Not recorded" rather than a blank: an empty line reads as a bug,
            and on an imported file it is usually a real gap somebody should
            fill (see the import's own "no identifiers" report). */}
        <p className="break-words text-xs text-foreground">
          {value || <span className="text-muted-foreground">Not recorded</span>}
        </p>
      </div>
    </div>
  );
}

/**
 * What the department currently holding the file still owes.
 *
 * Dee's mockup shows this for Complaints — "FTC Needed", "CFPB Needed" — with
 * the distinction spelled out underneath, because NEEDED and FILED are the
 * two halves of her queue doctrine and reading one as the other is how a
 * complaint gets counted as done before it is sent.
 */
function DepartmentActions({ current }: { current: DepartmentStatus }) {
  const status = current.status.toUpperCase();
  const needed = [
    status.includes("FTC") && !status.includes("FILED") ? "FTC needed" : null,
    status.includes("CFPB") && !status.includes("FILED") ? "CFPB needed" : null,
    status === "FOR COMPLAINTS" ? "Complaint needed" : null,
  ].filter(Boolean) as string[];
  const filed = [
    status.includes("FTC FILED") ? "FTC filed" : null,
    status.includes("CFPB FILED") ? "CFPB filed" : null,
    status.includes("BBB FILED") ? "BBB filed" : null,
    status.includes("AG FILED") ? "AG filed" : null,
  ].filter(Boolean) as string[];

  if (needed.length === 0 && filed.length === 0) return null;

  return (
    <Card title={`${current.department} actions`}>
      <div className="flex flex-wrap gap-1.5">
        {needed.map((n) => (
          <span key={n} className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
            {n}
          </span>
        ))}
        {filed.map((f) => (
          <span key={f} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-status-success">
            {f}
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Needed</span> means the action is still to
        do. <span className="font-semibold text-foreground">Filed</span> is what it becomes once it
        has been done.
      </p>
    </Card>
  );
}

export function ClientQuickInfo({
  client, current, className,
}: {
  client: FulfillmentClient;
  current: DepartmentStatus | null;
  className?: string;
}) {
  const c = client as FulfillmentClient & {
    dateOfBirth?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    createdAt?: string | null;
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Card title="Quick info">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contact</p>
        <Line icon={UserRound} label="Name" value={client.name} />
        <Line icon={Phone} label="Phone" value={c.phone} />
        <Line icon={Mail} label="Email" value={c.email} />
        <Line icon={MapPin} label="Address" value={c.address} />
      </Card>

      <Card title="Credit file">
        <Line icon={CreditCard} label="Current round" value={client.round} />
        <Line icon={CreditCard} label="Credit status" value={client.status} />
        <Line icon={CalendarClock} label="Client since" value={c.createdAt ? formatDate(c.createdAt) : null} />
        <Line icon={CalendarClock} label="Date of birth" value={c.dateOfBirth ? formatDate(c.dateOfBirth) : null} />
      </Card>

      {current && <DepartmentActions current={current} />}
    </div>
  );
}
