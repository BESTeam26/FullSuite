import { Link } from "react-router-dom";
import { Building2, History, Mail, MapPin, Phone, UserRound, Users } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { formatDate } from "@/lib/format-date";
import type { ClientActivityEntry, ClientProfile } from "@/lib/data/clients";
import { ServiceBadge } from "@/components/clients/directory/ServiceBadge";

const Card = ({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {action}
    </div>
    {children}
  </div>
);

const Row = ({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) => (
  <p className="flex items-start gap-2 py-1 text-sm text-foreground">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <span>{children}</span>
  </p>
);

/**
 * The overview answers "who is this and what do we do for them" without
 * opening any of the work. Every card here is a summary with a way through to
 * the record that owns it.
 */
export const OverviewPanel = ({
  client,
  activity,
  onOpenTab,
}: {
  client: ClientProfile;
  activity: UseQueryResult<ClientActivityEntry[]>;
  onOpenTab: (tab: "Businesses" | "Services & Plans" | "Activity") => void;
}) => {
  const addressParts = [
    client.address.line1,
    client.address.line2,
    [client.address.city, client.address.state].filter(Boolean).join(", "),
    client.address.postalCode,
  ].filter(Boolean);
  const recent = (activity.data ?? []).slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Contact" icon={UserRound}>
        <Row icon={Mail}>{client.email}</Row>
        <Row icon={Phone}>{client.phone ?? "No phone on file"}</Row>
        <Row icon={MapPin}>{addressParts.length > 0 ? addressParts.join(" · ") : "No address on file"}</Row>
        {client.dateOfBirth && (
          <p className="mt-2 text-xs text-muted-foreground">
            Date of birth on file. Shown in full under Personal Info, to the people permitted to
            edit identity.
          </p>
        )}
      </Card>

      <Card
        title="Services & subscriptions"
        icon={Users}
        action={
          <button
            type="button"
            onClick={() => onOpenTab("Services & Plans")}
            className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Manage
          </button>
        }
      >
        <ul className="space-y-2">
          {client.services.map((s) => (
            <li key={s.service} className="flex flex-wrap items-center justify-between gap-2">
              <ServiceBadge service={s} showState />
              {s.href ? (
                <Link
                  to={s.href}
                  className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">{s.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Businesses"
        icon={Building2}
        action={
          client.businesses.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenTab("Businesses")}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              All {client.businesses.length}
            </button>
          ) : undefined
        }
      >
        {client.businesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {client.businesses.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{b.name}</span>
                <span className="text-xs text-muted-foreground">
                  {b.fundingFileCount} funding file{b.fundingFileCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Assignments" icon={Users}>
        {client.assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody assigned. Assignment happens on the work, not on the person — a client can have a
            different owner in CreditOps and FundingOps.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {client.assigned.map((a) => (
              <li key={a} className="text-sm text-foreground">
                {a}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="lg:col-span-2">
        <Card
          title="Recent activity"
          icon={History}
          action={
            <button
              type="button"
              onClick={() => onOpenTab("Activity")}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Full history
            </button>
          }
        >
          {activity.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing visible to you yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-foreground">{e.action}</span>
                  {e.detail && <span className="text-muted-foreground">{e.detail}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {e.actorName ?? "System"} · {formatDate(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
