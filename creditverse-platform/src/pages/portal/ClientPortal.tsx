/**
 * The client's own view of their file.
 *
 * C3: a view on the canonical client, not a second identity. Everything here
 * reads the same rows an agent reads; row-level security decides which ones
 * arrive, and the four activity visibilities decide what counts as published.
 * Nothing internal is hidden by a condition in this file, because nothing
 * internal reaches it.
 *
 * Built phone-first. Clients open this on a phone, standing up, once a week —
 * so the tabs sit at the bottom where a thumb reaches, the cards stack in one
 * column, and the first screen answers "where am I up to" without scrolling.
 * The light operational theme is unchanged.
 */
import { useState } from "react";
import {
  Building2, CheckCircle2, ClipboardList, FileText, Home, Loader2, Megaphone, UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import {
  usePortalDocumentRequests, usePortalHome, usePortalOffers, usePortalUpdates,
} from "@/lib/data/use-client-portal";
import { cn } from "@/lib/utils";

type Tab = "home" | "progress" | "documents" | "updates" | "account";

const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "progress", label: "Progress", icon: ClipboardList },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "updates", label: "Updates", icon: Megaphone },
  { key: "account", label: "Account", icon: UserRound },
];

export default function ClientPortal() {
  const [tab, setTab] = useState<Tab>("home");
  const home = usePortalHome();
  /* Each section loads when it is opened, never before. */
  const updates = usePortalUpdates(tab === "updates" || tab === "home");
  const documents = usePortalDocumentRequests(tab === "documents");
  const offers = usePortalOffers(tab === "progress");

  const c = home.data;
  if (!c) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {c.organizationName ?? "Your file"}
        </p>
        <h1 className="mt-0.5 text-lg font-bold text-foreground">{c.fullName}</h1>
        <p className="text-xs text-muted-foreground">Reference {c.publicId}</p>
      </header>

      <main className="mx-auto w-full max-w-2xl p-4">
        {tab === "home" && (
          <div className="space-y-3">
            {c.hasCreditOps && (
              <Card title="Credit repair" icon={CheckCircle2}>
                <Line label="Where it is" value={c.creditStatus ?? "Getting started"} />
                <Line label="Round" value={c.creditRound ?? "Not started"} />
              </Card>
            )}
            {c.hasFundingOps && (
              <Card title="Funding" icon={Building2}>
                <Line label="Where it is" value={c.fundingStatus ?? "Getting started"} />
                <Line label="Applications open" value={String(c.openFundingFiles)} />
              </Card>
            )}
            {c.openDocumentRequests > 0 && (
              <button
                type="button"
                onClick={() => setTab("documents")}
                className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span>
                  <span className="block text-sm font-bold text-foreground">
                    {c.openDocumentRequests} document{c.openDocumentRequests === 1 ? "" : "s"} needed
                  </span>
                  <span className="block text-xs text-muted-foreground">This is what is holding things up.</span>
                </span>
                <FileText className="h-5 w-5 shrink-0 text-primary" />
              </button>
            )}
            <Card title="Latest update" icon={Megaphone}>
              {updates.isLoading ? <Busy /> : updates.data && updates.data.length > 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground">{updates.data[0].action}</p>
                  {updates.data[0].detail && <p className="mt-1 text-sm text-muted-foreground">{updates.data[0].detail}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(updates.data[0].at)}</p>
                </>
              ) : (
                <Empty>Nothing published yet. Updates appear here as your file moves.</Empty>
              )}
            </Card>
          </div>
        )}

        {tab === "progress" && (
          <div className="space-y-3">
            {c.hasCreditOps && (
              <Card title="Credit repair" icon={CheckCircle2}>
                <Line label="Where it is" value={c.creditStatus ?? "Getting started"} />
                <Line label="Round" value={c.creditRound ?? "Not started"} />
              </Card>
            )}
            {c.hasFundingOps && (
              <Card title="Funding" icon={Building2}>
                <Line label="Where it is" value={c.fundingStatus ?? "Getting started"} />
                <Line label="Applications open" value={String(c.openFundingFiles)} />
              </Card>
            )}
            <Card title="Offers" icon={Building2}>
              {offers.isLoading ? <Busy /> : offers.data && offers.data.length > 0 ? (
                <ul className="space-y-3">
                  {offers.data.map((o) => (
                    <li key={o.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-bold text-foreground">
                        {o.amount != null ? `$${Number(o.amount).toLocaleString()}` : "Amount to be confirmed"}
                      </p>
                      {o.termText && <p className="text-xs text-muted-foreground">{o.termText}</p>}
                      {o.paymentAmount != null && (
                        <p className="text-xs text-muted-foreground">
                          ${Number(o.paymentAmount).toLocaleString()} {o.paymentFrequency ?? ""}
                        </p>
                      )}
                      {o.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Expires {formatDate(o.expiresAt)}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No offers to look at yet. They appear here once your team puts one in front of you.</Empty>
              )}
            </Card>
            {!c.hasCreditOps && !c.hasFundingOps && (
              <Empty>Nothing is running on your file yet.</Empty>
            )}
          </div>
        )}

        {tab === "documents" && (
          <Card title="Documents we need" icon={FileText}>
            {documents.isLoading ? <Busy /> : documents.data && documents.data.length > 0 ? (
              <ul className="space-y-2">
                {documents.data.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{d.documentType}</p>
                        {d.period && <p className="text-xs text-muted-foreground">{d.period}</p>}
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        d.status === "requested"
                          ? "bg-amber-500/15 text-amber-700"
                          : "bg-emerald-500/15 text-emerald-700",
                      )}>
                        {d.status === "requested" ? "Needed" : d.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Asked for {formatDate(d.requestedAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing is outstanding. We will ask here if we need something.</Empty>
            )}
          </Card>
        )}

        {tab === "updates" && (
          <Card title="Updates" icon={Megaphone}>
            {updates.isLoading ? <Busy /> : updates.data && updates.data.length > 0 ? (
              <ol className="space-y-3">
                {updates.data.map((u) => (
                  <li key={u.id} className="border-l-2 border-primary/40 pl-3">
                    <p className="text-sm font-semibold text-foreground">{u.action}</p>
                    {u.detail && <p className="text-sm text-muted-foreground">{u.detail}</p>}
                    <p className="text-xs text-muted-foreground">{formatDate(u.at)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>Nothing published yet.</Empty>
            )}
          </Card>
        )}

        {tab === "account" && <AccountTab name={c.fullName} reference={c.publicId} />}
      </main>

      {/* Bottom bar: a thumb reaches the bottom of a phone, not the top. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card" aria-label="Portal sections">
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  tab === key ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function AccountTab({ name, reference }: { name: string; reference: string }) {
  const auth = useAuth();
  return (
    <Card title="Your account" icon={UserRound}>
      <Line label="Name" value={name} />
      <Line label="Reference" value={reference} />
      <Line label="Signed in as" value={auth.user?.email ?? ""} />
      <p className="mt-3 text-xs text-muted-foreground">
        To change your name, address or phone number, message your team. They keep one record for you, so a change
        here reaches everyone working on your file.
      </p>
    </Card>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
  </div>
);

const Busy = () => (
  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </p>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);
