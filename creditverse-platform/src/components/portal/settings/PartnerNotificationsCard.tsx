/**
 * What BES sends the partner, and where (PARTNER_PORTAL_DOCTRINE.md, Account
 * Settings: "Notification preferences").
 *
 * Honest by construction: it lists only what is actually delivered today —
 * billing email to the billing contact (the same my_partner_billing_contact()
 * rule the billing mail uses, and the same cached request as Billing
 * settings), agreements emailed to the signer, and the portal's own badges.
 * There are no on/off switches because there is nothing yet for a switch to
 * control; a toggle that changed nothing would be a dishonest control
 * (rule 12). Email alerts for messages and actions are a recorded backlog
 * item, not a hidden feature.
 */
import { useQuery } from "@tanstack/react-query";
import { Bell, Mail, MessageSquare, FileSignature } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchPortalBillingContact } from "@/lib/data/portal-billing";

export function PartnerNotificationsCard() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const billingContact = useQuery({
    queryKey: ["portal", "billing", "contact"], queryFn: fetchPortalBillingContact,
    enabled: live, staleTime: 5 * 60_000,
  });
  const billingTo = billingContact.data
    ? [billingContact.data.name, billingContact.data.email].filter(Boolean).join(" · ")
    : billingContact.isPending ? "Loading…" : "No billing contact recorded";

  const Line = ({ icon: Icon, title, detail }: { icon: typeof Mail; title: string; detail: React.ReactNode }) => (
    <li className="flex items-start gap-2 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{title}</span>
        <span className="block break-words text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </li>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Bell className="h-3.5 w-3.5" /> Notifications
      </h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">What BES sends you, and where it goes.</p>
      <ul className="mt-1 divide-y divide-border/50">
        <Line icon={Mail} title="Invoices, payment reminders and receipts — by email"
          detail={<>Sent to {billingTo}. To change it, <Link to="/partner/messages?topic=billing" className="font-medium text-primary hover:underline">message Billing</Link>.</>} />
        <Line icon={FileSignature} title="Agreements to sign — by email"
          detail="Sent to the person who needs to sign, and listed on Agreements." />
        <Line icon={MessageSquare} title="New messages and actions needed — here in the portal"
          detail="Shown on the message and bell icons at the top of every page. Email alerts for these are not available yet." />
      </ul>
    </section>
  );
}
