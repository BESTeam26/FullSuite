/**
 * Sends the welcome email the first time an organization's own administrator
 * opens their workspace.
 *
 * Why here and not in the database: the workspace is created by a trigger when
 * the email is confirmed, and a Postgres trigger cannot make an HTTP call
 * without an extension this project does not use. The first sign-in is also a
 * better moment — it means the person actually arrived.
 *
 * Sent at most once. The Edge Function stamps `welcome_email_sent_at` and
 * refuses a second send, so two tabs, a refresh, or a retry cannot produce two
 * emails; this component only asks. It renders nothing and never reports a
 * failure to the person — a welcome that did not send is not their problem,
 * and the function logs it.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { sendWelcomeEmail } from "@/lib/data/emails";

export function WelcomeEmailOnce({ organizationId }: { organizationId: string | null }) {
  const auth = useAuth();
  const asked = useRef<string | null>(null);
  const isOrgAdmin = auth.orgMemberships.some(
    (m) => m.organization_id === organizationId && m.role === "org_admin",
  );

  useEffect(() => {
    if (!organizationId || !isOrgAdmin) return;
    if (auth.mode !== "live" || auth.status !== "signed-in") return;
    /* Once per organization per browser session. The server owns the real
       guard; this only stops a reload from re-asking, which matters when email
       is not connected and every ask is a wasted round trip. */
    if (asked.current === organizationId) return;
    asked.current = organizationId;
    const key = `bes.welcome-asked.${organizationId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* Private browsing can refuse storage; asking again is harmless. */
    }
    void sendWelcomeEmail(organizationId);
  }, [organizationId, isOrgAdmin, auth.mode, auth.status]);

  return null;
}
