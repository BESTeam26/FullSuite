/**
 * Compliance & Billing.
 *
 * This page used to show four invented datasets — billing events, state
 * registrations and bonds, an "AI marketing-compliance linter" and
 * eligibility checks — none of which had a table behind them. They are gone.
 *
 * What is real today is listed here, with a link to where it lives. When a
 * registration tracker or a billing-eligibility engine exists, it will appear
 * here reading its own records.
 */
import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2, ScrollText, ShieldCheck, Scale } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";

interface Item {
  title: string;
  detail: string;
  href: string;
  icon: typeof Scale;
  besOnly?: boolean;
}

const ITEMS: Item[] = [
  {
    title: "Client agreements (CROA)",
    detail: "The agreements and disclosures your clients sign, and which version each signed.",
    href: "/app/settings?section=agreements",
    icon: FileCheck2,
    besOnly: true,
  },
  {
    title: "Letter approval",
    detail: "Every dispute letter passes an approval before it can be mailed, and who approved it is recorded on the letter.",
    href: "/app/clients",
    icon: ShieldCheck,
  },
  {
    title: "Audit log",
    detail: "Who changed what, when, and what it was before — append-only, written by the database rather than the interface.",
    href: "/app/settings?section=audit",
    icon: ScrollText,
    besOnly: true,
  },
];

export default function Compliance() {
  const { viewMode } = useAgency();
  const auth = useAuth();
  const isAgencyView = viewMode === "agency" && auth.isAgencyStaff;
  const items = ITEMS.filter((i) => !i.besOnly || isAgencyView);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Scale className="h-6 w-6 text-primary" /> Compliance
        </h1>
        <p className="text-sm text-muted-foreground">
          What the platform records so the work stands up to scrutiny.
        </p>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.title}>
              <Link
                to={item.href}
                className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 max-w-2xl text-xs text-muted-foreground">
        Not here yet: state registrations and bonds, a billing-eligibility engine, and marketing-copy review. Each
        needs records of its own before it can say anything true, so nothing stands in for them in the meantime.
      </p>
    </div>
  );
}
