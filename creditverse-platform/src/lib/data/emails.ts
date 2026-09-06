/**
 * The two emails the app asks the server to send.
 *
 * Both go through Edge Functions, because the mail provider's key lives on the
 * server and the decision about whether an email may be sent belongs with the
 * data, not the browser. Both answer honestly when email is not connected, so
 * a screen can say "copy the link instead" rather than implying a message went
 * out.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type EmailOutcome =
  | { status: "sent"; message?: undefined }
  | { status: "already_sent"; message?: undefined }
  | { status: "not_connected"; message: string }
  | { status: "error"; message: string };

async function invoke(fn: string, body: Record<string, unknown>): Promise<EmailOutcome> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const parsed = (await ctx.json()) as { error?: string; code?: string };
        if (parsed.code === "not_connected") {
          return { status: "not_connected", message: parsed.error ?? "Email is not connected yet." };
        }
        return { status: "error", message: parsed.error ?? error.message };
      } catch {
        /* fall through to the generic message */
      }
    }
    return { status: "error", message: error.message };
  }
  const result = data as { sent?: boolean; reason?: string } | null;
  if (result?.sent === false && result.reason === "already_sent") return { status: "already_sent" };
  return { status: "sent" };
}

/** The branded "activate your account" email for an open invitation. */
export function sendInvitationEmail(invitationId: string): Promise<EmailOutcome> {
  return invoke("send-invitation", { invitationId, appOrigin: window.location.origin });
}

/** The one-time welcome, once an organization's workspace exists. */
export function sendWelcomeEmail(organizationId: string): Promise<EmailOutcome> {
  return invoke("send-welcome", { organizationId, appOrigin: window.location.origin });
}
