/**
 * Meetings, from inside the conversation.
 *
 * ── WHAT THIS DOES TODAY, SAID PLAINLY ─────────────────────────────────────
 *
 * Neither Google nor Zoom is connected: BES has no OAuth credentials for
 * either yet. Rule 19 is explicit about what that means — "Where a key is
 * missing the feature says it is not connected. It does not fall back to a
 * stub, a sample, or a second provider."
 *
 * So the control is here, it is honest, and it routes an administrator to the
 * place where connecting happens. Dee, §66: "do not show a broken error...
 * 'No meeting provider is connected. Ask an Agency administrator.'"
 *
 * The schema behind it is complete (0202): a canonical `meetings` row per
 * meeting, the channel it belongs to, the provider's own id, the calendar
 * event and the PARTICIPANT join link — and deliberately no column anywhere
 * for Zoom's host `start_url` (§61). When the credentials arrive, what is
 * missing is the Edge Function that calls the provider, not the model.
 */
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Video } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface MeetingProviderState {
  provider: "google_meet" | "zoom";
  connected: boolean;
  accountLabel: string | null;
}

async function fetchMeetingProviders(agencyId: string): Promise<MeetingProviderState[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("agency_meeting_providers")
    .select("provider, connected, account_label").eq("agency_id", agencyId);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    provider: p.provider as MeetingProviderState["provider"],
    connected: !!p.connected,
    accountLabel: p.account_label ?? null,
  }));
}

export function useMeetingProviders() {
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  return useQuery({
    queryKey: ["meeting-providers", agencyId],
    queryFn: () => fetchMeetingProviders(agencyId),
    enabled: !!agencyId,
    staleTime: 300_000,
  });
}

export function MeetingPanel({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const providers = useMeetingProviders();
  const connected = (providers.data ?? []).filter((p) => p.connected);

  return (
    <div className="border-t border-border bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Video className="h-3.5 w-3.5" /> Meeting
      </p>

      {providers.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : connected.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">No meeting provider is connected.</p>
          {auth.isAgencyAdmin ? (
            <p className="text-xs text-muted-foreground">
              Connect Google Workspace or Zoom in{" "}
              <Link to="/app/settings?section=integrations"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Agency Settings → Integrations <ExternalLink className="h-3 w-3" />
              </Link>
              . Meetings created here will then appear in this conversation and on the agency calendar.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ask an agency administrator to connect Google Workspace or Zoom.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {connected.map((p) => (p.provider === "zoom" ? "Zoom" : "Google Meet")).join(" and ")} connected.
        </p>
      )}

      <button type="button" onClick={onClose}
        className="mt-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Close
      </button>
    </div>
  );
}
